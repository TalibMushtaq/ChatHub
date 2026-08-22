"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCallStore } from "../callStore";
import { useShell } from "../state";
import WidgetMinimized from "./WidgetMinimized";
import WidgetExpanded from "./WidgetExpanded";
import WidgetMobileDocked from "./WidgetMobileDocked";
import { clampPos } from "./utils";

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
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const elRef = useRef<HTMLDivElement>(null);

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
    setStoredPos(pos);
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
      className={`w-80 rounded-2xl border border-border bg-surface shadow-2xl select-none transition-shadow ${
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
  const { active } = useShell();

  if (!activeChannelId || !activeRoomId) return null;

  const isViewingVoiceChannel =
    active?.kind === "room" &&
    active.id === activeRoomId &&
    active.channelId === activeChannelId;

  if (isViewingVoiceChannel) return null;

  return (
    <ResponsiveWidgetRoot roomId={activeRoomId} channelId={activeChannelId} />
  );
}
