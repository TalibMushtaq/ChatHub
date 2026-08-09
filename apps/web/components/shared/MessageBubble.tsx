"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { api } from "../../app/lib/api";
import { getErrorMessage } from "../../app/lib/errors";
import AttachmentRenderer from "./AttachmentRenderer";

interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  thumbnailKey?: string | null;
}

export interface Message {
  id: string;
  content: string | null;
  messageType: string;
  createdAt: string;
  editedAt?: string;
  deletedAt?: string;
  isDeleted?: boolean;
  senderId?: string;
  directChatId?: string;
  chatRoomId?: string;
  attachments?: Attachment[];
  User?: {
    id: string;
    username: string;
    displayname: string;
  } | null;
}

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  isFirst: boolean;
  onEdit?: (msg: Message) => void;
  onDelete?: (messageId: string) => void;
  onSubmitEdit?: (messageId: string, content: string) => Promise<void>;
}

export default function MessageBubble({
  message,
  isOwn,
  isFirst,
  onEdit,
  onDelete,
  onSubmitEdit,
}: MessageBubbleProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  const m = message;
  const isEditing = editingId === m.id;
  const isWithin5Min =
    Date.now() - new Date(m.createdAt).getTime() < 5 * 60 * 1000;
  const isWithin30Min =
    Date.now() - new Date(m.createdAt).getTime() < 30 * 60 * 1000;
  const isMenuOpen = menuOpenId === m.id;

  const displayName = m.User?.displayname || m.User?.username || "User";

  const time = new Date(m.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = () => setMenuOpenId(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [menuOpenId]);

  async function submitEdit(messageId: string) {
    if (!editContent.trim()) return;
    try {
      if (onSubmitEdit) {
        await onSubmitEdit(messageId, editContent.trim());
      } else {
        await api.patch(`/dm/message/${messageId}`, {
          content: editContent.trim(),
        });
      }
      setEditingId(null);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to edit message"));
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditContent("");
  }

  function startEdit(msg: Message) {
    setMenuOpenId(null);
    setEditingId(msg.id);
    setEditContent(msg.content ?? "");
    if (onEdit) onEdit(msg);
  }

  function handleDelete(messageId: string) {
    setMenuOpenId(null);
    if (onDelete) onDelete(messageId);
  }

  return (
    <div
      className={`flex group animate-[fadeSlideIn_0.25s_ease_both] [animation-fill-mode:both]
        ${isOwn ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`flex flex-col gap-0.5 max-w-[75%] ${
          isOwn ? "items-end" : "items-start"
        }`}
      >
        {isFirst && (
          <span
            className={`text-[13px] text-muted mb-0.5 ${isOwn ? "mr-1" : "ml-1"}`}
          >
            {isOwn ? "You" : displayName}
          </span>
        )}

        <div
          className={`flex items-center gap-1.5 ${isOwn ? "flex-row-reverse" : "flex-row"}`}
        >
          {/* Content */}
          {m.isDeleted ? (
            <div
              className={`px-5 py-3.5 text-[14px] italic leading-relaxed text-muted
                border border-dashed rounded-[18px]
                ${isOwn ? "border-white/10 rounded-br-sm" : "border-white/8 rounded-bl-sm"}`}
            >
              This message was deleted
            </div>
          ) : isEditing ? (
            <div className="flex items-center gap-2">
              <input
                ref={editInputRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitEdit(m.id);
                  if (e.key === "Escape") cancelEdit();
                }}
                className="px-4 py-2.5 text-[15px] rounded-[18px] rounded-br-sm bg-surface-2
                  border border-primary/50 text-text outline-none focus:border-primary
                  min-w-45 transition-colors"
              />
              <button
                onClick={() => submitEdit(m.id)}
                className="text-[13px] text-primary font-semibold hover:text-primary-hover transition-colors"
              >
                Save
              </button>
              <button
                onClick={cancelEdit}
                className="text-[13px] text-muted hover:text-text transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div
              className={`flex flex-col gap-2 px-5 py-3.5 text-[15px] leading-relaxed transition-all duration-150
                ${
                  isOwn
                    ? "bg-primary text-white rounded-[18px] rounded-br-sm group-hover:bg-primary-hover"
                    : "bg-surface-2 border border-white/6 text-text rounded-[18px] rounded-bl-sm group-hover:border-white/10"
                }`}
            >
              {/* Text content */}
              {m.content && <span>{m.content}</span>}

              {/* Attachments */}
              {m.attachments && m.attachments.length > 0 && (
                <div className="flex flex-col gap-2">
                  {m.attachments.map((att) => (
                    <AttachmentRenderer key={att.id} attachment={att} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 3-dot menu */}
          {isOwn &&
            !m.isDeleted &&
            !isEditing &&
            (isWithin5Min || isWithin30Min) && (
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenId(isMenuOpen ? null : m.id);
                  }}
                  className="w-6 h-6 flex items-center justify-center rounded-full
                  text-muted hover:text-text hover:bg-white/8
                  opacity-0 group-hover:opacity-100 transition-all duration-150 text-lg leading-none"
                >
                  ···
                </button>

                {isMenuOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute bottom-full right-0 mb-1.5 w-36 z-50
                    bg-surface-2 border border-white/10 rounded-xl shadow-xl
                    overflow-hidden py-1"
                  >
                    {isWithin5Min && (
                      <button
                        onClick={() => startEdit(m)}
                        className="w-full text-left px-4 py-2 text-[13px] text-text
                        hover:bg-white/6 transition-colors flex items-center gap-2"
                      >
                        <span>✏️</span> Edit
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="w-full text-left px-4 py-2 text-[13px] text-red-400
                      hover:bg-white/6 transition-colors flex items-center gap-2"
                    >
                      <span>🗑️</span> Delete
                    </button>
                  </div>
                )}
              </div>
            )}
        </div>

        {/* Timestamp + edited indicator */}
        <span
          className={`text-[12px] text-muted mt-1 flex items-center gap-1 ${isOwn ? "mr-1" : "ml-1"}`}
        >
          {time}
          {m.editedAt && !m.isDeleted && (
            <span className="text-[11px] text-muted/60">(edited)</span>
          )}
        </span>
      </div>
    </div>
  );
}
