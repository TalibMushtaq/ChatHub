"use client";

// Thread column: header, message timeline, and composer for the active conversation.
import { useEffect, useRef, useState } from "react";
import { useShell } from "./state";
import { ChatAPI, getErrorMessage } from "./api";
import { displayName, fmtBytes, fmtDay, fmtTime, typeLabel } from "./helpers";
import type { Attachment, Message } from "./types";
import AppAvatar from "./AppAvatar";
import {
  BackIcon,
  MoreIcon,
  ClipIcon,
  SendIcon,
  CloseIcon,
  EditIcon,
  TrashIcon,
  iconForMime,
} from "./icons";

const EDIT_WINDOW_MS = 5 * 60 * 1000;
const DELETE_WINDOW_MS = 30 * 60 * 1000;

export default function ThreadPanel() {
  const { active, msgs, roomMembers, user, closeConv, openModal, sendMessage, editMessage, deleteMessage, toast, roomInfo } =
    useShell();

  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [editText, setEditText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const key = active ? `${active.kind}:${active.id}` : null;
  const list = key ? (msgs[key] ?? []) : [];

  // Autosize the composer and scroll to the newest message.
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 150)}px`;
    }
  }, [content]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [list.length, active?.id]);

  // Reset composer state whenever the conversation changes.
  useEffect(() => {
    setContent("");
    setFiles([]);
    setEditing(null);
    setEditText("");
  }, [active?.id]);

  if (!active) {
    return (
      <div className="empty-thread">
        <AppAvatar name="ChatHubby" size={96} square />
        <b>ChatHubby</b>
        <p>Select a conversation to start chatting.</p>
      </div>
    );
  }

  const mine = user.id;
  const other =
    active.kind === "dm" && active.otherUser
      ? displayName(active.otherUser)
      : active.kind === "dm"
        ? "Unknown"
        : active.name ?? "Room";

  const room = active.kind === "room" ? roomInfo() : null;
  const members = active.kind === "room" ? (roomMembers[active.id] ?? []) : [];

  const sub =
    active.kind === "dm"
      ? `@${active.otherUser?.username ?? ""}`
      : room
        ? `${room.memberCount} member${room.memberCount === 1 ? "" : "s"}${room.description ? " · " + room.description : ""}`
        : `${members.length} members`;

  const canSend = !uploading && (content.trim().length > 0 || files.length > 0);

  async function handleSend() {
    if (!canSend) return;
    const text = content.trim();
    setUploading(true);
    try {
      await sendMessage(text, files);
      setContent("");
      setFiles([]);
    } catch {
      // error toast handled by sendMessage
    } finally {
      setUploading(false);
      textareaRef.current?.focus();
    }
  }

  function startEdit(m: Message) {
    setEditing({ id: m.id, content: m.content ?? "" });
    setEditText(m.content ?? "");
  }

  async function submitEdit() {
    if (!editing || !editText.trim()) return;
    try {
      await editMessage(editing.id, editText.trim());
      setEditing(null);
      setEditText("");
    } catch (err) {
      toast(getErrorMessage(err, "Failed to edit"), "error");
    }
  }

  function askDelete(m: Message) {
    openModal("confirm", {
      title: "Delete message",
      text: "This will delete the message for everyone. This can't be undone.",
      danger: true,
      onYes: () => deleteMessage(m.id).catch((err: unknown) => toast(getErrorMessage(err, "Failed to delete"), "error")),
    });
  }

  // Build a flat list with day dividers.
  const rows: Array<{ kind: "day"; day: string } | { kind: "msg"; m: Message; firstOfSender: boolean }> = [];
  let lastDay = "";
  let lastSender = "";
  for (const m of list) {
    const day = fmtDay(m.createdAt);
    if (day !== lastDay) {
      rows.push({ kind: "day", day });
      lastDay = day;
    }
    rows.push({ kind: "msg", m, firstOfSender: m.senderId !== lastSender });
    lastSender = m.senderId ?? "";
  }

  return (
    <>
      <div className="thread-head">
        <button className="icon-btn back" onClick={closeConv} aria-label="Back">
          <BackIcon />
        </button>
        <AppAvatar
          name={other}
          src={active.kind === "dm" ? active.otherUser?.avatar : undefined}
          size={40}
          square={active.kind === "room"}
        />
        <div className="titles">
          <div className="name">
            {active.kind === "room" && "# "}
            {other}
          </div>
          <div className="sub">{sub}</div>
        </div>
        {active.kind === "room" && (
          <button className="icon-btn" onClick={() => openModal("roomInfo")} aria-label="Room info">
            <MoreIcon />
          </button>
        )}
      </div>

      <div className="msgs">
        <div className="msgs-inner">
          {rows.length === 0 && (
            <div className="empty-thread-msg">No messages yet — say hi!</div>
          )}
          {rows.map((row, i) =>
            row.kind === "day" ? (
              <div key={`day-${i}`} className="divider">
                {row.day}
              </div>
            ) : (
              <MessageRow
                key={row.m.id}
                m={row.m}
                isOwn={row.m.senderId != null ? row.m.senderId === mine : row.m.User?.id === mine}
                firstOfSender={row.firstOfSender}
                isRoom={active.kind === "room"}
                onEdit={() => startEdit(row.m)}
                onDelete={() => askDelete(row.m)}
              />
            ),
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {editing ? (
        <div className="edit-box">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submitEdit();
              }
              if (e.key === "Escape") setEditing(null);
            }}
            placeholder="Edit message…"
            autoFocus
          />
          <div className="edit-actions">
            <button className="cancel" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="save" onClick={() => void submitEdit()} disabled={!editText.trim()}>
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="composer">
          {files.length > 0 && (
            <div className="upchips">
              {files.map((f, i) => (
                <div key={i} className="upchip">
                  {iconForMime(f.type)}
                  <div>
                    <div className="nm">{f.name}</div>
                    <div className="sz">{fmtBytes(f.size)}</div>
                  </div>
                  <button
                    className="x"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Remove"
                  >
                    <CloseIcon />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="composer-row">
            <textarea
              ref={textareaRef}
              rows={1}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={`Message ${active.kind === "room" ? `#${active.name ?? "room"}` : other}…`}
            />
            <button className="c-btn" onClick={() => fileInputRef.current?.click()} aria-label="Attach files">
              <ClipIcon />
            </button>
            <button className="c-btn send" onClick={() => void handleSend()} disabled={!canSend} aria-label="Send">
              {uploading ? <span style={{ fontSize: 12 }}>…</span> : <SendIcon />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const chosen = Array.from(e.target.files ?? []);
                if (chosen.length) setFiles((prev) => [...prev, ...chosen]);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

function MessageRow({
  m,
  isOwn,
  firstOfSender,
  isRoom,
  onEdit,
  onDelete,
}: {
  m: Message;
  isOwn: boolean;
  firstOfSender: boolean;
  isRoom: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const withinEdit = Date.now() - new Date(m.createdAt).getTime() < EDIT_WINDOW_MS;
  const withinDelete = Date.now() - new Date(m.createdAt).getTime() < DELETE_WINDOW_MS;

  return (
    <div className={`msg-row ${isOwn ? "me" : ""}`} style={{ position: "relative" }}>
      {!isOwn && (
        <AppAvatar name={displayName(m.User)} src={m.User?.avatar} size={30} square={isRoom} />
      )}
      <div className="col">
        <div className="meta">
          {isRoom && !isOwn && firstOfSender && m.User && <span className="who">{displayName(m.User)}</span>}
          {isOwn && <span className="who">You</span>}
          {!m.isDeleted && <span>{fmtTime(m.createdAt)}</span>}
          {m.editedAt && !m.isDeleted && <span className="edited">edited</span>}
        </div>

        {m.isDeleted ? (
          <div className="bubble deleted">This message was deleted</div>
        ) : (
          <div className="bubble">
            {m.content && <span>{m.content}</span>}
            {m.attachments && m.attachments.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: m.content ? 8 : 0 }}>
                {m.attachments.map((att) => (
                  <AttachmentCard key={att.id} att={att} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {isOwn && !m.isDeleted && (withinEdit || withinDelete) && (
        <>
          <button className="menu-btn" onClick={() => setMenu((v) => !v)} aria-label="Message actions">
            <MoreIcon />
          </button>
          {menu && (
            <div
              className="fmenu"
              style={{ position: "absolute", left: 12, bottom: 0, transform: "translateY(-4px)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {withinEdit && (
                <button
                  onClick={() => {
                    setMenu(false);
                    onEdit();
                  }}
                >
                  <EditIcon /> Edit
                </button>
              )}
              {withinDelete && (
                <button
                  className="danger"
                  onClick={() => {
                    setMenu(false);
                    onDelete();
                  }}
                >
                  <TrashIcon /> Delete
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AttachmentCard({ att }: { att: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ChatAPI.getAttachmentUrl(att.id)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setErr(true);
      });
    return () => {
      cancelled = true;
    };
  }, [att.id]);

  if (err) {
    return <div className="at">Attachment unavailable</div>;
  }

  if (att.mimeType.startsWith("image/")) {
    return (
      <div className="at" style={{ padding: 0, overflow: "hidden", display: "block" }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={att.filename} style={{ maxWidth: "100%", maxHeight: 320, display: "block" }} />
        ) : (
          <div style={{ width: 200, height: 140 }} />
        )}
      </div>
    );
  }
  if (att.mimeType.startsWith("video/")) {
    return (
      <div className="at" style={{ padding: 0, overflow: "hidden", display: "block" }}>
        {url ? <video src={url} controls style={{ maxWidth: "100%", maxHeight: 320, display: "block" }} /> : <div style={{ width: 200, height: 140 }} />}
      </div>
    );
  }
  if (att.mimeType.startsWith("audio/")) {
    return <div className="at">{url ? <audio src={url} controls style={{ width: "100%" }} /> : <span>Loading…</span>}</div>;
  }

  return (
    <a className="at" href={url ?? "#"} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
      <span className="at-thumb">{iconForMime(att.mimeType)}</span>
      <span className="at-meta">
        <span className="at-name">{att.filename}</span>
        <span className="at-size">
          {fmtBytes(att.size)} · {typeLabel(att.mimeType)}
        </span>
      </span>
    </a>
  );
}
