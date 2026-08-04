"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "../../app/lib/api";
import { socket } from "../../app/lib/socket";
import MessageBubble, { type Message } from "../shared/MessageBubble";

export default function DMMessages({ directChatId }: { directChatId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function load() {
      const [userRes, msgsRes] = await Promise.all([
        api.get("/auth/me"),
        api.get(`/dm/${directChatId}/messages`),
      ]);
      setCurrentUserId(userRes.data.user.id);
      setMessages(msgsRes.data.messages);
    }

    load();

    socket.emit("directChat:join", { directChatId });

    socket.on("message:new", (msg) => {
      if (msg.directChatId === directChatId) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    socket.on("message:deleted", ({ messageId, deletedAt }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, isDeleted: true, deletedAt, content: null }
            : m,
        ),
      );
    });

    socket.on("message:edited", ({ messageId, content, editedAt }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content, editedAt } : m)),
      );
    });

    return () => {
      socket.emit("directChat:leave", { directChatId });
      socket.off("message:new");
      socket.off("message:deleted");
      socket.off("message:edited");
    };
  }, [directChatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleDelete(messageId: string) {
    try {
      await api.delete(`/dm/message/${messageId}`);
    } catch (err) {
      console.error(err);
    }
  }

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
            Say hello!
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
            currentUserId={currentUserId}
            onDelete={handleDelete}
          />
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}
