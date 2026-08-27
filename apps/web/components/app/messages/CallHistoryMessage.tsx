"use client";

import { PhoneCall, PhoneMissed, PhoneOff, PhoneForwarded } from "lucide-react";
import type { Message } from "../types";

/** Shape of the `metadata` object the server attaches to call-history messages. */
type CallMeta = {
  kind?: string;
  callType?: "VOICE" | "VIDEO";
  outcome?: "COMPLETED" | "MISSED" | "DECLINED" | "CANCELLED";
  durationSeconds?: number | null;
};

/** Pill tint per call outcome — tested as a pure function. */
export function callHistoryTint(
  outcome: NonNullable<CallMeta["outcome"]> | undefined,
): string {
  switch (outcome) {
    case "MISSED":
      return "bg-danger-soft text-danger";
    case "DECLINED":
      return "bg-warning/15 text-warning";
    case "CANCELLED":
      return "bg-surface-2 text-muted";
    default:
      return "bg-success-wash text-success";
  }
}

/**
 * Centered call-history line for SYSTEM messages, e.g. "Missed voice call".
 * Distinct from day dividers so users can tell a status line apart from a
 * conversation break. Outcome drives the tint + icon; the human-readable text
 * already ships from the server via `content`.
 */
export default function CallHistoryMessage({ m }: { m: Message }) {
  const meta = (m.metadata ?? {}) as CallMeta;

  if (meta.kind !== "call") {
    // Unknown system message — fall back to a plain centered status line.
    return (
      <div className="my-3 flex justify-center px-4">
        <span className="max-w-[80%] text-center text-[12px] font-bold text-muted">
          {m.content}
        </span>
      </div>
    );
  }

  const variants: Record<
    NonNullable<CallMeta["outcome"]>,
    { Icon: typeof PhoneCall }
  > = {
    MISSED: { Icon: PhoneMissed },
    DECLINED: { Icon: PhoneOff },
    CANCELLED: { Icon: PhoneForwarded },
    COMPLETED: { Icon: PhoneCall },
  };
  const { Icon } = variants[meta.outcome ?? "COMPLETED"];
  const cls = callHistoryTint(meta.outcome);

  return (
    <div className="my-3 flex justify-center px-4">
      <span
        className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-extrabold ${cls}`}
      >
        <Icon size={14} className="flex-none" />
        {m.content}
      </span>
    </div>
  );
}
