"use client";

import { useRef, useState } from "react";
import {
  uploadAttachments,
  type AttachmentContext,
} from "../../app/lib/attachments";

export interface ComposerMessage {
  content?: string;
  attachmentIds?: string[];
  messageType: string;
}

interface ChatComposerProps {
  /** Upload context, used to namespace attachment keys server-side. */
  context: AttachmentContext;
  /** Conversation the composer writes to (direct chat id or room id). */
  contextId: string;
  /**
   * Delivers the message. DMs post to the REST API, rooms emit over the
   * socket — the composer itself is transport-agnostic.
   */
  onSend: (message: ComposerMessage) => void | Promise<void>;
}

/**
 * Message composer shared by direct chats and rooms: auto-growing textarea,
 * Enter-to-send, and attachment upload.
 */
export default function ChatComposer({
  context,
  contextId,
  onSend,
}: ChatComposerProps) {
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetInput = () => {
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const send = async () => {
    if (!text.trim()) return;
    await onSend({ content: text.trim(), messageType: "TEXT" });
    resetInput();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const { attachmentIds, messageType } = await uploadAttachments(
        context,
        contextId,
        files,
      );
      await onSend({
        content: text.trim() || undefined,
        attachmentIds,
        messageType,
      });
      resetInput();
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  return (
    <div className="border-t border-white/7 bg-surface px-4 py-3.5 shrink-0">
      <div
        className="
          flex items-end gap-3
          bg-surface-2 border border-white/7 rounded-xl
          px-4 py-2
          transition-all duration-200
          focus-within:border-primary/40 focus-within:shadow-[0_0_0_3px_rgba(108,99,255,0.08)]
        "
      >
        {/* File upload button */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          multiple
          disabled={uploading}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="
            w-8 h-8 flex items-center justify-center rounded-lg shrink-0 cursor-pointer mb-0.5
            text-muted hover:text-text hover:bg-white/8
            transition-all duration-200
            disabled:opacity-30 disabled:cursor-not-allowed
          "
          title="Attach file"
        >
          📎
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={uploading ? "Uploading..." : "Type a message..."}
          rows={1}
          disabled={uploading}
          className="
            flex-1 bg-transparent text-[13px] text-text
            placeholder:text-muted outline-none py-1.5 resize-none
            leading-relaxed overflow-y-auto
            disabled:opacity-50
          "
          style={{ maxHeight: "160px" }}
        />

        {/* Send button */}
        <button
          onClick={send}
          disabled={!text.trim() || uploading}
          className="
            w-8 h-8 flex items-center justify-center rounded-lg shrink-0 cursor-pointer mb-0.5
            bg-primary text-white text-[15px]
            transition-all duration-200
            hover:bg-primary-hover hover:shadow-[0_4px_14px_rgba(108,99,255,0.35)] hover:-translate-y-px
            disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-primary
            disabled:hover:shadow-none disabled:hover:translate-y-0
          "
        >
          ↑
        </button>
      </div>
      <p className="text-[11px] text-muted/60 mt-1.5 ml-1">
        <kbd className="font-mono">Enter</kbd> to send &nbsp;·&nbsp;{" "}
        <kbd className="font-mono">Shift+Enter</kbd> for new line
      </p>
    </div>
  );
}
