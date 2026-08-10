"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { socket } from "../../app/lib/socket";
import MessageTimeline from "../shared/MessageTimeline";
import {
  useChatTimeline,
  type TimelineHandlers,
} from "../shared/useChatTimeline";
import type { Message } from "../shared/MessageBubble";

interface RoomMessagesProps {
  chatRoomId: string;
}

export default function RoomMessages({ chatRoomId }: RoomMessagesProps) {
  const subscribe = useCallback(
    ({ onNew, onEdited, onDeleted }: TimelineHandlers) => {
      socket.emit("chatroom:join", { chatRoomId });

      socket.on("chatroom:message", (msg: Message) => {
        if (msg.chatRoomId === chatRoomId) onNew(msg);
      });
      socket.on("chatroom:message:edited", onEdited);
      socket.on("chatroom:message:deleted", onDeleted);
      socket.on("chatroom:error", ({ message }: { message?: string }) => {
        toast.error(message ?? "Chat room error");
      });

      return () => {
        socket.emit("chatroom:leave", { chatRoomId });
        socket.off("chatroom:message");
        socket.off("chatroom:message:edited");
        socket.off("chatroom:message:deleted");
        socket.off("chatroom:error");
      };
    },
    [chatRoomId],
  );

  const { messages, currentUserId, bottomRef } = useChatTimeline(
    `/room/${chatRoomId}/messages`,
    subscribe,
  );

  const handleDelete = useCallback(
    (messageId: string) =>
      new Promise<void>((resolve) => {
        socket.emit("chatroom:message:delete", {
          payload: { chatRoomId, messageId },
          callback: (res: { ok?: boolean; error?: string }) => {
            if (!res.ok) {
              toast.error(res.error ?? "Failed to delete message");
            }
            resolve();
          },
        });
      }),
    [chatRoomId],
  );

  const handleSubmitEdit = useCallback(
    (messageId: string, content: string) =>
      new Promise<void>((resolve, reject) => {
        socket.emit("chatroom:message:edit", {
          payload: { chatRoomId, messageId, content },
          callback: (res: { ok?: boolean; error?: string }) => {
            if (res.ok) {
              resolve();
            } else {
              reject(new Error(res.error ?? "Failed to edit message"));
            }
          },
        });
      }),
    [chatRoomId],
  );

  return (
    <MessageTimeline
      messages={messages}
      currentUserId={currentUserId}
      emptyHint="Start the conversation!"
      bottomRef={bottomRef}
      onDelete={handleDelete}
      onSubmitEdit={handleSubmitEdit}
    />
  );
}
