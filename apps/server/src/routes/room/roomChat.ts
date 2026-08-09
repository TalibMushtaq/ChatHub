import type { Server, Socket } from "socket.io";
import { assertRoomAccess } from "../../middleware/socketAccess";
import { prisma } from "../../../db/prisma";
import {
  chatRoomMessageSchema,
  chatRoomEditMessageSchema,
  chatRoomDeleteMessageSchema,
} from "@repo/validators";
import { MessageType } from "@prisma/client";
import type { S3Service } from "../../services/S3Service";
import { verifyAttachmentsForMessage } from "../../services/attachment/verifyForMessage";
import { transitionAttachmentsToAttached } from "../../services/attachment/transitionToAttached";
import { checkIdempotency, storeIdempotency } from "../../services/idempotency";
import { editMessage } from "../../services/room/editMessage";
import { deleteMessage } from "../../services/room/deleteMessage";
import { getRequiredS3Service } from "../../lib/s3";
import { onAck } from "../../lib/socketAck";
import { messageWithAttachmentsSelect } from "../../constants/room";

// How long a room membership check stays cached on a socket. Bounds the
// window in which a user removed from a room can keep using it.
const ROOM_ACCESS_TTL_MS = 60_000;

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
  // cached check expires.
  async function ensureRoomAccess(chatRoomId: string): Promise<void> {
    const expiresAt = socket.data.rooms.get(chatRoomId);
    if (expiresAt !== undefined && expiresAt > Date.now()) return;

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
    } catch (err: any) {
      socket.emit("chatroom:error", {
        code: "JOIN_FAILED",
        message: err.message,
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

        return msg;
      });

      // Store idempotency key after transaction succeeds
      if (data.idempotencyKey) {
        await storeIdempotency(userId, data.idempotencyKey, message.id);
      }

      io.to(`room:${data.chatRoomId}`).emit("chatroom:message", message);
      ack({ ok: true, message });
    },
  );

  // Edit message
  onAck(
    socket,
    "chatroom:message:edit",
    chatRoomEditMessageSchema,
    async (data, ack) => {
      await ensureRoomAccess(data.chatRoomId);

      const updated = await editMessage(userId, data.messageId, data.content);

      io.to(`room:${data.chatRoomId}`).emit("chatroom:message:edited", {
        messageId: updated.id,
        chatRoomId: updated.chatRoomId,
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
      await ensureRoomAccess(data.chatRoomId);

      const deleted = await deleteMessage(userId, data.messageId);

      io.to(`room:${data.chatRoomId}`).emit("chatroom:message:deleted", {
        messageId: deleted.id,
        chatRoomId: deleted.chatRoomId,
        deletedAt: deleted.deletedAt,
      });

      ack({ ok: true });
    },
  );
}
