import { useEffect, useRef } from "react";

/**
 * Modal focus management: moves focus into the dialog on open, traps Tab /
 * Shift+Tab within it, and restores focus to the previously-focused element on
 * close. `active` must be true while the dialog is rendered so the effect
 * (and its cleanup) runs on the correct lifecycle boundary — call it even
 * when the dialog is conditionally hidden via `return null`.
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  active: boolean,
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const el = ref.current;
    if (el) {
      el.setAttribute("tabindex", "-1");
      el.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !ref.current) return;
      const focusables = ref.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [active]);

  return ref;
}
