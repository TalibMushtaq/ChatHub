"use client";

// Stacked toast notifications, auto-dismissed by the shell after a few seconds.
import { useShell } from "./state";

export function Toasts() {
  const { toasts } = useShell();
  if (toasts.length === 0) return null;
  return (
    <>
      {toasts.map((t, i) => (
        <div key={t.id} className="toast show" style={{ bottom: 26 + i * 50 }}>
          {t.text}
        </div>
      ))}
    </>
  );
}
