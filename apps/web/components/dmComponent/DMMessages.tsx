"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "../../app/lib/api";
import { socket } from "../../app/lib/socket";

interface Message {
  id: string;
  content: string | null;
  createdAt: string;
  editedAt?: string;
  deletedAt?: string;
  isDeleted?: boolean;
  senderId?: string;
  User?: {
    id: string;
    username: string;
    displayname: string;
  } | null;
}

export default function DMMessages({ directChatId }: { directChatId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);

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

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = () => setMenuOpenId(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [menuOpenId]);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  async function handleDelete(messageId: string) {
    setMenuOpenId(null);
    try {
      await api.delete(`/dm/message/${messageId}`);
    } catch (err) {
      console.error(err);
    }
  }

  function startEdit(msg: Message) {
    setMenuOpenId(null);
    setEditingId(msg.id);
    setEditContent(msg.content ?? "");
  }

  async function submitEdit(messageId: string) {
    if (!editContent.trim()) return;
    try {
      await api.patch(`/dm/message/${messageId}`, {
        content: editContent.trim(),
      });
      setEditingId(null);
    } catch (err) {
      console.error(err);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditContent("");
  }

  return (
    <div
      className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-1 bg-bg"
      onClick={() => setMenuOpenId(null)}
    >
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
        const isEditing = editingId === m.id;
        const isWithin30Min =
          Date.now() - new Date(m.createdAt).getTime() < 30 * 60 * 1000;
        const isMenuOpen = menuOpenId === m.id;

        const displayName = m.User?.displayname || m.User?.username || "User";

        const time = new Date(m.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        return (
          <div
            key={m.id}
            style={{ animationDelay: `${Math.min(i * 20, 300)}ms` }}
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

              {/* Bubble + action button row */}
              <div
                className={`flex items-center gap-1.5 ${isOwn ? "flex-row-reverse" : "flex-row"}`}
              >
                {/* Bubble */}
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
                    className={`px-5 py-3.5 text-[15px] leading-relaxed transition-all duration-150
                      ${
                        isOwn
                          ? "bg-primary text-white rounded-[18px] rounded-br-sm group-hover:bg-primary-hover"
                          : "bg-surface-2 border border-white/6 text-text rounded-[18px] rounded-bl-sm group-hover:border-white/10"
                      }`}
                  >
                    {m.content}
                  </div>
                )}

                {/* 3-dot menu — only own, non-deleted, non-editing messages */}
                {isOwn && !m.isDeleted && !isEditing && isWithin30Min && (
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
                        <button
                          onClick={() => startEdit(m)}
                          className="w-full text-left px-4 py-2 text-[13px] text-text
                            hover:bg-white/6 transition-colors flex items-center gap-2"
                        >
                          <span>✏️</span> Edit
                        </button>
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
      })}

      <div ref={bottomRef} />
    </div>
  );
}
