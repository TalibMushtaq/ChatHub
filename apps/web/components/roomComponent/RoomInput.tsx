"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { socket } from "../../app/lib/socket";
import { api } from "../../app/lib/api";
import { getErrorMessage } from "../../app/lib/errors";

interface RoomInputProps {
  chatRoomId: string;
}

export default function RoomInput({ chatRoomId }: RoomInputProps) {
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const send = async () => {
    if (!text.trim() && !uploading) return;

    const payload = {
      chatRoomId,
      content: text.trim(),
      messageType: "TEXT",
      idempotencyKey: crypto.randomUUID(),
    };

    socket.emit("chatroom:message", {
      payload,
      callback: ({ ok, error }: { ok: boolean; error?: string }) => {
        if (!ok) {
          toast.error(error ?? "Failed to send message");
        }
      },
    });

    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const attachmentIds: string[] = [];

      for (const file of Array.from(files)) {
        const presignRes = await api.post("/attachments/presign", {
          context: "room",
          contextId: chatRoomId,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        });

        const { presignedUrl, attachmentId } = presignRes.data;

        const uploadRes = await fetch(presignedUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
        });

        if (!uploadRes.ok) {
          throw new Error(
            `Upload of ${file.name} failed (${uploadRes.status})`,
          );
        }

        attachmentIds.push(attachmentId);
      }

      const firstFile = files[0];
      let messageType = "FILE";
      if (firstFile?.type.startsWith("image/")) messageType = "IMAGE";
      else if (firstFile?.type.startsWith("video/")) messageType = "VIDEO";
      else if (firstFile?.type.startsWith("audio/")) messageType = "AUDIO";

      socket.emit("chatroom:message", {
        payload: {
          chatRoomId,
          content: text.trim() || undefined,
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

      setText("");
    } catch (err) {
      toast.error(getErrorMessage(err, "Upload failed"));
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

        <button
          onClick={send}
          disabled={(!text.trim() && !uploading) || uploading}
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
