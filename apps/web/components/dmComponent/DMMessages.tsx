"use client";

import { useCallback } from "react";
import { api } from "../../app/lib/api";
import { socket } from "../../app/lib/socket";
import MessageTimeline from "../shared/MessageTimeline";
import {
  useChatTimeline,
  type TimelineHandlers,
} from "../shared/useChatTimeline";

export default function DMMessages({ directChatId }: { directChatId: string }) {
  const subscribe = useCallback(
    ({ onNew, onEdited, onDeleted }: TimelineHandlers) => {
      socket.emit("directChat:join", { directChatId });

      socket.on("message:new", (msg) => {
        if (msg.directChatId === directChatId) onNew(msg);
      });
      socket.on("message:edited", onEdited);
      socket.on("message:deleted", onDeleted);

      return () => {
        socket.emit("directChat:leave", { directChatId });
        socket.off("message:new");
        socket.off("message:edited");
        socket.off("message:deleted");
      };
    },
    [directChatId],
  );

  const { messages, currentUserId, bottomRef } = useChatTimeline(
    `/dm/${directChatId}/messages`,
    subscribe,
  );

  const handleDelete = useCallback(async (messageId: string) => {
    try {
      await api.delete(`/dm/message/${messageId}`);
    } catch (err) {
      console.error(err);
    }
  }, []);

  return (
    <MessageTimeline
      messages={messages}
      currentUserId={currentUserId}
      emptyHint="Say hello!"
      bottomRef={bottomRef}
      onDelete={handleDelete}
    />
  );
}
