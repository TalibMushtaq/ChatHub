import type { Server, Socket } from "socket.io";
import { assertRoomAccess } from "../../middleware/socketAccess";
import { prisma } from "../../../db/prisma";
import {
  chatRoomMessageSchema,
  chatRoomEditMessageSchema,
  chatRoomDeleteMessageSchema,
  chatRoomTypingSchema,
} from "@repo/validators";
import { MessageType } from "@prisma/client";
import type { S3Service } from "../../services/S3Service";
import { verifyAttachmentsForMessage } from "../../services/attachment/verifyForMessage";
import { transitionAttachmentsToAttached } from "../../services/attachment/transitionToAttached";
import { checkIdempotency, storeIdempotency } from "../../services/idempotency";
import { editMessage } from "../../services/room/editMessage";
import { deleteMessage } from "../../services/room/deleteMessage";
import { ApiError } from "../../lib/ApiError";
import { createLogger } from "../../lib/logger";
import { getOptionalS3Service, getRequiredS3Service } from "../../lib/s3";
import { deleteMessageAttachments } from "../../services/attachment/deleteMessageAttachments";
import { onAck } from "../../lib/socketAck";
import { pushNewMessage } from "../../services/push/push";
import { createMessageMentions } from "../../services/room/mentions";
import {
  messageWithAttachmentsSelect,
  toRoomMessagePayload,
} from "../../constants/room";

const log = createLogger("roomChat");

// How long a room membership check stays cached on a socket. Bounds the
// window in which a user removed from a room can keep using it.
const ROOM_ACCESS_TTL_MS = 60_000;

// Same anti-spam window as DMs; typing is high-frequency by nature so the
// server drops redundant "start" events while the client keeps re-emitting.
const TYPING_THROTTLE_MS = 1500;

/**
 * Resolve a room's default channel id (#general) for senders that don't yet
 * send an explicit channelId (the pre-Phase-2 UI). Every room is guaranteed
 * to have one by the channels migration and by POST /rooms seeding.
 */
async function resolveDefaultChannelId(roomId: string): Promise<string> {
  const channel = await prisma.channel.findFirst({
    where: { roomId, name: "general" },
    select: { id: true },
  });
  if (!channel) {
    throw new ApiError("Room has no #general channel", 500, "CHANNEL_MISSING");
  }
  return channel.id;
}

/**
 * Registers chat room socket handlers.
 *
 * Improvements:
 * - Room membership is cached in socket.data.rooms on join, so subsequent
 *   messages don't hit the database for access checks until the cache entry
 *   expires.
 * - Standardized event names: all lowercase "chatroom:*".
 * - Payloads use `roomId` (normalized) and messages carry `channelId` so the
 *   client can route them to the right channel without extra lookups.
 * - message.create now uses explicit select to avoid exposing extra fields.
 * - Updates ChatRoom.lastMessageAt on every message for accurate inbox ordering.
 * - Full attachment support with transactional linking.
 */
export function registerRoomChat(io: Server, socket: Socket) {
  const { user } = socket.data;
  const userId = user.id;

  // Room cache: roomId -> timestamp at which the cached membership check
  // expires and must be re-verified against the database.
  if (!socket.data.rooms) {
    socket.data.rooms = new Map<string, number>();
  }

  // Use cached membership instead of hitting the DB on every event, until the
  // cached check expires. Destructive events (edit/delete) pass bypassCache so
  // a user removed from a room loses write access immediately instead of
  // riding out the remaining TTL.
  async function ensureRoomAccess(
    roomId: string,
    opts: { bypassCache?: boolean } = {},
  ): Promise<void> {
    const expiresAt = socket.data.rooms.get(roomId);
    if (
      !opts.bypassCache &&
      expiresAt !== undefined &&
      expiresAt > Date.now()
    ) {
      return;
    }

    await assertRoomAccess(userId, roomId);
    socket.data.rooms.set(roomId, Date.now() + ROOM_ACCESS_TTL_MS);
  }

  // JOIN
  socket.on("chatroom:join", async ({ roomId }) => {
    try {
      if (typeof roomId !== "string") {
        throw new Error("Invalid room id");
      }

      await assertRoomAccess(userId, roomId);

      // Cache membership so future messages skip the DB check until the TTL
      // expires.
      socket.data.rooms.set(roomId, Date.now() + ROOM_ACCESS_TTL_MS);

      socket.join(`room:${roomId}`);
      socket.emit("chatroom:joined", { roomId });
    } catch (err: unknown) {
      const expected = err instanceof ApiError;
      if (!expected) {
        log.error("chatroom:join failed", err, { userId, roomId });
      }
      socket.emit("chatroom:error", {
        code: expected ? (err.code ?? "JOIN_FAILED") : "JOIN_FAILED",
        message: expected ? err.message : "Failed to join room",
      });
      socket.disconnect(true);
    }
  });

  // LEAVE
  socket.on("chatroom:leave", ({ roomId }) => {
    if (typeof roomId !== "string") return;

    socket.data.rooms.delete(roomId);
    socket.leave(`room:${roomId}`);
    socket.emit("chatroom:left", { roomId });
  });

  // Typing indicator — broadcast to everyone except the sender.
  socket.on("chatroom:typing", async (payload: unknown) => {
    const parsed = chatRoomTypingSchema.safeParse(payload);
    if (!parsed.success) return;
    const { roomId, isTyping } = parsed.data;
    // Privacy gate: a user who disabled typing visibility never emits typing
    // events (start or stop), so receivers never see a stale indicator.
    if (user.showTypingStatus === false) return;
    try {
      await ensureRoomAccess(roomId);
      const throttle = (socket.data.typingThrottle ??= new Map());
      const now = Date.now();
      if (isTyping && now - (throttle.get(roomId) ?? 0) < TYPING_THROTTLE_MS) {
        return;
      }
      throttle.set(roomId, now);
      socket.broadcast.to(`room:${roomId}`).emit("chatroom:typing", {
        userId,
        username: user.username,
        roomId,
        isTyping,
      });
    } catch (err: unknown) {
      if (!(err instanceof ApiError)) {
        log.error("chatroom:typing failed", err, { userId, roomId });
      }
      socket.emit("chatroom:error", {
        code:
          err instanceof ApiError ? (err.code ?? "JOIN_FAILED") : "JOIN_FAILED",
        message:
          err instanceof ApiError ? err.message : "Failed to broadcast typing",
      });
    }
  });

  // Messages
  onAck(
    socket,
    "chatroom:message",
    chatRoomMessageSchema,
    async (data, ack) => {
      await ensureRoomAccess(data.roomId);

      // Messages are pinned to a channel. Before Phase 2 sends an explicit
      // channelId, resolve a missing one to the room's #general channel so the
      // pre-channels UI keeps working; when provided, verify the channel lives
      // in this room so a member can't inject into another room's channel.
      const resolvedChannelId =
        data.channelId ?? (await resolveDefaultChannelId(data.roomId));
      const channel = await prisma.channel.findFirst({
        where: { id: resolvedChannelId, roomId: data.roomId },
        select: { id: true },
      });
      if (!channel) {
        throw new ApiError(
          "Channel does not belong to this room",
          400,
          "BAD_REQUEST",
        );
      }

      const hasAttachments =
        data.attachmentIds && data.attachmentIds.length > 0;

      // Only initialize S3 when attachments are present — text-only messages
      // work without S3 configuration.
      const s3Service: S3Service | null = hasAttachments
        ? getRequiredS3Service("File uploads require S3 configuration")
        : null;

      // Idempotency check (outside transaction)
      if (data.idempotencyKey) {
        const existingId = await checkIdempotency(userId, data.idempotencyKey);
        if (existingId) {
          const existing = await prisma.message.findUnique({
            where: { id: existingId },
            select: messageWithAttachmentsSelect,
          });
          if (existing) {
            io.to(`room:${data.roomId}`).emit(
              "chatroom:message",
              toRoomMessagePayload(existing),
            );
            ack({ ok: true, message: toRoomMessagePayload(existing) });
            return;
          }
        }
      }

      // Create message and update lastMessageAt atomically
      const message = await prisma.$transaction(async (tx) => {
        if (data.attachmentIds && data.attachmentIds.length > 0) {
          await verifyAttachmentsForMessage(
            tx,
            s3Service as S3Service,
            data.attachmentIds,
            userId,
          );
        }

        const msg = await tx.message.create({
          data: {
            content: data.content ?? null,
            senderId: userId,
            chatRoomId: data.roomId,
            channelId: channel.id,
            messageType: data.messageType as MessageType,
          },
          select: messageWithAttachmentsSelect,
        });

        if (data.attachmentIds && data.attachmentIds.length > 0) {
          await transitionAttachmentsToAttached(tx, data.attachmentIds, msg.id);
        }

        await tx.chatRoom.update({
          where: { id: data.roomId },
          data: { lastMessageAt: new Date() },
        });

        // Re-fetch with linked attachments so the socket broadcast and ack
        // response carry the complete message (the create() result has []).
        const updated = await tx.message.findUnique({
          where: { id: msg.id },
          select: messageWithAttachmentsSelect,
        });

        // The message was just created above in the same transaction.
        if (!updated) throw new Error("Message disappeared after creation");

        return updated;
      });

      // Store idempotency key after transaction succeeds
      if (data.idempotencyKey) {
        await storeIdempotency(userId, data.idempotencyKey, message.id);
      }

      const payload = toRoomMessagePayload(message);

      io.to(`room:${data.roomId}`).emit("chatroom:message", payload);

      // Detect @-mentions (Phase 6 §10.1) and notify each mentioned member via
      // a targeted socket event so their sidebar can light up the Mentioned
      // badge even when the room isn't focused. Best-effort: a mention-parse
      // failure must never fail the message send.
      let mentionedUserIds: string[] = [];
      try {
        const mentioned = await createMessageMentions({
          messageId: message.id,
          roomId: data.roomId,
          channelId: channel.id,
          senderId: userId,
          content: data.content,
        });
        mentionedUserIds = mentioned.map((m) => m.userId);
        for (const m of mentioned) {
          io.to(`user:${m.userId}`).emit("mention:new", {
            messageId: message.id,
            roomId: data.roomId,
            channelId: channel.id,
            senderId: userId,
            senderName: user.displayName ?? user.username,
            content: message.content,
          });
        }
      } catch (err) {
        log.error("mention detection failed", err, {
          userId,
          roomId: data.roomId,
        });
      }

      // Fire-and-forget OS notifications to the other room members via Web
      // Push. A push failure must never fail a message the sender already saw
      // deliver. SYSTEM messages are filtered inside pushNewMessage.
      void pushNewMessage({
        kind: "room",
        conversationId: data.roomId,
        messageId: message.id,
        senderId: userId,
        senderName: user.displayName ?? user.username,
        messageType: message.messageType,
        content: message.content,
        mentionedUserIds,
      });

      ack({ ok: true, message: payload });
    },
  );

  // Edit message
  onAck(
    socket,
    "chatroom:message:edit",
    chatRoomEditMessageSchema,
    async (data, ack) => {
      // Edit is destructive — bypass the membership cache so a revoked user
      // cannot keep editing during the TTL window.
      await ensureRoomAccess(data.roomId, { bypassCache: true });

      const updated = await editMessage(
        userId,
        data.roomId,
        data.messageId,
        data.content,
      );

      io.to(`room:${data.roomId}`).emit("chatroom:message:edited", {
        messageId: updated.id,
        roomId: data.roomId,
        content: updated.content,
        editedAt: updated.editedAt,
      });

      ack({ ok: true, message: updated });
    },
  );

  // Delete message
  onAck(
    socket,
    "chatroom:message:delete",
    chatRoomDeleteMessageSchema,
    async (data, ack) => {
      // Delete is destructive — bypass the membership cache so a revoked user
      // cannot keep deleting during the TTL window.
      await ensureRoomAccess(data.roomId, { bypassCache: true });

      const deleted = await deleteMessage(userId, data.roomId, data.messageId);

      io.to(`room:${data.roomId}`).emit("chatroom:message:deleted", {
        messageId: deleted.id,
        roomId: data.roomId,
        deletedAt: deleted.deletedAt,
      });

      // Permanently purge the message's attachments; best-effort so a storage
      // failure can't roll back the delete the user already confirmed.
      await deleteMessageAttachments(
        getOptionalS3Service(),
        (deleted.attachments ?? []).map((a) => a.id),
        userId,
      );

      ack({ ok: true });
    },
  );
}
