"use client";

// Shared message composer for DM and room-channel timelines: anchored, autosize
// multiline textarea (Enter sends, Shift+Enter newline), file attachments, emoji
// picker (bottom sheet on mobile / popover on desktop), voice recording, and
// the in-place edit box. Sending failures keep the typed text — only success
// clears the input (the optimistic bubble shows the failure).
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ActiveConv } from "../state";
import { socket } from "../../../app/lib/socket";
import { fmtBytes } from "../helpers";
import EmojiPicker from "../EmojiPicker";
import { insertEmojiAtCursor } from "../insertEmojiAtCursor";
import {
  CloseIcon,
  SendIcon,
  SmileyIcon,
  ClipIcon,
  MicIcon,
  StopIcon,
  iconForMime,
} from "../icons";
import VoiceRecorder, {
  type VoiceRecorderHandle,
  type VoicePhase,
} from "../VoiceRecorder";

// Desktop popover size (emoji-mart's default). Measured against the viewport
// so the popover flips above/below the button and clamps horizontally.
const PICKER_W = 352;
const PICKER_H = 435;

export function MessageComposer({
  active,
  placeholder,
  typingEnabled,
  onSend,
  onSendVoice,
  editing,
  editText,
  setEditText,
  onCancelEdit,
  onCommitEdit,
}: {
  active: ActiveConv;
  placeholder: string;
  /** user.showTypingStatus — when false the client never emits typing events. */
  typingEnabled: boolean;
  onSend: (text: string, files: File[]) => Promise<void>;
  onSendVoice: (
    blob: Blob,
    durationSeconds: number,
    waveformPeaks: number[],
    caption?: string,
  ) => Promise<void>;
  editing: { id: string; content: string } | null;
  editText: string;
  setEditText: (v: string) => void;
  onCancelEdit: () => void;
  onCommitEdit: () => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voicePhase, setVoicePhase] = useState<VoicePhase | null>(null);
  const voiceRef = useRef<VoiceRecorderHandle | null>(null);
  const [pickerPos, setPickerPos] = useState<{
    left: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const emojiBtnRef = useRef<HTMLButtonElement | null>(null);
  const pickerWrapRef = useRef<HTMLDivElement | null>(null);
  // Typing lifecycle: emit start on the first keystroke, re-emit every 2s so
  // the far side keeps the indicator during long pauses between keys, and stop
  // after 2.5s of inactivity. The server throttles to 1.5s anyway. `active`
  // is mirrored to a ref so these helpers stay stable across renders.
  const activeRef = useRef(active);
  activeRef.current = active;
  const typingEnabledRef = useRef(typingEnabled);
  typingEnabledRef.current = typingEnabled;
  const typingRef = useRef(false);
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track the Tailwind `md` breakpoint (768px) so the picker can be rendered
  // as a bottom sheet on mobile and a measured popover on desktop.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767.98px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  const emitTyping = useCallback((isTyping: boolean) => {
    const a = activeRef.current;
    if (!a) return;
    // Client-side mirror of the server's typing gate: when the user hides
    // their typing status we don't emit at all, saving the round trip.
    if (typingEnabledRef.current === false) return;
    if (a.kind === "dm") {
      socket.emit("directChat:typing", { directChatId: a.id, isTyping });
    } else {
      socket.emit("chatroom:typing", { roomId: a.id, isTyping });
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

  // Autosize the composer to fit the typed content (capped at 150px).
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 150)}px`;
    }
  }, [content]);

  // Reset composer state whenever the conversation changes, and make sure a
  // stale "typing" flag never leaks into the newly opened conversation.
  useEffect(() => {
    setContent("");
    setFiles([]);
    setIsEmojiPickerOpen(false);
    // A recording mid-flight across a conversation switch is always discarded
    // — never send audio into the wrong thread.
    setVoiceOpen(false);
    setVoicePhase(null);
    stopTyping();
  }, [active?.id, active?.channelId, stopTyping]);

  // Send the "stopped typing" event when the composer unmounts.
  useEffect(() => () => stopTyping(), [stopTyping]);

  // Insert an emoji at the textarea's current caret (replacing any selection),
  // leave the caret right after it, and keep focus in the composer. Closes the
  // picker after a single selection.
  function handleEmojiSelect(emoji: string) {
    const ta = textareaRef.current;
    if (ta) {
      insertEmojiAtCursor(ta, emoji, content, handleComposerChange);
    } else {
      handleComposerChange(content + emoji);
    }
    setIsEmojiPickerOpen(false);
  }

  // Close on outside click and Escape while the picker is open. Clicking the
  // emoji button itself is excluded — its own onClick toggles the state.
  useEffect(() => {
    if (!isEmojiPickerOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (pickerWrapRef.current?.contains(t)) return;
      if (emojiBtnRef.current?.contains(t)) return;
      setIsEmojiPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsEmojiPickerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isEmojiPickerOpen]);

  // Desktop: measure the emoji button and place the fixed popover just above
  // it, flipping below and clamping horizontally when the viewport is tight.
  useLayoutEffect(() => {
    if (!isEmojiPickerOpen || isMobile) {
      setPickerPos(null);
      return;
    }
    const measure = () => {
      const btn = emojiBtnRef.current;
      if (!btn) return;
      const b = btn.getBoundingClientRect();
      const left = Math.max(
        8,
        Math.min(b.right - PICKER_W, window.innerWidth - PICKER_W - 8),
      );
      const spaceAbove = b.top;
      if (spaceAbove >= PICKER_H + 8) {
        setPickerPos({ left, bottom: window.innerHeight - b.top + 8 });
      } else {
        setPickerPos({ left, top: b.bottom + 8 });
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isEmojiPickerOpen, isMobile]);

  const canSend = !uploading && (content.trim().length > 0 || files.length > 0);

  async function handleSend() {
    if (!canSend) return;
    const text = content.trim();
    setUploading(true);
    try {
      await onSend(text, files);
      // Only clear on success — a failed send preserves the typed text.
      setContent("");
      setFiles([]);
    } catch {
      // error toast handled by the caller
    } finally {
      setUploading(false);
      textareaRef.current?.focus();
    }
  }

  // Tap-to-toggle recording: first tap mounts the recorder, a second tap
  // (while capturing) stops it and reveals the review bar.
  function handleMicClick() {
    if (voiceOpen) {
      if (voicePhase === "recording") voiceRef.current?.stop();
    } else {
      setVoiceOpen(true);
    }
  }

  async function sendVoice(
    blob: Blob,
    durationSeconds: number,
    waveformPeaks: number[],
  ) {
    const caption = content.trim();
    try {
      await onSendVoice(blob, durationSeconds, waveformPeaks, caption);
      setVoiceOpen(false);
      setVoicePhase(null);
      setContent("");
    } catch {
      // error toast handled by the caller; recorder stays open for a retry.
    }
  }

  return (
    <div className="composer border-t border-border bg-surface p-[10px_14px_calc(10px+env(safe-area-inset-bottom))]">
      {editing ? (
        <div className="edit-box mt-1 mb-1 max-w-[min(74%,560px)] rounded-2xl border border-accent-solid bg-surface-2 p-2.5">
          <textarea
            className="min-h-11 max-h-[180px] w-full resize-none border-0 bg-transparent text-[14.5px] leading-[1.45] focus:outline-none"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onCommitEdit();
              }
              if (e.key === "Escape") onCancelEdit();
            }}
            placeholder="Edit message…"
            autoFocus
          />
          <div className="edit-actions mt-2 flex justify-end gap-2">
            <button
              className="cursor-pointer rounded-full px-3.5 py-[7px] text-[13px] font-extrabold text-muted transition-colors duration-150 ease-app hover:bg-surface-2"
              onClick={onCancelEdit}
            >
              Cancel
            </button>
            <button
              className="cursor-pointer rounded-full bg-accent-btn px-3.5 py-[7px] text-[13px] font-extrabold text-accent-on transition-colors duration-150 ease-app hover:bg-accent-hover disabled:opacity-55"
              onClick={() => void onCommitEdit()}
              disabled={!editText.trim()}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          {voiceOpen && (
            <VoiceRecorder
              ref={voiceRef}
              onPhaseChange={setVoicePhase}
              onCancel={() => {
                setVoiceOpen(false);
                setVoicePhase(null);
              }}
              onSend={sendVoice}
            />
          )}
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
            {!voiceOpen && (
              <button
                className="c-btn flex h-[42px] w-[42px] flex-none cursor-pointer items-center justify-center rounded-full text-muted transition-[color,background-color] duration-150 ease-app hover:bg-accent-soft hover:text-accent-solid"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach files"
              >
                <ClipIcon />
              </button>
            )}
            {!voiceOpen && (
              <button
                ref={emojiBtnRef}
                className={`c-btn flex h-[42px] w-[42px] flex-none cursor-pointer items-center justify-center rounded-full text-muted transition-[color,background-color] duration-150 ease-app hover:bg-accent-soft hover:text-accent-solid ${
                  isEmojiPickerOpen ? "bg-accent-soft text-accent-solid" : ""
                }`}
                onClick={() => setIsEmojiPickerOpen((v) => !v)}
                aria-label="Add emoji"
                aria-haspopup="dialog"
                aria-expanded={isEmojiPickerOpen}
              >
                <SmileyIcon />
              </button>
            )}
            <textarea
              ref={textareaRef}
              rows={1}
              className="max-h-[150px] min-w-0 flex-1 resize-none rounded-[20px] border-[1.5px] border-border bg-bg px-[15px] py-[11px] text-[15px] leading-[1.4] transition-[border-color,box-shadow] duration-150 ease-app focus:border-accent-solid focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-accent)_45%,transparent)] focus:outline-none"
              value={content}
              onChange={(e) => handleComposerChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !voiceOpen) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={placeholder}
            />
            <button
              className={`c-btn flex h-[42px] w-[42px] flex-none cursor-pointer items-center justify-center rounded-full transition-colors duration-150 ease-app ${
                voicePhase === "recording"
                  ? "bg-danger text-white hover:bg-danger/80"
                  : "text-muted hover:bg-accent-soft hover:text-accent-solid"
              }`}
              onClick={handleMicClick}
              aria-label={
                voicePhase === "recording"
                  ? "Stop recording"
                  : "Record a voice message"
              }
              aria-pressed={voicePhase === "recording"}
            >
              {voicePhase === "recording" ? (
                <StopIcon className="h-5 w-5" />
              ) : (
                <MicIcon className="h-5 w-5" />
              )}
            </button>
            {!voiceOpen && (
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
            )}
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

          {isEmojiPickerOpen &&
            (isMobile ? (
              <>
                <div
                  className="fixed inset-0 z-[100] bg-black/45"
                  onClick={() => setIsEmojiPickerOpen(false)}
                  aria-hidden="true"
                />
                <div
                  ref={pickerWrapRef}
                  role="dialog"
                  aria-label="Emoji picker"
                  className="fixed inset-x-0 bottom-0 z-[110] h-[55dvh] w-full overflow-hidden rounded-t-[18px] border-t border-border bg-surface shadow-lg"
                >
                  <EmojiPicker onSelect={handleEmojiSelect} />
                </div>
              </>
            ) : pickerPos ? (
              <div
                ref={pickerWrapRef}
                role="dialog"
                aria-label="Emoji picker"
                className="fixed z-[110] h-[435px] w-[352px] overflow-hidden rounded-2xl border border-border bg-surface shadow-lg"
                style={pickerPos}
              >
                <EmojiPicker onSelect={handleEmojiSelect} />
              </div>
            ) : null)}
        </>
      )}
    </div>
  );
}
