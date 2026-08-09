"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../app/lib/api";
import { getErrorMessage } from "../../app/lib/errors";

interface DMInputProps {
  directChatId: string;
}

export default function DMInput({ directChatId }: DMInputProps) {
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sendMessage = async (
    content: string | undefined,
    attachmentIds?: string[],
    messageType = "TEXT",
  ) => {
    await api.post(`/dm/${directChatId}/message`, {
      content,
      messageType,
      attachmentIds,
      idempotencyKey: crypto.randomUUID(),
    });
  };

  const send = async () => {
    if (!text.trim()) return;
    try {
      await sendMessage(text.trim());
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to send message"));
      return;
    }
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
        // Step 1: Request presigned URL
        const presignRes = await api.post("/attachments/presign", {
          context: "dm",
          contextId: directChatId,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        });

        const { presignedUrl, attachmentId } = presignRes.data;

        // Step 2: Upload directly to S3
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

      // Step 3: Determine message type from first file
      const firstFile = files[0];
      let messageType = "FILE";
      if (firstFile?.type.startsWith("image/")) messageType = "IMAGE";
      else if (firstFile?.type.startsWith("video/")) messageType = "VIDEO";
      else if (firstFile?.type.startsWith("audio/")) messageType = "AUDIO";

      // Step 4: Send message with attachments
      await sendMessage(text.trim() || undefined, attachmentIds, messageType);
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
