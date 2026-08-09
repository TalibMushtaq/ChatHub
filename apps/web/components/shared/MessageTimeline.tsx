"use client";

import type { RefObject } from "react";
import MessageBubble, { type Message } from "./MessageBubble";

interface MessageTimelineProps {
  messages: Message[];
  currentUserId: string | null;
  /** Second line of the empty state, e.g. "Say hello!". */
  emptyHint: string;
  bottomRef: RefObject<HTMLDivElement | null>;
  onDelete?: (messageId: string) => Promise<void>;
  onSubmitEdit?: (messageId: string, content: string) => Promise<void>;
}

/**
 * Scrollable message list shared by direct chats and rooms: empty state,
 * ownership/grouping calculation, and the scroll anchor.
 */
export default function MessageTimeline({
  messages,
  currentUserId,
  emptyHint,
  bottomRef,
  onDelete,
  onSubmitEdit,
}: MessageTimelineProps) {
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
            {emptyHint}
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
            onDelete={onDelete}
            onSubmitEdit={onSubmitEdit}
          />
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}
