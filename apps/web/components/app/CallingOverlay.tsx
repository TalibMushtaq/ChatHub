"use client";

import { useCallStore } from "./callStore";
import { DmCallAPI } from "./api";
import AppAvatar from "./AppAvatar";
import { PhoneOff, Loader2 } from "lucide-react";
import { useFocusTrap } from "./useFocusTrap";

/**
 * Outgoing DM call overlay — shown while the caller is waiting for the callee
 * to accept. Renders a "Calling…" card with a Cancel button. Distinct from the
 * incoming call modal; this shows for the caller's side only.
 */
export default function CallingOverlay() {
  const dmCallStatus = useCallStore((s) => s.dmCallStatus);
  const activeDirectChatId = useCallStore((s) => s.activeDirectChatId);
  const dmCallType = useCallStore((s) => s.dmCallType);
  const incomingCallInfo = useCallStore((s) => s.incomingCallInfo);
  const clearActiveCall = useCallStore((s) => s.clearActiveCall);

  const isVisible = dmCallStatus === "OUTGOING" && !!activeDirectChatId && !incomingCallInfo;
  // Trap focus inside the overlay while it's visible; restore on close.
  const dialogRef = useFocusTrap<HTMLDivElement>(isVisible);

  // Only show when the user initiated a call and is waiting for acceptance.
  if (!isVisible) {
    return null;
  }

  async function handleCancel() {
    try {
      await DmCallAPI.cancel(activeDirectChatId!);
    } catch {
      // Best-effort — server may have already timed out.
    }
    clearActiveCall();
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[200] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Calling"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[oklch(0_0_0/0.65)]" />

      {/* Card */}
      <div className="relative z-10 flex w-[min(380px,90vw)] flex-col items-center gap-5 rounded-[28px] border border-border bg-surface px-8 py-10 text-center shadow-2xl animate-[rise_.24s_cubic-bezier(.2,.8,.2,1)]">
        <AppAvatar name="Calling…" size={80} />

        <div>
          <div className="text-[18px] font-extrabold text-fg">Calling…</div>
          <div className="mt-1 text-[13px] text-muted">
            {dmCallType === "VIDEO" ? "Video" : "Voice"} call
          </div>
        </div>

        <Loader2 size={24} className="animate-spin text-muted" />

        {/* Cancel */}
        <button
          onClick={() => void handleCancel()}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-white shadow-lg shadow-danger/30 transition-transform hover:scale-105 active:scale-95"
          aria-label="Cancel call"
          title="Cancel"
        >
          <PhoneOff size={28} />
        </button>
      </div>
    </div>
  );
}
