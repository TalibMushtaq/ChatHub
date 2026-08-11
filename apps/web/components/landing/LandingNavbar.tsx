"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mascot } from "./Mascot";
import { MenuIcon, MoonIcon, SunIcon } from "./icons";

function useThemeState() {
  // Initialized to "light" so SSR markup is deterministic (no hydration
  // mismatch); the real persisted theme is picked up after mount.
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    if (t === "dark" || t === "light") setTheme(t);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.classList.toggle("light", next === "light");
    try {
      localStorage.setItem("theme", next);
    } catch {
      // ignore private-mode quota errors
    }
  };

  return { theme, toggle };
}

export function LandingNavbar() {
  const { theme, toggle } = useThemeState();
  const [open, setOpen] = useState(false);

  const navLinks = [
    { href: "#positioning", label: "Why ChatHubby" },
    { href: "#features", label: "Features" },
    { href: "#personality", label: "Personality" },
  ];

  return (
    <header className="topbar" data-od-id="topbar">
      <div className="container topbar-inner">
        <Link className="logo" href="#top" aria-label="ChatHubby home">
          <Mascot expr="smile" />
          <span className="logo-text">
            <span>Chat</span>
            <span className="accent">Hubby</span>
          </span>
        </Link>
        <nav className="nav" aria-label="Primary">
          {navLinks.map((l) => (
            <a key={l.href} className="nav-link" href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="topbar-actions">
          <button
            className="icon-btn theme-btn"
            onClick={toggle}
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            data-od-id="theme-toggle"
          >
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
          <Link className="btn btn-ghost" href="/auth">
            Get the app
          </Link>
          <button
            className="icon-btn menu-btn"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobileNav"
          >
            <MenuIcon />
          </button>
        </div>
      </div>
      {open && (
        <div className="mobile-nav open" id="mobileNav">
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          <Link href="/auth" onClick={() => setOpen(false)}>
            Get the app
          </Link>
        </div>
      )}
    </header>
  );
}
