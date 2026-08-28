"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCallStore } from "../callStore";
import { useShell } from "../state";
import { useCallCtx } from "../CallProvider";
import WidgetMinimized from "./WidgetMinimized";
import WidgetExpanded from "./WidgetExpanded";
import WidgetMobileDocked from "./WidgetMobileDocked";
import { clampPos } from "./utils";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { iconBtn } from "../styles";
import { Tooltip } from "../Tooltip";

const WIDGET_W = 320;

interface DraggableWidgetProps {
  roomId: string;
  channelId: string;
}

function DraggableWidgetShell({ roomId, channelId }: DraggableWidgetProps) {
  const storedPos = useCallStore((s) => s.widgetPosition);
  const setStoredPos = useCallStore((s) => s.setWidgetPosition);
  const isExpanded = useCallStore((s) => s.isWidgetExpanded);

  const defaultPos = () => ({
    x: typeof window !== "undefined" ? window.innerWidth - WIDGET_W - 16 : 0,
    y: typeof window !== "undefined" ? window.innerHeight - 180 : 0,
  });

  const [pos, setPos] = useState<{ x: number; y: number }>(
    storedPos ?? defaultPos(),
  );
  // Mirror of `pos` that survives between renders so pointer-up (which can fire
  // before the last move re-renders) persists the latest position.
  const posRef = useRef(pos);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  const getClampedPos = useCallback((x: number, y: number) => {
    const el = elRef.current;
    const w = el?.offsetWidth ?? WIDGET_W;
    const h = el?.offsetHeight ?? 120;
    return clampPos(x, y, w, h, window.innerWidth, window.innerHeight);
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button")) return;
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    setPos(
      getClampedPos(e.clientX - offset.current.x, e.clientY - offset.current.y),
    );
  }

  function onPointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    setStoredPos(posRef.current);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step = 8;
    const moves: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      setPos((p) => getClampedPos(p.x + move.x, p.y + move.y));
    }
  }

  useEffect(() => {
    function onResize() {
      setPos((p) => getClampedPos(p.x, p.y));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [getClampedPos]);

  return (
    <div
      ref={elRef}
      role="region"
      aria-label="Active call"
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 100 }}
      className={`w-80 rounded-2xl border border-border bg-surface shadow-2xl select-none transition-shadow focus-visible:ring-2 focus-visible:ring-accent ${
        isExpanded ? "" : "hover:shadow-lg"
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <div
        role="status"
        aria-live="polite"
        aria-atomic
        className="sr-only"
        id="call-live-region"
      />
      {isExpanded ? (
        <WidgetExpanded roomId={roomId} channelId={channelId} />
      ) : (
        <WidgetMinimized roomId={roomId} channelId={channelId} />
      )}
    </div>
  );
}

function ResponsiveWidgetRoot({
  roomId,
  channelId,
}: {
  roomId: string;
  channelId: string;
}) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isMobile ? (
    <WidgetMobileDocked roomId={roomId} channelId={channelId} />
  ) : (
    <DraggableWidgetShell roomId={roomId} channelId={channelId} />
  );
}

export default function FloatingCallWidget() {
  const activeChannelId = useCallStore((s) => s.activeChannelId);
  const activeRoomId = useCallStore((s) => s.activeRoomId);
  const activeDirectChatId = useCallStore((s) => s.activeDirectChatId);
  const { active } = useShell();

  // Room voice channel widget
  if (activeChannelId && activeRoomId) {
    const isViewingVoiceChannel =
      active?.kind === "room" &&
      active.id === activeRoomId &&
      active.channelId === activeChannelId;

    if (!isViewingVoiceChannel) {
      return (
        <ResponsiveWidgetRoot
          roomId={activeRoomId}
          channelId={activeChannelId}
        />
      );
    }
  }

  // DM call widget — show when in an active DM call but not viewing the DM thread.
  if (activeDirectChatId) {
    const isViewingDm =
      active?.kind === "dm" && active.id === activeDirectChatId;
    if (!isViewingDm) {
      return <DmCallWidget directChatId={activeDirectChatId} />;
    }
  }

  return null;
}

/**
 * Floating widget for active DM calls. Shows the call partner's name, a timer,
 * mute/leave controls. Drag behavior is omitted for DM calls since they're
 * typically 1:1 and the user is unlikely to navigate away.
 */
function DmCallWidget({ directChatId }: { directChatId: string }) {
  const { dmList } = useShell();
  const { toggleMute, leaveCall } = useCallCtx();
  const connectionState = useCallStore((s) => s.connectionState);
  const callStartedAt = useCallStore((s) => s.callStartedAt);
  const isMuted = useCallStore((s) => s.isMuted);

  const entry = dmList.find((e) => e.directChatId === directChatId);
  const partnerName = entry?.otherUser
    ? (entry.otherUser.displayName ?? entry.otherUser.username)
    : "Call";

  const dotClass =
    connectionState === "connected"
      ? "bg-success"
      : connectionState === "reconnecting" || connectionState === "connecting"
        ? "bg-warning animate-pulse"
        : "bg-danger";

  return (
    <div
      role="region"
      aria-label="Active DM call"
      className="fixed bottom-4 right-4 z-[100] w-72 rounded-2xl border border-border bg-surface shadow-2xl"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <div className={`w-2 h-2 rounded-full flex-none ${dotClass}`} />
        <span className="truncate text-xs font-extrabold">{partnerName}</span>
        {callStartedAt && <CallTimer startedAt={callStartedAt} />}
      </div>

      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1">
          <Tooltip label={isMuted ? "Unmute" : "Mute"}>
            <button
              onClick={toggleMute}
              aria-pressed={isMuted}
              aria-label={isMuted ? "Unmute" : "Mute"}
              className={`${iconBtn} p-1.5 rounded-full ${isMuted ? "bg-danger-soft text-danger" : ""}`}
            >
              {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
          </Tooltip>

          <Tooltip label="Leave call">
            <button
              onClick={leaveCall}
              className="p-1.5 rounded-full bg-danger text-white hover:bg-danger/80 ml-1"
              aria-label="Leave call"
            >
              <PhoneOff size={14} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function CallTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(Date.now() - startedAt);
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const s = Math.floor(elapsed / 1000);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    <span className="ml-auto tabular-nums text-xs text-muted font-mono">
      {String(m).padStart(2, "0")}:{String(sec).padStart(2, "0")}
    </span>
  );
}
