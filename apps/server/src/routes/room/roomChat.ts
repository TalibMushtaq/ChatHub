import type { Server, Socket } from "socket.io";
import { assertRoomAccess } from "../../middleware/socketAccess";
import { prisma } from "../../../db/prisma";
import { chatRoomMessageSchema } from "@repo/validators";
import { MessageType } from "@prisma/client";
import { S3Service, buildS3ConfigFromEnv } from "../../services/S3Service";
import { verifyAttachmentsForMessage } from "../../services/attachment/verifyForMessage";
import { transitionAttachmentsToAttached } from "../../services/attachment/transitionToAttached";
import { checkIdempotency, storeIdempotency } from "../../services/idempotency";
import { ApiError } from "../../lib/ApiError";

let s3ServiceInstance: S3Service | null = null;
function getS3Service(): S3Service {
  if (!s3ServiceInstance) {
    const config = buildS3ConfigFromEnv();
    if (!config) {
      throw new ApiError(
        "S3 storage is not configured",
        503,
        "S3_NOT_CONFIGURED",
      );
    }
    s3ServiceInstance = new S3Service(config);
  }
  return s3ServiceInstance;
}

/**
 * Registers chat room socket handlers.
 *
 * Improvements:
 * - Room membership is cached in socket.data.rooms on join, so subsequent
 *   messages don't hit the database for access checks.
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

  // Initialize room cache on socket
  if (!socket.data.rooms) {
    socket.data.rooms = new Set<string>();
  }

  // JOIN
  socket.on("chatroom:join", async ({ chatRoomId }) => {
    try {
      if (typeof chatRoomId !== "string") {
        throw new Error("Invalid room id");
      }

      await assertRoomAccess(userId, chatRoomId);

      // Cache membership so future messages skip the DB check
      socket.data.rooms.add(chatRoomId);

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
  socket.on("chatroom:message", async ({ payload, callback }) => {
    if (typeof callback !== "function") {
      socket.emit("chatroom:error", {
        code: "INVALID_CALLBACK",
        message: "callback must be a function",
      });
      return;
    }

    try {
      const result = chatRoomMessageSchema.safeParse(payload);
      if (!result.success) {
        callback({
          ok: false,
          error: result.error.issues[0]?.message ?? "Invalid payload",
        });
        return;
      }
      const data = result.data;

      // Use cached membership instead of hitting the DB on every message
      if (!socket.data.rooms.has(data.chatRoomId)) {
        await assertRoomAccess(userId, data.chatRoomId);
        socket.data.rooms.add(data.chatRoomId);
      }

      const s3Service = getS3Service();

      // Idempotency check (outside transaction)
      if (data.idempotencyKey) {
        const existingId = await checkIdempotency(userId, data.idempotencyKey);
        if (existingId) {
          const existing = await prisma.message.findUnique({
            where: { id: existingId },
            select: {
              id: true,
              content: true,
              senderId: true,
              chatRoomId: true,
              messageType: true,
              createdAt: true,
              attachments: {
                select: {
                  id: true,
                  filename: true,
                  mimeType: true,
                  size: true,
                  width: true,
                  height: true,
                  thumbnailKey: true,
                },
              },
            },
          });
          if (existing) {
            io.to(`room:${data.chatRoomId}`).emit("chatroom:message", existing);
            callback({ ok: true, message: existing });
            return;
          }
        }
      }

      // Create message and update lastMessageAt atomically
      const message = await prisma.$transaction(async (tx) => {
        if (data.attachmentIds && data.attachmentIds.length > 0) {
          await verifyAttachmentsForMessage(
            tx,
            s3Service,
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
          select: {
            id: true,
            content: true,
            senderId: true,
            chatRoomId: true,
            messageType: true,
            createdAt: true,
            attachments: {
              select: {
                id: true,
                filename: true,
                mimeType: true,
                size: true,
                width: true,
                height: true,
                thumbnailKey: true,
              },
            },
          },
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
      callback({ ok: true, message });
    } catch (err: any) {
      if (err instanceof ApiError) {
        callback({ ok: false, error: err.message, code: err.code });
      } else {
        callback({ ok: false, error: "Server error" });
      }
    }
  });
}
