"use client";

// Voice recording surface for the composer. Mounted by ThreadPanel when the
// user taps the mic button; owns the whole lifecycle: mic permission request,
// MediaRecorder capture, live AnalyserNode waveform + timer, a review step
// (cancel vs. send), and inline error states for denial/unsupported cases.
// Tap-to-toggle (not press-and-hold) so touch scrolling never conflicts with
// the gesture — the mic button just mounts/unmounts this component.
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { computeWaveformPeaks, pickAudioMime } from "../../app/lib/attachments";
import { fmtDuration } from "./helpers";
import { CloseIcon, SendIcon } from "./icons";

const MAX_SECONDS = 300;
// Live waveform bar count; the persisted peaks snapshot is coarser.
const LIVE_BARS = 40;
const PERSISTED_BARS = 48;
const PEAK_SAMPLE_MS = 250;

export type VoicePhase =
  "starting" | "recording" | "review" | "sending" | "error";

export interface VoiceRecorderHandle {
  /** Stop the active recording and move to the review step. */
  stop: () => void;
}

export interface VoiceRecorderProps {
  /** Upload + send the finished recording. Throws to surface send errors. */
  onSend: (
    blob: Blob,
    durationSeconds: number,
    waveformPeaks: number[],
  ) => Promise<void>;
  /** Discard the recording entirely (no upload). */
  onCancel: () => void;
  /** Mirrors the internal phase so the composer's mic button can restyle. */
  onPhaseChange?: (phase: VoicePhase) => void;
}

const VoiceRecorder = forwardRef<VoiceRecorderHandle, VoiceRecorderProps>(
  function VoiceRecorder({ onSend, onCancel, onPhaseChange }, ref) {
    const [phase, setPhase] = useState<VoicePhase>("starting");
    const [elapsed, setElapsed] = useState(0);
    const [liveBars, setLiveBars] = useState<number[]>([]);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const changePhase = useCallback(
      (p: VoicePhase) => {
        setPhase(p);
        onPhaseChange?.(p);
      },
      [onPhaseChange],
    );

    const chunksRef = useRef<Blob[]>([]);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const ctxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const rafRef = useRef<number | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const peakTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const peaksRef = useRef<number[]>([0.3]);
    const startTsRef = useRef<number>(0);
    const resultRef = useRef<{
      blob: Blob;
      durationSeconds: number;
      peaks: number[];
    } | null>(null);

    // Stop the capture pipeline (tracks, audio context, animation + timers).
    const teardown = useCallback(() => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      if (peakTimerRef.current) clearInterval(peakTimerRef.current);
      peakTimerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      void ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      analyserRef.current = null;
    }, []);

    // Finish recording: stop the MediaRecorder, which fires onstop with the
    // assembled blob, then show the review step.
    const stop = useCallback(() => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    }, []);

    useImperativeHandle(ref, () => ({ stop }), [stop]);

    useEffect(() => {
      let cancelled = false;

      async function start() {
        // Requesting the mic can throw (NotAllowedError, NotFoundError, …);
        // surface a clear inline message instead of failing silently.
        let stream: MediaStream;
        try {
          if (typeof MediaRecorder === "undefined") {
            throw new Error("Recording is not supported in this browser");
          }
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
          if (cancelled) return;
          const name = (err as { name?: string })?.name;
          setErrorMsg(
            name === "NotAllowedError"
              ? "Microphone access denied — allow the mic in your browser settings."
              : "Couldn't start the microphone.",
          );
          changePhase("error");
          return;
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        // Web Audio chain for the live waveform: source -> analyser. The
        // context is resumed explicitly because browsers start it suspended
        // until a user gesture on some platforms.
        const ctx = new AudioContext();
        await ctx.resume();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        ctxRef.current = ctx;
        analyserRef.current = analyser;

        const mime = pickAudioMime();
        const recorder = new MediaRecorder(stream, {
          mimeType: mime,
          audioBitsPerSecond: 64000,
        });
        recorderRef.current = recorder;
        chunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mime });
          const durationSeconds = (Date.now() - startTsRef.current) / 1000;
          const peaks = peaksRef.current;
          resultRef.current = { blob, durationSeconds, peaks };
          changePhase("review");
        };
        recorder.start(250);

        startTsRef.current = Date.now();
        changePhase("recording");
        setElapsed(0);

        // Live waveform loop (requestAnimationFrame) plus a coarser peaks
        // snapshot saved periodically for the persisted playback waveform.
        const tick = () => {
          if (analyserRef.current) {
            setLiveBars(computeWaveformPeaks(analyserRef.current, LIVE_BARS));
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);

        timerRef.current = setInterval(() => {
          const s = (Date.now() - startTsRef.current) / 1000;
          setElapsed(s);
          // Auto-stop at the cap with a visible countdown handled by the bar
          // rendering the remaining seconds once it's close to the limit.
          if (s >= MAX_SECONDS) stop();
        }, 250);

        peakTimerRef.current = setInterval(() => {
          if (analyserRef.current) {
            peaksRef.current = computeWaveformPeaks(
              analyserRef.current,
              PERSISTED_BARS,
            );
          }
        }, PEAK_SAMPLE_MS);
      }

      void start();
      return () => {
        cancelled = true;
        teardown();
      };
      // changePhase is a stable callback (only depends on onPhaseChange), so
      // including it here never re-runs the recording setup mid-capture.
    }, [stop, teardown, changePhase]);

    async function handleSend() {
      const result = resultRef.current;
      if (!result) return;
      // A tap-tap (or nearly-empty capture) yields a sub-second blob the server
      // would reject on size alone; surface it here so the user can discard
      // instead of hitting a confusing upload error.
      if (result.durationSeconds < 1 || result.blob.size === 0) {
        setErrorMsg("Recording too short — try again.");
        changePhase("error");
        return;
      }
      changePhase("sending");
      try {
        await onSend(result.blob, result.durationSeconds, result.peaks);
        // Parent resets voicePhase to idle on success, unmounting us.
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "Failed to send the voice message",
        );
        changePhase("error");
      }
    }

    if (phase === "starting") {
      return (
        <div className="voice-bar flex items-center gap-2.5 rounded-2xl border border-border bg-surface-2 px-3 py-2 text-[13px] font-semibold text-muted">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-danger" />
          Starting microphone…
        </div>
      );
    }

    if (phase === "error") {
      return (
        <div className="voice-bar flex items-center gap-2.5 rounded-2xl border border-danger/40 bg-danger-wash px-3 py-2 text-[13px] font-semibold text-danger">
          <span className="min-w-0 flex-1">{errorMsg}</span>
          <button
            className="cursor-pointer rounded-lg px-2 py-1 text-[12px] font-extrabold transition-colors duration-150 ease-app hover:bg-danger/10"
            onClick={onCancel}
          >
            Close
          </button>
        </div>
      );
    }

    if (phase === "review" || phase === "sending") {
      const result = resultRef.current;
      const duration = result?.durationSeconds ?? 0;
      return (
        <div className="voice-bar mb-2 flex items-center gap-2.5 rounded-2xl border border-border bg-surface-2 px-3 py-2">
          <span className="text-[12.5px] font-extrabold text-fg">
            {fmtDuration(duration)}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-muted">
            {phase === "sending" ? "Sending…" : "Ready to send"}
          </span>
          <button
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-muted transition-colors duration-150 ease-app hover:bg-surface hover:text-danger"
            onClick={onCancel}
            disabled={phase === "sending"}
            aria-label="Discard voice message"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
          <button
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-accent-btn text-accent-on transition-colors duration-150 ease-app hover:bg-accent-hover disabled:opacity-55"
            onClick={() => void handleSend()}
            disabled={phase === "sending"}
            aria-label="Send voice message"
          >
            <SendIcon className="h-4 w-4" />
          </button>
        </div>
      );
    }

    // Recording phase: live waveform + running timer + remaining-seconds
    // countdown in the last 10s before the auto-stop cap.
    const remaining = Math.max(0, MAX_SECONDS - elapsed);
    return (
      <div className="voice-bar mb-2 flex items-center gap-2.5 rounded-2xl border border-danger/40 bg-danger-wash px-3 py-2">
        <span className="flex h-2 w-2 flex-none animate-pulse rounded-full bg-danger" />
        <span className="w-[52px] flex-none text-[12.5px] font-extrabold tabular-nums text-danger">
          {fmtDuration(elapsed)}
        </span>
        <div
          className="flex min-w-0 flex-1 items-end gap-[2px]"
          aria-hidden="true"
        >
          {liveBars.map((v, i) => (
            <span
              key={i}
              className="min-w-[2px] flex-1 rounded-full bg-danger/70"
              style={{ height: `${Math.max(8, v * 26)}px` }}
            />
          ))}
        </div>
        {remaining <= 10 && (
          <span className="flex-none text-[12px] font-extrabold tabular-nums text-danger">
            {fmtDuration(remaining)}
          </span>
        )}
      </div>
    );
  },
);

export default VoiceRecorder;
