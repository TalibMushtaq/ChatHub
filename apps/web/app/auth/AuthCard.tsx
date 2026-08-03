"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { isAxiosError } from "axios";
import { api } from "../lib/api";
import { userZod } from "@repo/validators";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function AuthCard() {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayname, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const router = useRouter();

  useEffect(() => {
    if (mode === "signup") setTab("signup");
    if (mode === "login") setTab("login");
  }, [mode]);

  useEffect(() => {
    if (errors) {
      toast.error(errors);
    }
  }, [errors]);

  //------------password Strength ---------
  const getStrength = (password: string) => {
    let score = 0;

    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    return score; // 0 - 4
  };
  const strength = getStrength(password);

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (isAxiosError(err)) {
      return (
        err.response?.data?.error || err.response?.data?.message || fallback
      );
    }
    return fallback;
  };

  //---------------HandelLogin--------
  const HandelLogin = async () => {
    try {
      setLoading(true);
      setErrors("");

      const parsed = userZod.login.safeParse({
        email,
        password,
      });

      if (!parsed.success) {
        const error: Record<string, string> = {};
        parsed.error.issues.forEach((issue) => {
          const field = issue.path[0] as string;
          error[field] = issue.message;
        });
        setFieldErrors(error);
        return;
      }
      await api.post("/auth/login", parsed.data);
      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      console.log(err);
      setErrors(getErrorMessage(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  //---------------HandelSignup----------------
  const handelSignup = async () => {
    try {
      setLoading(true);
      setErrors("");

      const parsed = userZod.signup.safeParse({
        username,
        displayname,
        email,
        password,
      });

      if (!parsed.success) {
        const error: Record<string, string> = {};
        parsed.error.issues.forEach((issue) => {
          const field = issue.path[0] as string;
          error[field] = issue.message;
        });
        setFieldErrors(error);
        return;
      }
      await api.post("/auth/signup", parsed.data);
      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setErrors(getErrorMessage(err, "Signup failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight">
          {tab === "login" ? "Welcome back" : "Create account"}
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          {tab === "login"
            ? "Sign in to your ChatHubby account"
            : "Join and start chatting instantly"}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex bg-surface border border-white/10 rounded-lg p-1 mb-7">
        <button
          onClick={() => setTab("login")}
          className={`flex-1 py-2 text-sm rounded-md transition ${
            tab === "login" ? "bg-surface-2 text-white shadow" : "text-gray-400"
          }`}
        >
          Log in
        </button>
        <button
          onClick={() => setTab("signup")}
          disabled={loading}
          className={`flex-1 py-2 text-sm rounded-md transition ${
            tab === "signup"
              ? "bg-surface-2 text-white shadow"
              : "text-gray-400"
          }`}
        >
          Sign up
        </button>
      </div>

      {/* OAuth */}
      <div className="space-y-3 mb-6">
        <button className="w-full flex items-center justify-center gap-3 py-3 bg-surface border border-white/10 rounded-lg text-sm hover:bg-surface-2 transition">
          <span className="text-sm">G</span>
          {tab === "login" ? "Continue with Google" : "Sign up with Google"}
        </button>

        <button className="w-full flex items-center justify-center gap-3 py-3 bg-surface border border-white/10 rounded-lg text-sm hover:bg-surface-2 transition">
          <span className="text-sm">⬛</span>
          {tab === "login" ? "Continue with GitHub" : "Sign up with GitHub"}
        </button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-xs text-gray-500">or continue with email</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      {/* Login Form */}
      {tab === "login" && (
        <>
          <div className="space-y-5">
            <div>
              <label className="block text-xs mb-2 font-medium">
                Email address
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                onChange={(e) => setEmail(e.target.value)}
              />
              {fieldErrors.email && (
                <p className="text-red-400 text-xs mt-1">{fieldErrors.email}</p>
              )}
            </div>

            <div>
              <label className="block text-xs mb-2 font-medium">Password</label>
              <input
                type="password"
                placeholder="Enter your password"
                className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                onChange={(e) => setPassword(e.target.value)}
              />
              {fieldErrors.password && (
                <p className="text-red-400 text-xs mt-1">
                  {fieldErrors.password}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 mb-6 text-xs text-gray-400">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-purple-500" />
              Remember me
            </label>
            <a href="#" className="text-purple-400 hover:opacity-80">
              Forgot password?
            </a>
          </div>

          <button
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 transition rounded-lg text-sm font-semibold shadow-lg shadow-purple-600/20"
            onClick={(e) => {
              e.preventDefault();
              HandelLogin();
            }}
            disabled={loading}
          >
            Login
          </button>

          <div className="text-center text-xs text-gray-400 mt-5">
            Don&apos;t have an account?{" "}
            <button
              onClick={() => setTab("signup")}
              className="text-purple-400 hover:opacity-80"
            >
              Sign up free
            </button>
          </div>
        </>
      )}

      {/* Signup Form */}
      {tab === "signup" && (
        <>
          {/* <div className="flex gap-3 mb-5">
            <div className="flex-1">
              <label className="block text-xs mb-2 font-medium">
                First name
              </label>
              <input
                type="text"
                placeholder="Alex"
                className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs mb-2 font-medium">
                Last name
              </label>
              <input
                type="text"
                placeholder="Morgan"
                className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
              />
            </div>
          </div> */}

          <div className="space-y-5">
            <div>
              <label className="block text-xs mb-2 font-medium">Username</label>
              <input
                type="username"
                placeholder="darTalib"
                className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                onChange={(e) => setUsername(e.target.value)}
              />
              <span className="text-xs text-gray-500">
                ChatHubby.app/@alexmorgan
              </span>
              {fieldErrors.username && (
                <p className="text-red-400 text-xs mt-1">
                  {fieldErrors.username}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs mb-2 font-medium">
                Email address
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                onChange={(e) => setEmail(e.target.value)}
              />
              {fieldErrors.email && (
                <p className="text-red-400 text-xs mt-1">{fieldErrors.email}</p>
              )}
            </div>
            <div>
              <label className="block text-xs mb-2 font-medium">
                Display Name
              </label>
              <input
                type="displayname"
                placeholder="talib"
                className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                onChange={(e) => setDisplayName(e.target.value)}
              />
              {fieldErrors.displayname && (
                <p className="text-red-400 text-xs mt-1">
                  {fieldErrors.displayname}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs mb-2 font-medium">Password</label>
              <input
                type="password"
                placeholder="Create a strong password"
                className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
                onChange={(e) => {
                  setPassword(e.target.value);
                }}
              />
              {fieldErrors.password && (
                <p className="text-red-400 text-xs mt-1">
                  {fieldErrors.password}
                </p>
              )}
              <span className="text-xs text-gray-500">
                Use 8+ chars, a number, and a symbol
              </span>
              <div className="flex gap-1 mt-3">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`flex-1 h-1 rounded transition-all ${
                      strength > i
                        ? strength <= 2
                          ? "bg-red-500"
                          : strength === 3
                            ? "bg-yellow-500"
                            : "bg-green-500"
                        : "bg-white/10"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-4 leading-relaxed">
            By creating an account you agree to our{" "}
            <a href="#" className="text-purple-400">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="#" className="text-purple-400">
              Privacy Policy
            </a>
            .
          </p>

          <button
            className="w-full mt-6 py-3 bg-purple-600 hover:bg-purple-500 transition rounded-lg text-sm font-semibold shadow-lg shadow-purple-600/20"
            onClick={handelSignup}
          >
            Create account
          </button>

          <div className="text-center text-xs text-gray-400 mt-5">
            Already have an account?{" "}
            <button
              onClick={() => setTab("login")}
              className="text-purple-400 hover:opacity-80"
            >
              Log in
            </button>
          </div>
        </>
      )}
    </>
  );
}
