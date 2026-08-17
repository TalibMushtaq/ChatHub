"use client";

// Compact voice-message player bubble. Rendered inside a message bubble for
// VOICE attachments; playback is delegated to the shared module-level Audio
// element (voicePlayback.ts), so only one voice message can play at a time
// anywhere in the app. Scrub bar doubles as the waveform — click (or arrow
// keys) to seek, filled bars show playback progress.
import { useRef } from "react";
import { fmtDuration } from "./helpers";
import { useVoicePlayback } from "./voicePlayback";
import { PauseIcon, PlayIcon } from "./icons";

// Fallback bars when a legacy attachment predates waveformPeaks storage: a
// deterministic pseudo-wave so the bubble still reads as a voice message.
const FALLBACK_BARS = 40;
function fallbackPeaks(id: string): number[] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const peaks: number[] = [];
  for (let i = 0; i < FALLBACK_BARS; i++) {
    const t = (h + i * 17) % 100;
    peaks.push(0.22 + 0.5 * Math.abs(Math.sin(t)) + (i % 5) * 0.02);
  }
  return peaks.map((v) => Math.min(1, v));
}

export default function VoiceMessagePlayer({
  attachmentId,
  url,
  durationSeconds,
  waveformPeaks,
}: {
  attachmentId: string;
  url: string;
  durationSeconds: number;
  waveformPeaks: number[] | null;
}) {
  const { playing, loading, error, currentTime, duration, toggle, seek } =
    useVoicePlayback(attachmentId, url);
  const waveRef = useRef<HTMLDivElement | null>(null);

  const total = duration > 0 ? duration : durationSeconds;
  const progress = total > 0 ? Math.min(1, currentTime / total) : 0;
  const bars = waveformPeaks?.length
    ? waveformPeaks
    : fallbackPeaks(attachmentId);

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const el = waveRef.current;
    if (!el || total <= 0) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    seek(frac * total);
  }

  function handleKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (total <= 0) return;
    const STEP = 5;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      seek(Math.min(total, currentTime + STEP));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      seek(Math.max(0, currentTime - STEP));
    } else if (e.key === "Home") {
      e.preventDefault();
      seek(0);
    } else if (e.key === "End") {
      e.preventDefault();
      seek(total);
    }
  }

  if (error) {
    return (
      <div className="flex min-w-[220px] items-center gap-2.5 text-[12.5px] font-semibold text-danger">
        <span className="min-w-0 flex-1 truncate">
          Couldn&apos;t load voice message
        </span>
        <button
          className="cursor-pointer rounded-lg px-2 py-1 text-[12px] font-extrabold transition-colors duration-150 ease-app hover:bg-black/10"
          onClick={toggle}
          aria-label="Retry playing voice message"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-[240px] items-center gap-2">
      <button
        className="flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-full bg-current/15 text-current transition-colors duration-150 ease-app hover:bg-current/25"
        onClick={toggle}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        aria-pressed={playing}
      >
        {playing ? (
          <PauseIcon className="h-[18px] w-[18px]" />
        ) : (
          <PlayIcon className="ml-[2px] h-[18px] w-[18px]" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div
          ref={waveRef}
          role="slider"
          aria-label="Voice message progress"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={`${fmtDuration(currentTime)} of ${fmtDuration(total)}`}
          tabIndex={0}
          className="flex h-7 cursor-pointer items-center gap-[2px] outline-none focus-visible:opacity-80"
          onClick={handleSeek}
          onKeyDown={handleKey}
        >
          {bars.map((v, i) => {
            const played = bars.length > 0 && i / bars.length <= progress;
            return (
              <span
                key={i}
                className={`min-w-[2px] flex-1 rounded-full transition-colors duration-150 ease-app ${
                  played ? "bg-current opacity-90" : "bg-current opacity-25"
                }`}
                style={{ height: `${Math.max(8, Math.round(v * 26))}px` }}
              />
            );
          })}
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[10.5px] font-bold tabular-nums opacity-75">
          <span>{loading ? "Loading…" : fmtDuration(currentTime)}</span>
          <span>{fmtDuration(total)}</span>
        </div>
      </div>
    </div>
  );
}
