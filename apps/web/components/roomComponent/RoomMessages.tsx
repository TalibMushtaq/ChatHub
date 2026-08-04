"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../../app/lib/api";
import { socket } from "../../app/lib/socket";
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

    load();

    socket.emit("chatroom:join", { chatRoomId });

    socket.on("chatroom:message", (msg: Message) => {
      if (msg.chatRoomId === chatRoomId) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    return () => {
      socket.emit("chatroom:leave", { chatRoomId });
      socket.off("chatroom:message");
    };
  }, [chatRoomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
          />
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}
