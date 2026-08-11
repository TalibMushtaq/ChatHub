import { useEffect, useState } from "react";

// Unified theme hook: drives the `data-theme` attribute on <html> (used by the
// landing page design system) while keeping the legacy `.light` class so the
// Tailwind `--color-*` light overrides keep applying app-wide.
function apply(theme: "dark" | "light") {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.classList.toggle("light", theme === "light");
}

export function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as "dark" | "light" | null;
    if (saved) {
      setTheme(saved);
      apply(saved);
    }
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    apply(next);
  };

  return { theme, toggle };
}
