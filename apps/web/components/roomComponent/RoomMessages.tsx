"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { socket } from "../../app/lib/socket";
import { api } from "../../app/lib/api";
import { getErrorMessage } from "../../app/lib/errors";
import MessageBubble, { type Message } from "../shared/MessageBubble";

interface RoomMessagesProps {
  chatRoomId: string;
}

export default function RoomMessages({ chatRoomId }: RoomMessagesProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function load() {
      const [userRes, msgsRes] = await Promise.all([
        api.get("/auth/me"),
        api.get(`/room/${chatRoomId}/messages`),
      ]);
      setCurrentUserId(userRes.data.user.id);
      setMessages(msgsRes.data.messages ?? []);
    }

    load().catch((err) => {
      toast.error(getErrorMessage(err, "Failed to load messages"));
    });

    socket.emit("chatroom:join", { chatRoomId });

    socket.on("chatroom:error", ({ message }: { message?: string }) => {
      toast.error(message ?? "Chat room error");
    });

    socket.on("chatroom:message", (msg: Message) => {
      if (msg.chatRoomId === chatRoomId) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    socket.on(
      "chatroom:message:edited",
      ({
        messageId,
        content,
        editedAt,
      }: {
        messageId: string;
        content: string;
        editedAt: string;
      }) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, content, editedAt } : m,
          ),
        );
      },
    );

    socket.on(
      "chatroom:message:deleted",
      ({ messageId, deletedAt }: { messageId: string; deletedAt: string }) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, isDeleted: true, deletedAt, content: null }
              : m,
          ),
        );
      },
    );

    return () => {
      socket.emit("chatroom:leave", { chatRoomId });
      socket.off("chatroom:message");
      socket.off("chatroom:message:edited");
      socket.off("chatroom:message:deleted");
      socket.off("chatroom:error");
    };
  }, [chatRoomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleDelete = useCallback(
    async (messageId: string) => {
      return new Promise<void>((resolve) => {
        socket.emit("chatroom:message:delete", {
          payload: { chatRoomId, messageId },
          callback: (res: { ok?: boolean; error?: string }) => {
            if (!res.ok) {
              toast.error(res.error ?? "Failed to delete message");
            }
            resolve();
          },
        });
      });
    },
    [chatRoomId],
  );

  const handleSubmitEdit = useCallback(
    async (messageId: string, content: string) => {
      return new Promise<void>((resolve, reject) => {
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
      });
    },
    [chatRoomId],
  );

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-1 bg-bg">
      {messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-12 h-12 rounded-[14px] bg-primary/10 border border-primary/20 flex items-center justify-center text-2xl">
            💬
          </div>
          <p className="text-[13px] text-muted leading-relaxed">
            No messages yet.
            <br />
            Start the conversation!
          </p>
        </div>
      )}

      {messages.map((m, i) => {
        const isOwn = (m.User?.id ?? m.senderId) === currentUserId;
        const isFirst = i === 0 || messages[i - 1]?.User?.id !== m.User?.id;

        return (
          <MessageBubble
            key={m.id}
            message={m}
            isOwn={isOwn}
            isFirst={isFirst}
            onDelete={handleDelete}
            onSubmitEdit={handleSubmitEdit}
          />
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}
