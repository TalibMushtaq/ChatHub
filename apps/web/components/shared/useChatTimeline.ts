"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../../app/lib/api";
import type { Message } from "./MessageBubble";

export interface TimelineHandlers {
  onNew: (message: Message) => void;
  onEdited: (patch: {
    messageId: string;
    content: string;
    editedAt: string;
  }) => void;
  onDeleted: (patch: { messageId: string; deletedAt: string }) => void;
}

/**
 * Wires a socket subscription for one conversation.
 *
 * Called with handlers that apply the incoming events to timeline state, and
 * must return a teardown function (leave the conversation, drop listeners).
 */
export type TimelineSubscribe = (handlers: TimelineHandlers) => () => void;

/**
 * Loads a conversation timeline and keeps it in sync with live socket events.
 *
 * Rooms and direct chats use different endpoints and event names but the same
 * state transitions (append, patch content on edit, mark deleted) and the same
 * scroll-to-bottom behaviour, so all of it lives here.
 *
 * `subscribe` must be referentially stable (wrap it in `useCallback`) —
 * it is a dependency of the subscription effect.
 */
export function useChatTimeline(
  messagesPath: string,
  subscribe: TimelineSubscribe,
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function load() {
      const [userRes, msgsRes] = await Promise.all([
        api.get("/auth/me"),
        api.get(messagesPath),
      ]);
      setCurrentUserId(userRes.data.user.id);
      setMessages(msgsRes.data.messages ?? []);
    }

    load();
  }, [messagesPath]);

  useEffect(() => {
    return subscribe({
      onNew: (message) => setMessages((prev) => [...prev, message]),
      onEdited: ({ messageId, content, editedAt }) =>
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, content, editedAt } : m,
          ),
        ),
      onDeleted: ({ messageId, deletedAt }) =>
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, isDeleted: true, deletedAt, content: null }
              : m,
          ),
        ),
    });
  }, [subscribe]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return { messages, currentUserId, bottomRef };
}
