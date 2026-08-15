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
import { messageWithAttachmentsSelect } from "../../constants/room";

const log = createLogger("roomChat");

// How long a room membership check stays cached on a socket. Bounds the
// window in which a user removed from a room can keep using it.
const ROOM_ACCESS_TTL_MS = 60_000;

// Same anti-spam window as DMs; typing is high-frequency by nature so the
// server drops redundant "start" events while the client keeps re-emitting.
const TYPING_THROTTLE_MS = 1500;

/**
 * Registers chat room socket handlers.
 *
 * Improvements:
 * - Room membership is cached in socket.data.rooms on join, so subsequent
 *   messages don't hit the database for access checks until the cache entry
 *   expires.
 * - Fixed typo: "paylaod" -> "payload".
 * - Standardized event names: all lowercase "chatroom:*" (was mixed casing).
 * - Replaced generic socket.emit("error") with chatroom:error event.
 * - message.create now uses explicit select to avoid exposing extra fields.
 * - Updates ChatRoom.lastMessageAt on every message for accurate inbox ordering.
 * - Full attachment support with transactional linking.
 */
export function registerRoomChat(io: Server, socket: Socket) {
  const { user } = socket.data;
  const userId = user.id;

  // Room cache: chatRoomId -> timestamp at which the cached membership check
  // expires and must be re-verified against the database.
  if (!socket.data.rooms) {
    socket.data.rooms = new Map<string, number>();
  }

  // Use cached membership instead of hitting the DB on every event, until the
  // cached check expires. Destructive events (edit/delete) pass bypassCache so
  // a user removed from a room loses write access immediately instead of
  // riding out the remaining TTL.
  async function ensureRoomAccess(
    chatRoomId: string,
    opts: { bypassCache?: boolean } = {},
  ): Promise<void> {
    const expiresAt = socket.data.rooms.get(chatRoomId);
    if (
      !opts.bypassCache &&
      expiresAt !== undefined &&
      expiresAt > Date.now()
    ) {
      return;
    }

    await assertRoomAccess(userId, chatRoomId);
    socket.data.rooms.set(chatRoomId, Date.now() + ROOM_ACCESS_TTL_MS);
  }

  // JOIN
  socket.on("chatroom:join", async ({ chatRoomId }) => {
    try {
      if (typeof chatRoomId !== "string") {
        throw new Error("Invalid room id");
      }

      await assertRoomAccess(userId, chatRoomId);

      // Cache membership so future messages skip the DB check until the TTL
      // expires.
      socket.data.rooms.set(chatRoomId, Date.now() + ROOM_ACCESS_TTL_MS);

      socket.join(`room:${chatRoomId}`);
      socket.emit("chatroom:joined", { chatRoomId });
    } catch (err: unknown) {
      const expected = err instanceof ApiError;
      if (!expected) {
        log.error("chatroom:join failed", err, { userId, chatRoomId });
      }
      socket.emit("chatroom:error", {
        code: expected ? (err.code ?? "JOIN_FAILED") : "JOIN_FAILED",
        message: expected ? err.message : "Failed to join room",
      });
      socket.disconnect(true);
    }
  });

  // LEAVE
  socket.on("chatroom:leave", ({ chatRoomId }) => {
    if (typeof chatRoomId !== "string") return;

    socket.data.rooms.delete(chatRoomId);
    socket.leave(`room:${chatRoomId}`);
    socket.emit("chatroom:left", { chatRoomId });
  });

  // Typing indicator — broadcast to everyone except the sender.
  socket.on("chatroom:typing", async (payload: unknown) => {
    const parsed = chatRoomTypingSchema.safeParse(payload);
    if (!parsed.success) return;
    const { chatRoomId, isTyping } = parsed.data;
    // Privacy gate: a user who disabled typing visibility never emits typing
    // events (start or stop), so receivers never see a stale indicator.
    if (user.showTypingStatus === false) return;
    try {
      await ensureRoomAccess(chatRoomId);
      const throttle = (socket.data.typingThrottle ??= new Map());
      const now = Date.now();
      if (
        isTyping &&
        now - (throttle.get(chatRoomId) ?? 0) < TYPING_THROTTLE_MS
      ) {
        return;
      }
      throttle.set(chatRoomId, now);
      socket.broadcast.to(`room:${chatRoomId}`).emit("chatroom:typing", {
        userId,
        username: user.username,
        chatRoomId,
        isTyping,
      });
    } catch (err: unknown) {
      if (!(err instanceof ApiError)) {
        log.error("chatroom:typing failed", err, { userId, chatRoomId });
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
      await ensureRoomAccess(data.chatRoomId);

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
            io.to(`room:${data.chatRoomId}`).emit("chatroom:message", existing);
            ack({ ok: true, message: existing });
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
            chatRoomId: data.chatRoomId,
            messageType: data.messageType as MessageType,
          },
          select: messageWithAttachmentsSelect,
        });

        if (data.attachmentIds && data.attachmentIds.length > 0) {
          await transitionAttachmentsToAttached(tx, data.attachmentIds, msg.id);
        }

        await tx.chatRoom.update({
          where: { id: data.chatRoomId },
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

      io.to(`room:${data.chatRoomId}`).emit("chatroom:message", message);

      // Fire-and-forget OS notifications to the other room members via Web
      // Push. A push failure must never fail a message the sender already saw
      // deliver. SYSTEM messages are filtered inside pushNewMessage.
      void pushNewMessage({
        kind: "room",
        conversationId: data.chatRoomId,
        messageId: message.id,
        senderId: userId,
        senderName: user.displayName ?? user.username,
        messageType: message.messageType,
        content: message.content,
      });

      ack({ ok: true, message });
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
      await ensureRoomAccess(data.chatRoomId, { bypassCache: true });

      const updated = await editMessage(
        userId,
        data.chatRoomId,
        data.messageId,
        data.content,
      );

      io.to(`room:${data.chatRoomId}`).emit("chatroom:message:edited", {
        messageId: updated.id,
        chatRoomId: data.chatRoomId,
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
      await ensureRoomAccess(data.chatRoomId, { bypassCache: true });

      const deleted = await deleteMessage(
        userId,
        data.chatRoomId,
        data.messageId,
      );

      io.to(`room:${data.chatRoomId}`).emit("chatroom:message:deleted", {
        messageId: deleted.id,
        chatRoomId: data.chatRoomId,
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
