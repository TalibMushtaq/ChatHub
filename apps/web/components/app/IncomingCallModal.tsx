"use client";

import { useEffect, useRef } from "react";
import { useCallStore } from "./callStore";
import { useCallCtx } from "./CallProvider";
import AppAvatar from "./AppAvatar";
import { Phone, PhoneOff } from "lucide-react";
import { DmCallAPI } from "./api";

/**
 * Incoming DM call overlay — shown when another user initiates a voice/video
 * call to this user. Renders above all other UI (not in the modal stack) so
 * it can't be hidden behind a settings modal or similar. Plays a ringtone
 * while the call is ringing and stops it on accept/decline/dismiss.
 */
export default function IncomingCallModal() {
  const incomingCallInfo = useCallStore((s) => s.incomingCallInfo);
  const dmCallStatus = useCallStore((s) => s.dmCallStatus);
  const { acceptDmCall } = useCallCtx();
  const clearActiveCall = useCallStore((s) => s.clearActiveCall);
  const setIncomingCallInfo = useCallStore((s) => s.setIncomingCallInfo);
  const setDmCallStatus = useCallStore((s) => s.setDmCallStatus);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isVisible = incomingCallInfo && dmCallStatus === "INCOMING";

  // Play/stop ringtone based on incoming call state.
  useEffect(() => {
    if (!isVisible) return;

    const audio = new Audio("/sounds/ringtune.mp3");
    audio.loop = true;
    audio.volume = 0.6;
    audioRef.current = audio;

    // Play — browser may block autoplay, so catch and ignore.
    audio.play().catch(() => {});

    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [isVisible]);

  async function handleDecline() {
    if (!incomingCallInfo) return;
    try {
      await DmCallAPI.decline(incomingCallInfo.directChatId);
    } catch {
      // Best-effort — server may have already timed out the call.
    }
    setIncomingCallInfo(null);
    setDmCallStatus("IDLE");
    clearActiveCall();
  }

  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Incoming call"
    >
      {/* Backdrop — semi-opaque, no click-to-dismiss (must explicitly accept/decline). */}
      <div className="absolute inset-0 bg-[oklch(0_0_0/0.65)]" />

      {/* Card */}
      <div className="relative z-10 flex w-[min(380px,90vw)] flex-col items-center gap-5 rounded-[28px] border border-border bg-surface px-8 py-10 text-center shadow-2xl animate-[rise_.24s_cubic-bezier(.2,.8,.2,1)]">
        <AppAvatar
          name={incomingCallInfo.caller.displayName ?? incomingCallInfo.caller.username}
          src={incomingCallInfo.caller.avatar}
          size={80}
        />

        <div>
          <div className="text-[18px] font-extrabold text-fg">
            {incomingCallInfo.caller.displayName ?? incomingCallInfo.caller.username}
          </div>
          <div className="mt-1 text-[13px] text-muted">
            {incomingCallInfo.callType === "VIDEO" ? "Video" : "Voice"} call
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Decline */}
          <button
            onClick={() => void handleDecline()}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-white shadow-lg shadow-danger/30 transition-transform hover:scale-105 active:scale-95"
            aria-label="Decline call"
            title="Decline"
          >
            <PhoneOff size={28} />
          </button>

          {/* Accept */}
          <button
            onClick={() => void acceptDmCall(incomingCallInfo.directChatId)}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-white shadow-lg shadow-success/30 transition-transform hover:scale-105 active:scale-95"
            aria-label="Accept call"
            title="Accept"
          >
            <Phone size={28} />
          </button>
        </div>
      </div>
    </div>
  );
}
