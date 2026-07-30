import type { Server, Socket } from "socket.io";
import { assertRoomAccess } from "../../middleware/socketAccess";
import { prisma } from "../../../db/prisma";
import { chatRoomMessageSchema } from "@repo/validators";

export function registerRoomChat(io: Server, socket: Socket) {
  const user = (socket.request as any).user;

  // JOIN
  socket.on("chatRoom:join", async ({ chatRoomId }) => {
    try {
      if (typeof chatRoomId !== "string") {
        throw new Error("Invalid room id");
      }

      await assertRoomAccess(user.id, chatRoomId);

      socket.join(`room:${chatRoomId}`);
      socket.emit("chatroom:joined", { chatRoomId });
    } catch (err: any) {
      socket.emit("error", err.message);
      socket.disconnect(true);
    }
  });

  // Messages
  socket.on("chatroom:message", async ({ paylaod, callback }) => {
    if (typeof callback !== "function") {
      socket.emit("error", "callback must be a function");
      return;
    }

    try {
      const user = (socket.request as any).user;
      const result = chatRoomMessageSchema.safeParse(paylaod);
      if (!result.success) {
        socket.emit("error", "invalid paylaod");
        callback({ ok: false, error: "invalid payload" });
        return;
      }
      const data = result.data;

      await assertRoomAccess(user.id, data.chatRoomId);

      const message = await prisma.message.create({
        data: {
          content: data.content,
          senderId: user.id,
          chatRoomId: data.chatRoomId,
          messageType: data.type,
        },
      });

      io.to(`room:${data.chatRoomId}`).emit("chatRoom:new-message", message);
      callback({ ok: true, message });
    } catch (err: any) {
      callback({ ok: false, error: "Server error" });
    }
  });
}
