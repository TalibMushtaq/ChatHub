"use client";

// Shared message row for DM and room-channel timelines. Extracted from the old
// ThreadPanel so the Phase 2 RoomShell reuses the exact same rendering (bubble,
// read ticks, context menu) instead of duplicating it.
import { useEffect, useRef, useState } from "react";
import {
  displayName,
  fmtBytes,
  fmtTime,
  readStatusOf,
  typeLabel,
} from "../helpers";
import type { Attachment, Message, ReadReceipt } from "../types";
import { AvatarLink, NameLink } from "../UserLinks";
import { ChatAPI } from "../api";
import {
  MoreIcon,
  EditIcon,
  TrashIcon,
  CheckIcon,
  DoubleCheckIcon,
  iconForMime,
} from "../icons";
import VoiceMessagePlayer from "../VoiceMessagePlayer";

export const EDIT_WINDOW_MS = 5 * 60 * 1000;
export const DELETE_WINDOW_MS = 30 * 60 * 1000;

export function MessageRow({
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
  const [menuDir, setMenuDir] = useState<"left" | "right">("left");
  const [tapReveal, setTapReveal] = useState(false);
  const [canHover, setCanHover] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const withinEdit =
    Date.now() - new Date(m.createdAt).getTime() < EDIT_WINDOW_MS;
  const withinDelete =
    Date.now() - new Date(m.createdAt).getTime() < DELETE_WINDOW_MS;

  // why: only hover-capable inputs get the bubble-scoped group/msg reveal;
  // touch devices have no hover, so track that capability to drive the
  // tap-to-reveal fallback instead of relying on hover alone.
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover)");
    setCanHover(mq.matches);
    const onChange = () => setCanHover(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // why: close the menu on any outside mousedown; because mousedown fires
  // before click, a click on another message's button also collapses this
  // menu before that menu opens. On touch, the same outside tap hides the
  // tap-revealed button too — but taps on the bubble itself are left to the
  // bubble's toggle handler so the reveal state flips exactly once per tap.
  useEffect(() => {
    if (!menu && !(!canHover && tapReveal)) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      setMenu(false);
      if (!canHover && colRef.current && !colRef.current.contains(t)) {
        setTapReveal(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menu, canHover, tapReveal]);

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

  // why: pick the side of the button with more horizontal room inside the
  // scroll container so the menu is never clipped by .msgs overflow-y-auto.
  const toggleMenu = () => {
    if (!menu && btnRef.current) {
      const b = btnRef.current.getBoundingClientRect();
      const s = btnRef.current.closest(".msgs")?.getBoundingClientRect();
      if (s) {
        const leftRoom = b.left - s.left;
        const rightRoom = s.right - b.right;
        setMenuDir(leftRoom >= rightRoom ? "left" : "right");
      }
    }
    setMenu((v) => !v);
  };

  return (
    <div
      className={`msg-row my-0.5 flex items-end gap-[9px] animate-[pop_.16s_cubic-bezier(.2,.8,.2,1)] ${isOwn ? "justify-end" : ""}`}
      style={{ position: "relative" }}
    >
      {!isOwn && m.User && (
        <div className="mb-0.5 flex-none">
          <AvatarLink
            userId={m.User.id}
            name={m.User.displayName ?? m.User.username}
            avatar={m.User.avatar}
            size={30}
            square={isRoom}
          />
        </div>
      )}

      <div
        ref={colRef}
        className={`col flex min-w-0 max-w-[min(74%,560px)] flex-col ${isOwn ? "items-end" : ""}`}
      >
        <div
          className={`meta mx-[5px] mb-[3px] flex items-baseline gap-[7px] text-[11px] font-bold text-muted ${isOwn ? "justify-end" : ""}`}
        >
          {isRoom && !isOwn && firstOfSender && m.User && (
            <span className="who font-extrabold text-fg">
              <NameLink userId={m.User.id} name={displayName(m.User)} />
            </span>
          )}
          {isOwn && <span className="who font-extrabold text-fg">You</span>}
          {!m.isDeleted && <span>{fmtTime(m.createdAt)}</span>}
          {m.editedAt && !m.isDeleted && (
            <span className="edited opacity-85">edited</span>
          )}
        </div>

        {m.isDeleted ? (
          <div className="bubble rounded-br-[6px] rounded-bl-[18px] rounded-[18px] border border-border bg-surface-2 px-[13px] py-[9px] text-[14.5px] leading-[1.45] italic opacity-70 text-muted break-words break-anywhere">
            This message was deleted
          </div>
        ) : (
          <div
            className={`bubble group/msg relative rounded-[18px] px-[13px] py-[9px] text-[14.5px] leading-[1.45] break-words break-anywhere ${
              isOwn
                ? "rounded-br-[6px] rounded-bl-[18px] border-transparent bg-accent-btn text-accent-on"
                : "rounded-bl-[6px] rounded-br-[18px] border border-border bg-surface-2"
            }`}
            onClick={
              !canHover && isOwn && !m.isDeleted && (withinEdit || withinDelete)
                ? () => setTapReveal((v) => !v)
                : undefined
            }
          >
            {isOwn && (withinEdit || withinDelete) && (
              <div
                ref={wrapRef}
                className={`absolute ${
                  canHover || tapReveal ? "" : "pointer-events-none"
                }`}
                style={{
                  right: "100%",
                  top: "50%",
                  transform: "translateY(-50%)",
                }}
              >
                {/* why: the action button and menu are DOM children of the
                    bubble so hovering them counts as hovering the bubble —
                    the named group group/msg only reacts to THIS bubble, not
                    the dashboard root's plain `group` class. The button is
                    positioned outside the bubble's box (its right edge sits
                    5px to the left of the bubble, keeping the old flex gap)
                    so the reveal area stays contiguous with the bubble. */}
                <button
                  ref={btnRef}
                  className={`mr-[5px] rounded-full text-muted transition-opacity duration-150 ease-app cursor-pointer ${
                    canHover
                      ? "opacity-0 pointer-events-none group-hover/msg:opacity-100 group-hover/msg:pointer-events-auto"
                      : tapReveal
                        ? "opacity-100 pointer-events-auto"
                        : "opacity-0 pointer-events-none"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMenu();
                  }}
                  aria-label="Message actions"
                >
                  <MoreIcon className="h-5 w-5" />
                </button>
                {menu && (
                  <div
                    className="absolute z-[90] min-w-[190px] rounded-[14px] border border-border bg-surface p-1.5 shadow-lg animate-[pop_.13s_cubic-bezier(.2,.8,.2,1)]"
                    style={
                      menuDir === "left"
                        ? {
                            right: "calc(100% + 8px)",
                            top: "50%",
                            transform: "translateY(-50%)",
                          }
                        : {
                            left: "calc(100% + 8px)",
                            top: "50%",
                            transform: "translateY(-50%)",
                          }
                    }
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
              </div>
            )}
            {/* A pending voice message has no attachment yet (upload happens
                before send) — show a placeholder instead of an empty bubble.
                The real bubble swaps in with the player once the upload lands. */}
            {m.pending && m.messageType === "VOICE" ? (
              <span className="opacity-80">🎤 Voice message…</span>
            ) : (
              <>
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
                      <AttachmentCard
                        key={att.id}
                        att={att}
                        isOwn={isOwn}
                        messageType={m.messageType}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {ticks}
      </div>
    </div>
  );
}

function AttachmentCard({
  att,
  isOwn,
  messageType,
}: {
  att: Attachment;
  isOwn: boolean;
  messageType?: string;
}) {
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
  // Voice messages use the compact custom player (waveform, scrub, global
  // single-playback) instead of the native <audio controls> used for regular
  // audio attachments.
  if (messageType === "VOICE") {
    return (
      <div
        className={`at mt-2 flex min-w-[240px] max-w-[300px] items-center rounded-xl border px-2.5 py-2 ${cardCls}`}
      >
        {url ? (
          <VoiceMessagePlayer
            attachmentId={att.id}
            url={url}
            durationSeconds={att.duration ?? 0}
            waveformPeaks={att.waveformPeaks ?? null}
          />
        ) : (
          <span className="text-[12.5px] font-semibold text-muted">
            Loading voice message…
          </span>
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
