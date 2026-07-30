// app/auth/page.tsx

import { Suspense } from "react";
import { redirect } from "next/navigation";
import axios from "axios";
import { serverApi } from "../lib/serverApi";
import AuthCard from "./AuthCard";
import Logo from "../../components/icons/Logo";
import Link from "next/link";

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
    <div className="min-h-screen bg-bg text-white flex">
      {/* LEFT PANEL */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12 bg-surface border-r border-white/10 relative overflow-hidden">
        {/* Glow */}
        <div className="absolute -top-40 -left-40 w-150 h-150 bg-purple-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-100 h-100 bg-blue-600/10 rounded-full blur-3xl" />

        {/* Logo */}
        <Link href="/">
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-13 h-13 rounded-lg flex items-center justify-center font-bold">
              <Logo />
            </div>
            <span className="text-xl font-extrabold tracking-tight">
              ChatHubby
            </span>
          </div>
        </Link>

        {/* Marketing Copy */}
        <div className="relative z-10">
          <h2 className="text-4xl font-extrabold leading-tight">
            Conversations,
            <br />
            <span className="bg-linear-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              reimagined.
            </span>
          </h2>
          <p className="mt-4 text-gray-400 max-w-sm text-sm leading-relaxed">
            Real-time rooms. Private DMs. Clean interface. Built for people who
            value focus.
          </p>
        </div>

        {/* Social Proof */}
        <div className="relative z-10 max-w-sm bg-surface-2 border border-white/10 rounded-xl p-6">
          <p className="text-sm italic leading-relaxed mb-4">
            “ChatHubby completely replaced three different tools for our dev
            team. It&apos;s faster, cleaner, and the threading is 🤌”
          </p>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-linear-to-br from-purple-500 to-blue-500 flex items-center justify-center text-xs font-bold">
              S
            </div>

            <div>
              <div className="text-sm font-semibold">Sofia Chen</div>
              <div className="text-xs text-gray-400">Early Access User</div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-full lg:w-120 flex flex-col justify-center px-8 py-16">
        <Suspense fallback={null}>
          <AuthCard />
        </Suspense>
      </div>
    </div>
  );
}
