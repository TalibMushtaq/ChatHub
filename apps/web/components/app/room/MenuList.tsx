"use client";

// Shared dropdown menu list used by the channel/category context menus. Items
// mirror the RoomHeaderMenu styling so every popover in the room sidebar looks
// identical; the trigger handles positioning + outside-click/Escape dismissal.
import { useEffect, useRef, type ReactNode } from "react";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function MenuList({ items }: { items: MenuItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // auto-focus the first button
    const buttons = containerRef.current?.querySelectorAll("button");
    if (buttons && buttons.length > 0) {
      (buttons[0] as HTMLButtonElement).focus();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const buttons = Array.from(containerRef.current?.querySelectorAll("button") ?? []);
    if (!buttons.length) return;
    const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = (idx + 1) % buttons.length;
      buttons[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = (idx - 1 + buttons.length) % buttons.length;
      buttons[prev]?.focus();
    }
  };

  return (
    <div className="p-1.5" ref={containerRef} onKeyDown={handleKeyDown} role="menu">
      {items.map((it) => (
        <button
          key={it.label}
          role="menuitem"
          className={`flex w-full cursor-pointer items-center gap-[11px] rounded-[9px] px-3 py-2.5 text-left text-[13.5px] font-extrabold transition-colors duration-150 ease-app hover:bg-surface-2 disabled:cursor-default disabled:opacity-55 ${
            it.danger ? "text-danger" : "text-fg"
          }`}
          onClick={it.onClick}
          disabled={it.disabled}
        >
          {it.icon}
          <span className="min-w-0 flex-1 truncate">{it.label}</span>
        </button>
      ))}
    </div>
  );
}
