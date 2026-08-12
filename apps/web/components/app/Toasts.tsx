"use client";

// Stacked toast notifications, auto-dismissed by the shell after a few seconds.
import { useShell } from "./state";

export function Toasts() {
  const { toasts } = useShell();
  if (toasts.length === 0) return null;
  return (
    <>
      {toasts.map((t, i) => (
        <div
          key={t.id}
          className="toast show fixed bottom-[26px] left-1/2 z-[100] max-w-[88vw] -translate-x-1/2 rounded-full bg-fg px-[18px] py-3 text-center text-sm font-extrabold text-bg shadow-lg animate-[pop_.2s_cubic-bezier(.2,.8,.2,1)]"
          style={{ bottom: 26 + i * 50 }}
        >
          {t.text}
        </div>
      ))}
    </>
  );
}
