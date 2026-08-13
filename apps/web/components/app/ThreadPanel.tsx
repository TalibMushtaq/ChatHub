"use client";

// Thread column: header, message timeline, and composer for the active conversation.
import { useCallback, useEffect, useRef, useState } from "react";
import { useShell, convKey } from "./state";
import { socket } from "../../app/lib/socket";
import { ChatAPI, getErrorMessage } from "./api";
import {
  displayName,
  fmtBytes,
  fmtDay,
  fmtTime,
  readStatusOf,
  typeLabel,
} from "./helpers";
import type { Attachment, Message, ReadReceipt } from "./types";
import AppAvatar from "./AppAvatar";
import {
  BackIcon,
  MoreIcon,
  ClipIcon,
  SendIcon,
  CloseIcon,
  EditIcon,
  TrashIcon,
  CheckIcon,
  DoubleCheckIcon,
  iconForMime,
} from "./icons";
import { iconBtn } from "./styles";

const EDIT_WINDOW_MS = 5 * 60 * 1000;
const DELETE_WINDOW_MS = 30 * 60 * 1000;

export default function ThreadPanel() {
  const {
    active,
    msgs,
    roomMembers,
    readReceipts,
    typing,
    user,
    closeConv,
    openModal,
    sendMessage,
    editMessage,
    deleteMessage,
    removeLocalMessage,
    toast,
    roomInfo,
  } = useShell();

  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<{
    id: string;
    content: string;
  } | null>(null);
  const [editText, setEditText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // Typing lifecycle: emit start on the first keystroke, re-emit every 2s so
  // the far side keeps the indicator during long pauses between keys, and stop
  // after 2.5s of inactivity. The server throttles to 1.5s anyway. `active`
  // is mirrored to a ref so these helpers stay stable across renders.
  const activeRef = useRef(active);
  activeRef.current = active;
  const typingRef = useRef(false);
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const key = active ? convKey(active.kind, active.id) : null;
  const list = key ? (msgs[key] ?? []) : [];
  const typers = key ? (typing[key] ?? []) : [];
  const receipts = key ? (readReceipts[key] ?? []) : [];

  const emitTyping = useCallback((isTyping: boolean) => {
    const a = activeRef.current;
    if (!a) return;
    if (a.kind === "dm") {
      socket.emit("directChat:typing", { directChatId: a.id, isTyping });
    } else {
      socket.emit("chatroom:typing", { chatRoomId: a.id, isTyping });
    }
  }, []);

  const stopTyping = useCallback(() => {
    if (typingRef.current) emitTyping(false);
    typingRef.current = false;
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, [emitTyping]);

  const startTyping = useCallback(() => {
    if (typingRef.current) return;
    typingRef.current = true;
    emitTyping(true);
    typingIntervalRef.current = setInterval(() => emitTyping(true), 2000);
  }, [emitTyping]);

  const handleComposerChange = useCallback(
    (v: string) => {
      setContent(v);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (v.trim().length > 0) {
        startTyping();
        idleTimerRef.current = setTimeout(stopTyping, 2500);
      } else {
        stopTyping();
      }
    },
    [startTyping, stopTyping],
  );

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

  // Reset composer state whenever the conversation changes, and make sure a
  // stale "typing" flag never leaks into the newly opened conversation.
  useEffect(() => {
    setContent("");
    setFiles([]);
    setEditing(null);
    setEditText("");
    stopTyping();
  }, [active?.id, stopTyping]);

  // Send the "stopped typing" event when the panel unmounts.
  useEffect(() => () => stopTyping(), [stopTyping]);

  if (!active) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-[30px] text-center text-[14.5px] text-muted">
        <div className="mb-4">
          <AppAvatar name="ChatHubby" size={96} square />
        </div>
        <b className="mb-1 block text-[17px] text-fg">ChatHubby</b>
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
        : (active.name ?? "Room");

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
      onYes: () =>
        deleteMessage(m.id).catch((err: unknown) =>
          toast(getErrorMessage(err, "Failed to delete"), "error"),
        ),
    });
  }

  // Build a flat list with day dividers.
  const rows: Array<
    | { kind: "day"; day: string }
    | { kind: "msg"; m: Message; firstOfSender: boolean }
  > = [];
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
      <div className="thread-head flex items-center gap-3 border-b border-border bg-surface px-[14px] py-[11px]">
        <button
          className={`${iconBtn} back h-10 w-10 hidden max-[760px]:inline-flex`}
          onClick={closeConv}
          aria-label="Back"
        >
          <BackIcon />
        </button>
        <AppAvatar
          name={other}
          src={active.kind === "dm" ? active.otherUser?.avatar : undefined}
          size={40}
          square={active.kind === "room"}
        />
        <div className="titles min-w-0 flex-1">
          <div className="name truncate text-[15px] font-extrabold">
            {active.kind === "room" && "# "}
            {other}
          </div>
          <div className="sub text-[12.5px] text-muted">
            {typers.length > 0 ? (
              <span className="text-accent-solid">
                {typers.map((t) => t.username).join(", ")} typing…
              </span>
            ) : (
              sub
            )}
          </div>
        </div>
        {active.kind === "room" && (
          <button
            className={`${iconBtn} h-10 w-10`}
            onClick={() => openModal("roomInfo")}
            aria-label="Room info"
          >
            <MoreIcon />
          </button>
        )}
      </div>

      <div className="msgs flex flex-1 flex-col overflow-y-auto">
        <div className="msgs-inner mx-auto w-full max-w-[860px] px-4 pt-4 pb-2">
          {rows.length === 0 && (
            <div className="empty-thread-msg flex flex-1 items-center justify-center p-5 text-sm text-muted">
              No messages yet — say hi!
            </div>
          )}
          {rows.map((row, i) =>
            row.kind === "day" ? (
              <div
                key={`day-${i}`}
                className="divider my-[18px] flex items-center gap-3 text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted"
              >
                <span className="h-px flex-1 bg-border" />
                {row.day}
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : (
              <MessageRow
                key={row.m.id}
                m={row.m}
                isOwn={
                  row.m.senderId != null
                    ? row.m.senderId === mine
                    : row.m.User?.id === mine
                }
                firstOfSender={row.firstOfSender}
                isRoom={active.kind === "room"}
                mine={mine}
                receipts={receipts}
                onEdit={() => startEdit(row.m)}
                onDelete={() => askDelete(row.m)}
                onDismissFailed={(id) => removeLocalMessage(id)}
              />
            ),
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {editing ? (
        <div className="edit-box mt-1 mb-1 max-w-[min(74%,560px)] rounded-2xl border border-accent-solid bg-surface-2 p-2.5">
          <textarea
            className="min-h-11 max-h-[180px] w-full resize-none border-0 bg-transparent text-[14.5px] leading-[1.45] focus:outline-none"
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
          <div className="edit-actions mt-2 flex justify-end gap-2">
            <button
              className="cursor-pointer rounded-full px-3.5 py-[7px] text-[13px] font-extrabold text-muted transition-colors duration-150 ease-app hover:bg-surface-2"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
            <button
              className="cursor-pointer rounded-full bg-accent-btn px-3.5 py-[7px] text-[13px] font-extrabold text-accent-on transition-colors duration-150 ease-app hover:bg-accent-hover disabled:opacity-55"
              onClick={() => void submitEdit()}
              disabled={!editText.trim()}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="composer border-t border-border bg-surface p-[10px_14px_calc(10px+env(safe-area-inset-bottom))]">
          {files.length > 0 && (
            <div className="upchips mb-2 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="upchip relative flex max-w-full items-center gap-[9px] overflow-hidden rounded-xl border border-border bg-bg p-[7px_10px]"
                >
                  {iconForMime(f.type)}
                  <div>
                    <div className="nm max-w-[160px] truncate text-[12.5px] font-extrabold">
                      {f.name}
                    </div>
                    <div className="sz text-[11px] font-semibold text-muted">
                      {fmtBytes(f.size)}
                    </div>
                  </div>
                  <button
                    className="x flex h-[22px] w-[22px] flex-none cursor-pointer items-center justify-center rounded-md text-muted transition-colors duration-150 ease-app hover:bg-surface-2 hover:text-danger"
                    onClick={() =>
                      setFiles((prev) => prev.filter((_, j) => j !== i))
                    }
                    aria-label="Remove"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="composer-row flex items-end gap-2.5">
            <textarea
              ref={textareaRef}
              rows={1}
              className="max-h-[150px] min-w-0 flex-1 resize-none rounded-[20px] border-[1.5px] border-border bg-bg px-[15px] py-[11px] text-[15px] leading-[1.4] transition-[border-color,box-shadow] duration-150 ease-app focus:border-accent-solid focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-accent)_45%,transparent)] focus:outline-none"
              value={content}
              onChange={(e) => handleComposerChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={`Message ${active.kind === "room" ? `#${active.name ?? "room"}` : other}…`}
            />
            <button
              className="c-btn flex h-[42px] w-[42px] flex-none cursor-pointer items-center justify-center rounded-full text-muted transition-[color,background-color] duration-150 ease-app hover:bg-accent-soft hover:text-accent-solid"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach files"
            >
              <ClipIcon />
            </button>
            <button
              className="c-btn send flex h-[42px] w-[42px] flex-none cursor-pointer items-center justify-center rounded-full bg-accent-btn text-accent-on transition-colors duration-150 ease-app hover:bg-accent-hover hover:text-accent-on disabled:cursor-default disabled:opacity-45"
              onClick={() => void handleSend()}
              disabled={!canSend}
              aria-label="Send"
            >
              {uploading ? (
                <span style={{ fontSize: 12 }}>…</span>
              ) : (
                <SendIcon className="h-5 w-5" />
              )}
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
  mine,
  receipts,
  onEdit,
  onDelete,
  onDismissFailed,
}: {
  m: Message;
  isOwn: boolean;
  firstOfSender: boolean;
  isRoom: boolean;
  mine: string;
  receipts: ReadReceipt[];
  onEdit: () => void;
  onDelete: () => void;
  onDismissFailed: (messageId: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const withinEdit =
    Date.now() - new Date(m.createdAt).getTime() < EDIT_WINDOW_MS;
  const withinDelete =
    Date.now() - new Date(m.createdAt).getTime() < DELETE_WINDOW_MS;

  const status = readStatusOf(m, mine, receipts, isRoom);
  // Readers other than self, and how many of them have passed this message.
  const others = receipts.filter((r) => r.userId !== mine);
  const readCount = others.filter(
    (r) =>
      new Date(r.lastReadMessageCreatedAt).getTime() >=
      new Date(m.createdAt).getTime(),
  ).length;

  const ticks =
    isOwn && !m.isDeleted ? (
      <div className="ticks mt-[3px] flex items-center gap-1 self-end pr-[3px] text-[11px] leading-none">
        {status === "pending" && (
          <span className="animate-pulse text-muted" title="Sending…">
            …
          </span>
        )}
        {status === "sent" && (
          <span title="Sent">
            <CheckIcon className="h-[14px] w-[14px] text-muted" />
          </span>
        )}
        {(status === "read" || status === "readAll") && (
          <span title={status === "readAll" ? "Read by all" : "Read"}>
            <DoubleCheckIcon className="h-[14px] w-[14px] text-accent-solid" />
          </span>
        )}
        {status === "readSome" && (
          <span title={`Read by ${readCount} of ${others.length}`}>
            <DoubleCheckIcon className="h-[14px] w-[14px] text-muted" />
          </span>
        )}
        {status === "failed" && (
          <button
            className="cursor-pointer rounded-[8px] px-1.5 py-[1px] text-[11px] font-extrabold text-danger transition-colors duration-150 ease-app hover:bg-surface-2"
            onClick={() => onDismissFailed(m.id)}
            title="Not sent — tap to remove"
          >
            Not sent
          </button>
        )}
      </div>
    ) : null;

  return (
    <div
      className={`msg-row group my-0.5 flex items-end gap-[9px] animate-[pop_.16s_cubic-bezier(.2,.8,.2,1)] ${isOwn ? "justify-end" : ""}`}
      style={{ position: "relative" }}
    >
      {!isOwn && (
        <div className="mb-0.5 flex-none">
          <AppAvatar
            name={displayName(m.User)}
            src={m.User?.avatar}
            size={30}
            square={isRoom}
          />
        </div>
      )}
      <div
        className={`col flex min-w-0 max-w-[min(74%,560px)] flex-col ${isOwn ? "items-end" : ""}`}
      >
        <div
          className={`meta mx-[5px] mb-[3px] flex items-baseline gap-[7px] text-[11px] font-bold text-muted ${isOwn ? "justify-end" : ""}`}
        >
          {isRoom && !isOwn && firstOfSender && m.User && (
            <span className="who font-extrabold text-fg">
              {displayName(m.User)}
            </span>
          )}
          {isOwn && <span className="who font-extrabold text-fg">You</span>}
          {!m.isDeleted && <span>{fmtTime(m.createdAt)}</span>}
          {m.editedAt && !m.isDeleted && (
            <span className="edited opacity-85">edited</span>
          )}
        </div>

        {m.isDeleted ? (
          <div className="bubble rounded-br-[6px] rounded-bl-[18px] rounded-[18px] border border-border bg-surface-2 px-[13px] py-[9px] text-[14.5px] leading-[1.45] italic opacity-70 text-muted break-words overflow-wrap-anywhere">
            This message was deleted
          </div>
        ) : (
          <div
            className={`bubble rounded-[18px] px-[13px] py-[9px] text-[14.5px] leading-[1.45] break-words overflow-wrap-anywhere ${
              isOwn
                ? "rounded-br-[6px] rounded-bl-[18px] border-transparent bg-accent-btn text-accent-on"
                : "rounded-bl-[6px] rounded-br-[18px] border border-border bg-surface-2"
            }`}
          >
            {m.content && <span>{m.content}</span>}
            {m.attachments && m.attachments.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginTop: m.content ? 8 : 0,
                }}
              >
                {m.attachments.map((att) => (
                  <AttachmentCard key={att.id} att={att} isOwn={isOwn} />
                ))}
              </div>
            )}
          </div>
        )}

        {ticks}
      </div>

      {isOwn && !m.isDeleted && (withinEdit || withinDelete) && (
        <>
          <button
            className={`menu-btn flex-none self-center rounded-full text-muted transition-opacity duration-150 ease-app cursor-pointer ${
              isOwn ? "opacity-100" : "opacity-0"
            } group-hover:opacity-100`}
            onClick={() => setMenu((v) => !v)}
            aria-label="Message actions"
          >
            <MoreIcon className="h-5 w-5" />
          </button>
          {menu && (
            <div
              className="fmenu fixed z-[90] min-w-[190px] rounded-[14px] border border-border bg-surface p-1.5 shadow-lg animate-[pop_.13s_cubic-bezier(.2,.8,.2,1)]"
              style={{
                position: "absolute",
                left: 12,
                bottom: 0,
                transform: "translateY(-4px)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {withinEdit && (
                <button
                  className="flex w-full cursor-pointer items-center gap-[11px] rounded-[9px] px-3 py-2.5 text-left text-[13.5px] font-extrabold text-fg transition-colors duration-150 ease-app hover:bg-surface-2"
                  onClick={() => {
                    setMenu(false);
                    onEdit();
                  }}
                >
                  <EditIcon className="h-4 w-4 flex-none" /> Edit
                </button>
              )}
              {withinDelete && (
                <button
                  className="flex w-full cursor-pointer items-center gap-[11px] rounded-[9px] px-3 py-2.5 text-left text-[13.5px] font-extrabold text-danger transition-colors duration-150 ease-app hover:bg-surface-2"
                  onClick={() => {
                    setMenu(false);
                    onDelete();
                  }}
                >
                  <TrashIcon className="h-4 w-4 flex-none" /> Delete
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AttachmentCard({ att, isOwn }: { att: Attachment; isOwn: boolean }) {
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

  // Attachment card chrome differs for the sender's own bubble (they sit on
  // the accent background, so the card needs a light translucent fill).
  const cardCls = isOwn
    ? "border-transparent bg-[color-mix(in_oklab,oklch(0.997_0_0)_12%,transparent)]"
    : "border-border bg-fg-wash-2";

  if (err) {
    return (
      <div
        className={`at mt-2 flex min-w-[220px] max-w-[300px] items-center gap-2.5 rounded-xl border px-2.5 py-2 ${cardCls}`}
      >
        Attachment unavailable
      </div>
    );
  }

  if (att.mimeType.startsWith("image/")) {
    return (
      <div
        className={`at mt-2 flex min-w-[220px] max-w-[300px] items-center gap-2.5 overflow-hidden rounded-xl border px-2.5 py-2 ${cardCls}`}
        style={{ padding: 0, display: "block" }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={att.filename}
            style={{ maxWidth: "100%", maxHeight: 320, display: "block" }}
          />
        ) : (
          <div style={{ width: 200, height: 140 }} />
        )}
      </div>
    );
  }
  if (att.mimeType.startsWith("video/")) {
    return (
      <div
        className={`at mt-2 flex min-w-[220px] max-w-[300px] items-center gap-2.5 overflow-hidden rounded-xl border px-2.5 py-2 ${cardCls}`}
        style={{ padding: 0, display: "block" }}
      >
        {url ? (
          <video
            src={url}
            controls
            style={{ maxWidth: "100%", maxHeight: 320, display: "block" }}
          />
        ) : (
          <div style={{ width: 200, height: 140 }} />
        )}
      </div>
    );
  }
  if (att.mimeType.startsWith("audio/")) {
    return (
      <div
        className={`at mt-2 flex min-w-[220px] max-w-[300px] items-center gap-2.5 rounded-xl border px-2.5 py-2 ${cardCls}`}
      >
        {url ? (
          <audio src={url} controls style={{ width: "100%" }} />
        ) : (
          <span>Loading…</span>
        )}
      </div>
    );
  }

  return (
    <a
      className={`at mt-2 flex min-w-[220px] max-w-[300px] items-center gap-2.5 rounded-xl border px-2.5 py-2 ${cardCls}`}
      href={url ?? "#"}
      target="_blank"
      rel="noreferrer"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <span className="at-thumb flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[9px] bg-[linear-gradient(135deg,var(--color-lime),var(--color-accent))] text-[oklch(0.24_0.03_150)]">
        {iconForMime(att.mimeType)}
      </span>
      <span className="at-meta min-w-0">
        <span className="at-name block truncate text-[12.5px] font-extrabold">
          {att.filename}
        </span>
        <span className="at-size block text-[11px] font-semibold opacity-80">
          {fmtBytes(att.size)} · {typeLabel(att.mimeType)}
        </span>
      </span>
    </a>
  );
}
