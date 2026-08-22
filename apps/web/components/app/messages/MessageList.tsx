"use client";

// Message timeline for a conversation: day dividers + grouped message rows,
// with optional upward cursor pagination for room channels. The scroll
// container is the flex-1 overflow element so parent flex layouts can size it.
import { useEffect, useRef, type ReactNode } from "react";
import { fmtDay } from "../helpers";
import type { Message, ReadReceipt } from "../types";
import { MessageRow } from "./MessageRow";

export function MessageList({
  messages,
  receipts,
  mine,
  isRoom,
  onEdit,
  onDelete,
  onDismissFailed,
  onLoadOlder,
  hasMore,
  loadingOlder,
  empty,
}: {
  messages: Message[];
  receipts?: ReadReceipt[];
  mine: string;
  isRoom: boolean;
  onEdit: (m: Message) => void;
  onDelete: (m: Message) => void;
  onDismissFailed: (messageId: string) => void;
  /** Called when the user scrolls to the top with more history available. */
  onLoadOlder?: () => void;
  hasMore?: boolean;
  loadingOlder?: boolean;
  /** Custom empty-state content (room channels use a welcome message). */
  empty?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // Scroll metrics captured right before an older-page fetch starts, so the
  // reader's position can be restored once the prepended rows render.
  const pendingRestoreRef = useRef<{
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const wasLoadingRef = useRef(false);
  // Re-entrancy guard for scroll-triggered older-page fetches.
  const loadingRef = useRef(false);

  // Scroll to the newest message when the timeline first appears or when a new
  // message lands at the bottom (unless the user is scrolled up reading).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Scroll to the newest message immediately on conversation switch.
  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [isRoom, mine]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    // Trigger an older-page fetch when the user reaches the top of the loaded
    // timeline. loadingRef guards against a burst of scroll events.
    if (el.scrollTop <= 40 && onLoadOlder && hasMore && !loadingOlder) {
      if (loadingRef.current) return;
      loadingRef.current = true;
      pendingRestoreRef.current = {
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
      };
      onLoadOlder();
      // Release the guard shortly after — the parent toggles loadingOlder to
      // re-block, and this fallback keeps scroll-triggered calls from stacking.
      setTimeout(() => {
        loadingRef.current = false;
      }, 600);
    }
  }

  // When an older-page fetch completes (loadingOlder true → false), reapply the
  // scroll delta so the timeline doesn't jump: prepended rows grow the content
  // below the current viewport, so scrollTop must grow by the same amount.
  useEffect(() => {
    if (loadingOlder) {
      wasLoadingRef.current = true;
      return;
    }
    if (wasLoadingRef.current && pendingRestoreRef.current) {
      const el = scrollRef.current;
      if (el) {
        const delta = el.scrollHeight - pendingRestoreRef.current.scrollHeight;
        el.scrollTop = pendingRestoreRef.current.scrollTop + delta;
      }
      pendingRestoreRef.current = null;
      wasLoadingRef.current = false;
    }
  }, [loadingOlder]);

  // Build a flat list with day dividers and per-sender first flags.
  const rows: Array<
    | { kind: "day"; day: string }
    | { kind: "msg"; m: Message; firstOfSender: boolean }
  > = [];
  let lastDay = "";
  let lastSender = "";
  for (const m of messages) {
    const day = fmtDay(m.createdAt);
    if (day !== lastDay) {
      rows.push({ kind: "day", day });
      lastDay = day;
    }
    rows.push({ kind: "msg", m, firstOfSender: m.senderId !== lastSender });
    lastSender = m.senderId ?? "";
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="msgs min-h-0 flex flex-1 flex-col overflow-y-auto"
    >
      {loadingOlder && (
        <div className="flex flex-col gap-3 px-4 pt-4 pb-2 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-end gap-[9px]">
              <div className="h-[30px] w-[30px] rounded-[12px] bg-surface-2 flex-none" />
              <div className="h-[36px] w-[180px] rounded-[18px] rounded-bl-[6px] bg-surface-2" />
            </div>
          ))}
        </div>
      )}
      <div className="msgs-inner w-full px-4 pt-4 pb-2">
        {rows.length === 0 && (
          <div className="empty-thread-msg flex flex-1 items-center justify-center p-5 text-sm text-muted">
            {empty ?? "No messages yet — say hi!"}
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
            <div key={row.m.id} data-msg-id={row.m.id}>
              <MessageRow
                m={row.m}
                isOwn={
                  row.m.senderId != null
                    ? row.m.senderId === mine
                    : row.m.User?.id === mine
                }
                firstOfSender={row.firstOfSender}
                isRoom={isRoom}
                mine={mine}
                receipts={receipts ?? []}
                onEdit={() => onEdit(row.m)}
                onDelete={() => onDelete(row.m)}
                onDismissFailed={(id) => onDismissFailed(id)}
              />
            </div>
          ),
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
