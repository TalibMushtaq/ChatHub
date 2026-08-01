import type { Server, Socket } from "socket.io";
import { assertRoomAccess } from "../../middleware/socketAccess";
import { prisma } from "../../../db/prisma";
import { chatRoomMessageSchema } from "@repo/validators";

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

      // Create message and update lastMessageAt atomically
      const [message] = await prisma.$transaction([
        prisma.message.create({
          data: {
            content: data.content,
            senderId: userId,
            chatRoomId: data.chatRoomId,
            messageType: data.type,
            ...(data.type === "FILE" && {
              fileUrl: data.fileUrl,
              fileName: data.fileName,
              fileSize: data.fileSize,
            }),
          },
          select: {
            id: true,
            content: true,
            senderId: true,
            chatRoomId: true,
            messageType: true,
            fileUrl: true,
            fileName: true,
            fileSize: true,
            createdAt: true,
          },
        }),
        prisma.chatRoom.update({
          where: { id: data.chatRoomId },
          data: { lastMessageAt: new Date() },
        }),
      ]);

      io.to(`room:${data.chatRoomId}`).emit("chatroom:message", message);
      callback({ ok: true, message });
    } catch (err: any) {
      callback({ ok: false, error: "Server error" });
    }
  });
}
