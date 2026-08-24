"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../lib/api";
import { postCsrf } from "../lib/csrf";
import { getErrorMessage } from "../lib/errors";
import { ChatAPI } from "../../components/app/api";
import { userZod } from "@repo/validators";
import { Mascot } from "../../components/landing/Mascot";
import { CheckIcon, CopyIcon } from "../../components/app/icons";
import AvatarSelector from "../../components/app/AvatarSelector";

type Screen =
  | "login"
  | "signupDetails"
  | "signupUsername"
  | "avatarPick"
  | "recovery"
  | "forgot"
  | "join";

interface JoinPreview {
  name: string;
  description: string | null;
  maxUses: number | null;
  expiresAt: string | null;
  roomId: string;
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-[18px] w-[18px]"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// Inline Tailwind stand-ins for the old auth.css utilities so the card can
// render without the scoped stylesheet.
const input =
  "w-full rounded-xl border-[1.5px] border-border bg-bg px-3.5 py-3 text-[15px] transition-[border-color,box-shadow] duration-150 ease-app focus:border-accent-solid focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-accent)_45%,transparent)] focus:outline-none";
const label = "mb-[7px] block text-[13.5px] font-bold tracking-[0.02em]";
const btn =
  "inline-flex w-full min-h-[50px] cursor-pointer items-center justify-center gap-[9px] rounded-full px-5 py-3 text-[15.5px] font-extrabold tracking-[0.02em] transition-[background-color,transform,border-color] duration-150 ease-app";
const btnPrimary = `${btn} bg-accent-btn text-accent-on hover:bg-accent-hover disabled:opacity-55 disabled:cursor-default`;
const btnGhost = `${btn} mt-2.5 border-[1.5px] border-border-strong bg-transparent text-fg hover:border-accent-solid hover:text-accent-solid`;
const linkrow =
  "mt-[18px] flex flex-wrap items-center justify-center gap-x-[18px] gap-y-1.5 text-sm font-semibold";
const linkrowBtn =
  "inline-flex min-h-10 cursor-pointer items-center text-muted hover:text-accent-solid";

function PwField({
  id,
  name,
  autoComplete,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  name: string;
  autoComplete: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className={`${input} pr-[46px]`}
      />
      <button
        type="button"
        className="toggle absolute top-1/2 right-1.5 flex h-[38px] w-[38px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-[10px] text-muted transition-colors duration-150 ease-app hover:text-fg"
        aria-label={show ? "Hide password" : "Show password"}
        onClick={() => setShow(!show)}
      >
        <EyeIcon />
      </button>
    </div>
  );
}

function Err({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div
      className="mb-4 rounded-[10px] border border-[color-mix(in_oklab,var(--color-danger)_30%,transparent)] bg-danger-soft px-[13px] py-2.5 text-[13.5px] font-semibold text-danger"
      role="alert"
    >
      {msg}
    </div>
  );
}

export default function AuthCard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const mode = searchParams.get("mode");
  const joinParam = searchParams.get("join");

  const [screen, setScreen] = useState<Screen>("login");

  const [loginId, setLoginId] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  const [suEmail, setSuEmail] = useState("");
  const [suPw, setSuPw] = useState("");
  const [suUser, setSuUser] = useState("");
  const [suErr, setSuErr] = useState("");
  const [suBusy, setSuBusy] = useState(false);
  const [suAvatarKey, setSuAvatarKey] = useState<string | null>(null);
  type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const usernameCheckRef = useRef(0);

  const [codes, setCodes] = useState<string[]>([]);
  const [recTitle, setRecTitle] = useState("");
  const [recSub, setRecSub] = useState<ReactNode>("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1500);
    } catch {
      // Clipboard may be blocked (e.g. insecure context); select-all stays
      // available so a manual Ctrl+C still works.
    }
  }

  const [fpUser, setFpUser] = useState("");
  const [fpCode, setFpCode] = useState("");
  const [fpPw, setFpPw] = useState("");
  const [fpErr, setFpErr] = useState("");
  const [fpBusy, setFpBusy] = useState(false);

  const [joinToken, setJoinToken] = useState("");
  const [joinErr, setJoinErr] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinPreview, setJoinPreview] = useState<JoinPreview | null>(null);

  useEffect(() => {
    if (mode === "signup") setScreen("signupDetails");
    else if (mode === "login") setScreen("login");
  }, [mode]);

  // `?join=TOKEN` support: prefill the token and auto-run the preview like
  // the standalone auth mock does.
  useEffect(() => {
    if (joinParam) {
      setJoinToken(joinParam);
      setScreen("join");
      void doJoinPreview(joinParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinParam]);

  async function doLogin(id = loginId, pw = loginPw) {
    const identifier = id.trim();
    if (!identifier) {
      setLoginErr("Enter your email or username.");
      return;
    }
    if (!pw) {
      setLoginErr("Enter your password.");
      return;
    }
    const isEmail = identifier.includes("@");
    const payload = isEmail
      ? { email: identifier, password: pw }
      : { username: identifier, password: pw };
    const parsed = userZod.login.safeParse(payload);
    if (!parsed.success) {
      setLoginErr(parsed.error.issues[0]?.message ?? "Invalid credentials");
      return;
    }
    setLoginErr("");
    setLoginBusy(true);
    try {
      await postCsrf("/auth/login", parsed.data);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setLoginErr(getErrorMessage(err, "Login failed"));
    } finally {
      setLoginBusy(false);
    }
  }

  function goToUsername() {
    const emailOk = userZod.email.safeParse(suEmail.trim()).success;
    const pwOk = userZod.password.safeParse(suPw).success;
    if (!emailOk) {
      setSuErr("Enter a valid email address.");
      return;
    }
    if (!pwOk) {
      setSuErr("Password must be 8–72 characters.");
      return;
    }
    setSuErr("");
    setScreen("signupUsername");
  }

  async function doSignup() {
    const payload = {
      email: suEmail.trim(),
      username: suUser.trim(),
      password: suPw,
    };
    const parsed = userZod.signup.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path?.join(".") ?? "form";
      setSuErr(`${field}: ${issue?.message ?? "Invalid input"}`);
      return;
    }
    if (usernameStatus !== "available") {
      setSuErr("Choose an available username before continuing.");
      return;
    }
    setSuErr("");
    setSuBusy(true);
    try {
      const data = await postCsrf<{
        ok: boolean;
        recoveryToken: string;
      }>("/auth/signup", parsed.data);
      // Codes are fetched via a one-time token so they never appear in the
      // signup response body; the token is single-use and 10-minute TTL.
      const recoveryCodes = await ChatAPI.showRecoveryCodes(data.recoveryToken);
      // Store codes for display on the recovery screen after avatar pick
      setCodes(recoveryCodes ?? []);
      setRecTitle("Save your recovery codes");
      setRecSub(
        <>
          These are the only way to reset your password. They will <b>never</b>{" "}
          be shown again.
        </>,
      );
      // Go to avatar picker first, then recovery
      setScreen("avatarPick");
    } catch (err) {
      setSuErr(getErrorMessage(err, "Signup failed"));
    } finally {
      setSuBusy(false);
    }
  }

  // Live, debounced username availability check. We ignore stale responses so
  // an older network result cannot overwrite the latest keystroke.
  useEffect(() => {
    const trimmed = suUser.trim();
    const parsed = userZod.username.safeParse(trimmed);
    if (!parsed.success) {
      setUsernameStatus(trimmed.length === 0 ? "idle" : "invalid");
      return;
    }

    setUsernameStatus("checking");
    const token = ++usernameCheckRef.current;

    const timer = setTimeout(async () => {
      try {
        const available = await ChatAPI.checkUsername(trimmed);
        if (token !== usernameCheckRef.current) return;
        setUsernameStatus(available ? "available" : "taken");
      } catch {
        if (token !== usernameCheckRef.current) return;
        setUsernameStatus("taken");
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [suUser]);

  async function doSaveAvatar() {
    // Best-effort: save avatar key if selected, then proceed to recovery screen
    if (suAvatarKey) {
      try {
        await ChatAPI.updateMyAvatar(suAvatarKey);
      } catch {
        // Non-fatal: user can change avatar later in settings
      }
    }
    setScreen("recovery");
  }

  async function doForgot() {
    const payload = {
      username: fpUser.trim(),
      recoveryCode: fpCode.trim(),
      newPassword: fpPw,
    };
    if (!payload.username || !payload.recoveryCode) {
      setFpErr("Username and recovery code are required.");
      return;
    }
    if (payload.newPassword.length < 8) {
      setFpErr("New password must be at least 8 characters.");
      return;
    }
    setFpErr("");
    setFpBusy(true);
    try {
      const data = await postCsrf<{ ok: boolean; recoveryToken: string }>(
        "/auth/forgot-password",
        payload,
      );
      const recoveryCodes = await ChatAPI.showRecoveryCodes(data.recoveryToken);
      setCodes(recoveryCodes ?? []);
      setRecTitle("New recovery codes");
      setRecSub(
        <>
          Your password was reset. Here are your new recovery codes — save them
          and <b>never</b> share them.
        </>,
      );
      setScreen("recovery");
    } catch (err) {
      setFpErr(getErrorMessage(err, "Reset failed"));
    } finally {
      setFpBusy(false);
    }
  }

  async function doJoinPreview(token = joinToken) {
    const t = token.trim();
    setJoinErr("");
    if (!t) {
      setJoinErr("Paste a join link token.");
      return;
    }
    setJoinBusy(true);
    try {
      const { data } = await api.get(`/room/join/${encodeURIComponent(t)}`);
      setJoinPreview({
        name: data.room?.name ?? "",
        description: data.room?.description ?? null,
        maxUses: data.maxUses ?? null,
        expiresAt: data.expiresAt ?? null,
        roomId: data.room?.id ?? "",
      });
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      setJoinPreview(null);
      if (status === 401) {
        setJoinErr("You need to log in first to join a room.");
      } else {
        setJoinErr(getErrorMessage(err, "Couldn't preview that room"));
      }
    } finally {
      setJoinBusy(false);
    }
  }

  async function doJoin() {
    if (!joinPreview) return;
    setJoinBusy(true);
    try {
      await postCsrf(`/room/join/${encodeURIComponent(joinToken.trim())}`, {});
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setJoinBusy(false);
      setJoinErr(getErrorMessage(err, "Couldn't join that room"));
    }
  }

  const meta = [
    ...(joinPreview && joinPreview.maxUses != null
      ? [`Up to ${joinPreview.maxUses} uses`]
      : []),
    ...(joinPreview && joinPreview.expiresAt
      ? [`Expires ${new Date(joinPreview.expiresAt).toLocaleDateString()}`]
      : []),
  ];
  const metaText = meta.length ? meta : ["No expiry"];

  return (
    <>
      {/* Login */}
      <div
        className={`${screen === "login" ? "animate-[auth-fade_.28s_cubic-bezier(.2,.8,.2,1)]" : "hidden"}`}
        data-od-id="screen-login"
      >
        <div className="mb-[26px] flex flex-col items-center text-center">
          <Mascot expr="smile" className="mb-3 h-[72px] w-[72px]" />
          <h1 className="font-display text-[26px] leading-[1.15] tracking-tight">
            Welcome back
          </h1>
          <p className="text-[14.5px] text-muted">
            Log in to get back to your chats.
          </p>
        </div>
        <Err msg={loginErr} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void doLogin();
          }}
          noValidate
        >
          <div className="mb-4">
            <label htmlFor="loginId" className={label}>
              Email or username
            </label>
            <input
              id="loginId"
              name="identifier"
              type="text"
              autoComplete="username"
              placeholder="you@example.com"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
              className={input}
            />
          </div>
          <div className="mb-4">
            <label htmlFor="loginPw" className={label}>
              Password
            </label>
            <PwField
              id="loginPw"
              name="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={loginPw}
              onChange={setLoginPw}
            />
          </div>
          <button className={btnPrimary} type="submit" disabled={loginBusy}>
            {loginBusy ? "Please wait…" : "Log in"}
          </button>
        </form>
        <div className={linkrow}>
          <button
            type="button"
            className={linkrowBtn}
            onClick={() => setScreen("signupDetails")}
          >
            Create an account
          </button>
          <button
            type="button"
            className={linkrowBtn}
            onClick={() => setScreen("forgot")}
          >
            Forgot password?
          </button>
        </div>
        <div className="my-[18px] flex items-center gap-3 text-[12.5px] font-bold uppercase tracking-[0.06em] text-muted">
          <span className="h-px flex-1 bg-border" />
          New here?
          <span className="h-px flex-1 bg-border" />
        </div>
        <button
          className={btnGhost}
          type="button"
          onClick={() => setScreen("join")}
        >
          I have a room join link
        </button>
      </div>

      {/* Signup: account details */}
      <div
        className={`${screen === "signupDetails" ? "animate-[auth-fade_.28s_cubic-bezier(.2,.8,.2,1)]" : "hidden"}`}
        data-od-id="screen-signup-details"
      >
        <div className="mb-[26px] flex flex-col items-center text-center">
          <Mascot expr="typing" className="mb-3 h-[72px] w-[72px]" />
          <h1 className="font-display text-[26px] leading-[1.15] tracking-tight">
            Create your account
          </h1>
          <p className="text-[14.5px] text-muted">
            A private place for real conversations.
          </p>
        </div>
        <Err msg={suErr} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            goToUsername();
          }}
          noValidate
        >
          <div className="mb-4">
            <label htmlFor="suEmail" className={label}>
              Email
            </label>
            <input
              id="suEmail"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={suEmail}
              onChange={(e) => setSuEmail(e.target.value)}
              required
              className={input}
            />
          </div>
          <div className="mb-4">
            <label htmlFor="suPw" className={label}>
              Password
            </label>
            <PwField
              id="suPw"
              name="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={suPw}
              onChange={setSuPw}
            />
          </div>
          <button className={btnPrimary} type="submit">
            Continue
          </button>
        </form>
        <div className={linkrow}>
          <button
            type="button"
            className={linkrowBtn}
            onClick={() => setScreen("login")}
          >
            Already have an account? Log in
          </button>
        </div>
      </div>

      {/* Signup: choose username */}
      <div
        className={`${screen === "signupUsername" ? "animate-[auth-fade_.28s_cubic-bezier(.2,.8,.2,1)]" : "hidden"}`}
        data-od-id="screen-signup-username"
      >
        <div className="mb-[26px] flex flex-col items-center text-center">
          <Mascot expr="typing" className="mb-3 h-[72px] w-[72px]" />
          <h1 className="font-display text-[26px] leading-[1.15] tracking-tight">
            Choose your username
          </h1>
          <p className="text-[14.5px] text-muted">
            This is how people will find you. You can&apos;t change it later.
          </p>
        </div>
        <Err msg={suErr} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void doSignup();
          }}
          noValidate
        >
          <div className="mb-4">
            <label htmlFor="suUser" className={label}>
              Username
            </label>
            <input
              id="suUser"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="johndoe"
              value={suUser}
              onChange={(e) => setSuUser(e.target.value)}
              required
              className={input}
            />
            <p className="mt-[5px] text-[12.5px] text-muted">
              3–20 characters — letters, numbers, underscore.
            </p>
            {usernameStatus === "checking" && (
              <p
                role="status"
                aria-live="polite"
                className="mt-[5px] text-[12.5px] text-muted"
              >
                Checking availability…
              </p>
            )}
            {usernameStatus === "available" && (
              <p
                role="status"
                aria-live="polite"
                className="mt-[5px] text-[12.5px] font-semibold text-success"
              >
                Username available
              </p>
            )}
            {usernameStatus === "taken" && (
              <p
                role="status"
                aria-live="polite"
                className="mt-[5px] text-[12.5px] font-semibold text-danger"
              >
                Username already taken
              </p>
            )}
            {usernameStatus === "invalid" && (
              <p
                role="status"
                aria-live="polite"
                className="mt-[5px] text-[12.5px] font-semibold text-danger"
              >
                Invalid username
              </p>
            )}
          </div>
          <button
            className={btnPrimary}
            type="submit"
            disabled={suBusy || usernameStatus !== "available"}
          >
            {suBusy ? "Please wait…" : "Create account"}
          </button>
        </form>
        <div className={linkrow}>
          <button
            type="button"
            className={linkrowBtn}
            onClick={() => setScreen("signupDetails")}
          >
            Back
          </button>
        </div>
      </div>

      {/* Avatar picker */}
      <div
        className={`${
          screen === "avatarPick"
            ? "animate-[auth-fade_.28s_cubic-bezier(.2,.8,.2,1)]"
            : "hidden"
        }`}
        data-od-id="screen-avatarpick"
      >
        <div className="mb-[22px] flex flex-col items-center text-center">
          <div
            className="mb-3 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-accent-soft text-[32px]"
            aria-hidden="true"
          >
            🖼️
          </div>
          <h1 className="font-display text-[26px] leading-[1.15] tracking-tight">
            Pick your avatar
          </h1>
          <p className="text-[14.5px] text-muted">
            Choose a default avatar — you can always change it later.
          </p>
        </div>
        {screen === "avatarPick" && (
          <AvatarSelector
            source="user"
            selected={suAvatarKey}
            onSelect={setSuAvatarKey}
          />
        )}
        <div className="mt-5 grid gap-2.5">
          <button
            className={btnPrimary}
            type="button"
            onClick={() => void doSaveAvatar()}
          >
            {suAvatarKey ? "Save avatar & continue" : "Skip for now"}
          </button>
        </div>
      </div>

      {/* Recovery codes */}
      <div
        className={`${screen === "recovery" ? "animate-[auth-fade_.28s_cubic-bezier(.2,.8,.2,1)]" : "hidden"}`}
        data-od-id="screen-recovery"
      >
        <div className="mb-[26px] flex flex-col items-center text-center">
          <Mascot expr="celebrate" className="mb-3 h-[72px] w-[72px]" />
          <h1 className="font-display text-[26px] leading-[1.15] tracking-tight">
            {recTitle}
          </h1>
          <p className="text-[14.5px] text-muted">{recSub}</p>
        </div>
        {codes.length > 0 && (
          <div
            className="my-[18px] flex flex-col gap-2"
            aria-label="Recovery codes"
          >
            {codes.map((c) => (
              <div
                className="flex items-center gap-2.5 rounded-[9px] bg-accent-soft pl-2.5 pr-1.5 py-[5px] font-mono text-xs font-bold tracking-[0.01em] text-accent-solid"
                key={c}
              >
                <span className="min-w-0 flex-1 whitespace-nowrap select-all">
                  {c}
                </span>
                <button
                  type="button"
                  aria-label={copiedCode === c ? "Copied" : "Copy code"}
                  title={copiedCode === c ? "Copied" : "Copy code"}
                  onClick={() => void copyCode(c)}
                  className="flex-none rounded-lg p-1.5 text-muted transition-colors duration-150 hover:bg-accent-wash hover:text-accent-solid"
                >
                  {copiedCode === c ? (
                    <CheckIcon className="h-4 w-4 text-accent-solid" />
                  ) : (
                    <CopyIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="my-[18px] flex gap-2.5 rounded-[10px] border border-[color-mix(in_oklab,oklch(0.76_0.13_75)_35%,transparent)] bg-warn-soft px-[13px] py-[11px] text-[13.5px] font-semibold text-fg">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="mt-px h-[18px] w-[18px] flex-none text-[oklch(0.7_0.12_75)]"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          Store them somewhere safe — a password manager or paper. You&apos;ll
          need one if you ever lose access.
        </div>
        <button
          className={btnPrimary}
          type="button"
          onClick={() => router.push("/dashboard")}
        >
          I&apos;ve saved my codes
        </button>
      </div>

      {/* Forgot password */}
      <div
        className={`${screen === "forgot" ? "animate-[auth-fade_.28s_cubic-bezier(.2,.8,.2,1)]" : "hidden"}`}
        data-od-id="screen-forgot"
      >
        <div className="mb-[26px] flex flex-col items-center text-center">
          <Mascot expr="typing" className="mb-3 h-[72px] w-[72px]" />
          <h1 className="font-display text-[26px] leading-[1.15] tracking-tight">
            Reset your password
          </h1>
          <p className="text-[14.5px] text-muted">
            Enter one of your recovery codes to set a new password.
          </p>
        </div>
        <Err msg={fpErr} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void doForgot();
          }}
          noValidate
        >
          <div className="mb-4">
            <label htmlFor="fpUser" className={label}>
              Username
            </label>
            <input
              id="fpUser"
              name="username"
              type="text"
              autoComplete="username"
              value={fpUser}
              onChange={(e) => setFpUser(e.target.value)}
              required
              className={input}
            />
          </div>
          <div className="mb-4">
            <label htmlFor="fpCode" className={label}>
              Recovery code
            </label>
            <input
              id="fpCode"
              name="recoveryCode"
              type="text"
              autoComplete="off"
              placeholder="RC_XXXXXX.XXXX-XXXX-XXXX"
              value={fpCode}
              onChange={(e) => setFpCode(e.target.value)}
              required
              className={input}
            />
          </div>
          <div className="mb-4">
            <label htmlFor="fpPw" className={label}>
              New password
            </label>
            <PwField
              id="fpPw"
              name="newPassword"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={fpPw}
              onChange={setFpPw}
            />
          </div>
          <button className={btnPrimary} type="submit" disabled={fpBusy}>
            {fpBusy ? "Please wait…" : "Reset password"}
          </button>
        </form>
        <div className={linkrow}>
          <button
            type="button"
            className={linkrowBtn}
            onClick={() => setScreen("login")}
          >
            Back to log in
          </button>
        </div>
      </div>

      {/* Join a room */}
      <div
        className={`${screen === "join" ? "animate-[auth-fade_.28s_cubic-bezier(.2,.8,.2,1)]" : "hidden"}`}
        data-od-id="screen-join"
      >
        <div className="mb-[26px] flex flex-col items-center text-center">
          <Mascot expr="smile" className="mb-3 h-[72px] w-[72px]" />
          <h1 className="font-display text-[26px] leading-[1.15] tracking-tight">
            Join a room
          </h1>
          <p className="text-[14.5px] text-muted">
            Paste a join link token to preview and join.
          </p>
        </div>
        <Err msg={joinErr} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void doJoinPreview();
          }}
          noValidate
        >
          <div className="mb-4">
            <label htmlFor="joinToken" className={label}>
              Join link token
            </label>
            <input
              id="joinToken"
              name="token"
              type="text"
              autoComplete="off"
              placeholder="e.g. BK-G7T2-9PL4"
              value={joinToken}
              onChange={(e) => setJoinToken(e.target.value)}
              required
              className={input}
            />
          </div>
          <button className={btnPrimary} type="submit" disabled={joinBusy}>
            {joinBusy ? "Please wait…" : "Preview room"}
          </button>
        </form>
        {joinPreview && (
          <div className="mt-[22px] rounded-[14px] border border-border bg-surface-2 p-[18px]">
            <div className="mb-1 font-display text-[19px] font-bold leading-[1.15] tracking-tight">
              {joinPreview.name}
            </div>
            <div className="mb-3 text-sm text-muted">
              {joinPreview.description || "No description yet."}
            </div>
            <div className="flex flex-wrap gap-2 text-[12.5px] font-bold text-muted">
              {metaText.map((m) => (
                <span
                  className="rounded-full border border-border bg-surface px-2.5 py-1"
                  key={m}
                >
                  {m}
                </span>
              ))}
            </div>
            <button
              className={btnPrimary}
              type="button"
              style={{ marginTop: 14 }}
              disabled={joinBusy}
              onClick={() => void doJoin()}
            >
              {joinBusy ? "Please wait…" : "Join this room"}
            </button>
          </div>
        )}
        <div className={linkrow}>
          <button
            type="button"
            className={linkrowBtn}
            onClick={() => setScreen("login")}
          >
            Back to log in
          </button>
        </div>
      </div>
    </>
  );
}
