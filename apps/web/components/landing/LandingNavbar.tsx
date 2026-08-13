"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../app/lib/api";
import { MenuIcon, MoonIcon, SunIcon } from "./icons";

type AuthState = "loading" | "in" | "out";

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
  // Best-effort session probe: lets the navbar surface Open app vs.
  // Log in / Sign up instead of silently dropping signed-in visitors
  // straight into /dashboard when they click a landing CTA.
  const [auth, setAuth] = useState<AuthState>("loading");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await api.get("/auth/me");
        if (active) setAuth("in");
      } catch {
        // 401 or unreachable API — treat as signed out; links still work.
        if (active) setAuth("out");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const navLinks = [
    { href: "#positioning", label: "Why ChatHubby" },
    { href: "#features", label: "Features" },
    { href: "#personality", label: "Personality" },
  ];

  return (
    <header className="topbar" data-od-id="topbar">
      <div className="container topbar-inner">
        <Link className="logo" href="#top" aria-label="ChatHubby home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/chathubby.webp"
            alt=""
            className="mascot"
            style={{ borderRadius: "50%", objectFit: "cover" }}
          />
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
          {auth === "in" ? (
            <Link className="btn btn-primary" href="/dashboard">
              Open app
            </Link>
          ) : (
            <>
              <Link className="btn btn-ghost" href="/auth?mode=login">
                Log in
              </Link>
              <Link className="btn btn-primary" href="/auth?mode=signup">
                Sign up
              </Link>
              <Link className="btn btn-ghost" href="/auth">
                Get the app
              </Link>
            </>
          )}
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
          {auth === "in" ? (
            <Link href="/dashboard" onClick={() => setOpen(false)}>
              Open app
            </Link>
          ) : (
            <>
              <Link href="/auth?mode=login" onClick={() => setOpen(false)}>
                Log in
              </Link>
              <Link href="/auth?mode=signup" onClick={() => setOpen(false)}>
                Sign up
              </Link>
              <Link href="/auth" onClick={() => setOpen(false)}>
                Get the app
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
