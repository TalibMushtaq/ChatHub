// app/auth/page.tsx

import { Suspense } from "react";
import { redirect } from "next/navigation";
import axios from "axios";
import { serverApi } from "../lib/serverApi";
import AuthCard from "./AuthCard";
import ThemeToggle from "./ThemeToggle";
import Link from "next/link";
import { MascotDefs } from "../../components/landing/Mascot";

export const dynamic = "force-dynamic";

export default async function AuthPage() {
  let ok = false;
  try {
    const api = await serverApi();
    const { data } = await api.get("/auth/me");
    ok = data.ok === true;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      // Not logged in — expected on the auth page, no action needed.
    } else {
      console.error("Auth check failed", err);
    }
  }

  if (ok) {
    redirect("/dashboard");
  }
  return (
    <div className="flex min-h-svh flex-col bg-bg font-body text-fg antialiased">
      <MascotDefs />
      <header className="topbar flex items-center justify-between px-7 py-[18px]">
        <Link
          className="no-underline inline-flex items-center gap-2.5 text-fg"
          href="/"
          aria-label="ChatHubby home"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/chathubby.webp"
            alt="ChatHubby"
            className="h-10 w-10 rounded-[12px]"
          />
          <span className="logo-text font-display text-2xl font-bold tracking-[-0.01em]">
            <span>Chat</span>
            <span className="accent text-accent-solid">Hubby</span>
          </span>
        </Link>
        <ThemeToggle />
      </header>
      <main className="wrap flex flex-1 items-center justify-center px-4 pt-6 pb-16">
        <div
          className="card w-full max-w-[430px] rounded-3xl border border-border bg-surface p-9 shadow-lg max-[480px]:px-5 max-[480px]:py-7"
          data-od-id="auth-card"
        >
          <Suspense fallback={null}>
            <AuthCard />
          </Suspense>
        </div>
      </main>
      <footer className="foot pb-7 text-center text-[13px] text-muted">
        <Link
          className="font-bold text-muted no-underline hover:text-accent-solid"
          href="/"
        >
          landing
        </Link>{" "}
        ·{" "}
        <Link
          className="font-bold text-muted no-underline hover:text-accent-solid"
          href="/dashboard"
        >
          open the app
        </Link>{" "}
        · © 2026 ChatHubby
      </footer>
    </div>
  );
}
