"use client";

// Lazy wrapper around the emoji-mart <emoji-picker> custom element. The
// picker bundle and emoji data are imported only when the picker is first
// opened (dynamic import), so they never ship in the initial chat bundle.
// The element is themed from ChatHubby's design tokens in globals.css, and
// skin tone + frequently-used emojis persist through emoji-mart's own
// localStorage store (keys `emoji-mart.skin` / `emoji-mart.frequently`),
// the same mechanism the app already uses for the theme pref.

import { useEffect, useRef } from "react";
import { cssVarResolved, cssVarRgb } from "./emojiTheme";

export interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

export default function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    let picker: HTMLElement | null = null;
    let observer: MutationObserver | null = null;

    void (async () => {
      const [{ Picker, init }, dataModule] = await Promise.all([
        import("emoji-mart"),
        import("@emoji-mart/data"),
      ]);
      if (cancelled) return;
      const container = containerRef.current;
      if (!container) return;

      const data = dataModule.default;
      await init({ data });

      const getTheme = () =>
        document.documentElement.getAttribute("data-theme") === "dark"
          ? "dark"
          : "light";

      const applyTheme = () => {
        if (!picker) return;
        picker.style.setProperty(
          "--rgb-background",
          cssVarRgb("--color-surface"),
        );
        picker.style.setProperty("--rgb-color", cssVarRgb("--color-fg"));
        picker.style.setProperty(
          "--rgb-accent",
          cssVarRgb("--color-accent-solid"),
        );
        picker.style.setProperty("--rgb-input", cssVarRgb("--color-surface-2"));
        picker.style.setProperty(
          "--color-border",
          cssVarResolved("--color-border-strong"),
        );
        picker.style.setProperty(
          "--color-border-over",
          cssVarResolved("--color-border-strong"),
        );
        picker.style.setProperty(
          "--font-family",
          cssVarResolved("--font-body"),
        );
        picker.style.setProperty("--border-radius", "0");
        picker.style.setProperty("--shadow", "none");
        picker.setAttribute("theme", getTheme());
      };

      picker = new Picker({
        data,
        onEmojiSelect: (emoji: { native?: string }) => {
          if (typeof emoji?.native === "string") {
            onSelectRef.current(emoji.native);
          }
        },
        autoFocus: false,
        dynamicWidth: true,
        maxFrequentRows: 4,
        navPosition: "top",
        previewPosition: "none",
        searchPosition: "sticky",
        skinTonePosition: "search",
        theme: getTheme(),
      }) as unknown as HTMLElement;

      picker.style.width = "100%";
      picker.style.height = "100%";
      applyTheme();
      container.appendChild(picker);

      observer = new MutationObserver(applyTheme);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      picker?.remove();
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}
