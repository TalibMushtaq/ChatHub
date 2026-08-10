"use client";

import { toast } from "sonner";
import { socket } from "../../app/lib/socket";
import ChatComposer, { type ComposerMessage } from "../shared/ChatComposer";

interface RoomInputProps {
  chatRoomId: string;
}

export default function RoomInput({ chatRoomId }: RoomInputProps) {
  const send = ({ content, attachmentIds, messageType }: ComposerMessage) => {
    socket.emit("chatroom:message", {
      payload: {
        chatRoomId,
        content,
        messageType,
        attachmentIds,
        idempotencyKey: crypto.randomUUID(),
      },
      callback: ({ ok, error }: { ok: boolean; error?: string }) => {
        if (!ok) {
          toast.error(error ?? "Failed to send message");
        }
      },
    });
  };

  return <ChatComposer context="room" contextId={chatRoomId} onSend={send} />;
}
