"use client";

import { api } from "../../app/lib/api";
import ChatComposer, { type ComposerMessage } from "../shared/ChatComposer";

interface DMInputProps {
  directChatId: string;
}

export default function DMInput({ directChatId }: DMInputProps) {
  const send = async ({
    content,
    attachmentIds,
    messageType,
  }: ComposerMessage) => {
    await api.post(`/dm/${directChatId}/message`, {
      content,
      messageType,
      attachmentIds,
      idempotencyKey: crypto.randomUUID(),
    });
  };

  return <ChatComposer context="dm" contextId={directChatId} onSend={send} />;
}
