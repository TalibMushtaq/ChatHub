"use client";

// Stacked toast notifications, auto-dismissed by the shell after a few seconds.
import { X } from "lucide-react";
import { useShell } from "./state";

export function Toasts() {
  const { toasts, dismissToast } = useShell();
  if (toasts.length === 0) return null;
  return (
    <>
      {toasts.map((t, i) => (
        <div
          key={t.id}
          className={`toast show fixed left-1/2 z-[100] max-w-[88vw] flex items-center gap-3 -translate-x-1/2 rounded-full px-[18px] py-3 text-[13.5px] font-extrabold shadow-lg animate-[pop_.2s_cubic-bezier(.2,.8,.2,1)] ${
            t.type === "error"
              ? "bg-danger text-white"
              : t.type === "success"
                ? "bg-success text-white"
                : "bg-fg text-bg"
          }`}
          style={{ bottom: 26 + i * 50 }}
        >
          <span className="truncate">{t.text}</span>
          <button
            onClick={() => dismissToast(t.id)}
            className="flex-none rounded-full p-0.5 opacity-70 hover:opacity-100 transition-opacity"
            aria-label="Dismiss toast"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </>
  );
}
