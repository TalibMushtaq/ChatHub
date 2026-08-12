"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRightIcon, DotsIcon, StarIcon } from "./icons";
import { Mascot } from "./Mascot";

const RM =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const IC_SINGLE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const IC_DOUBLE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>';

function bubble(
  container: HTMLElement,
  side: "in" | "out",
  text: string,
  time: string,
): HTMLElement {
  const msg = document.createElement("div");
  msg.className = `msg ${side} dyn`;
  msg.innerHTML =
    side === "out"
      ? `<div class="bubble">${text}</div><div class="meta"><span>${time}</span><span class="ticks" data-state="sent">${IC_SINGLE}</span></div>`
      : `<div class="bubble">${text}</div><div class="meta">${time}</div>`;
  container.appendChild(msg);
  return msg;
}

function setTicks(el: HTMLElement, state: "delivered" | "read") {
  const t = el.querySelector(".ticks") as HTMLElement | null;
  if (!t) return;
  t.dataset.state = state;
  t.innerHTML = state === "read" ? IC_DOUBLE : IC_SINGLE;
}

export function HeroSection() {
  const threadRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef<HTMLDivElement>(null);
  const statusDotRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (RM) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      (async () => {
        const thread = threadRef.current;
        const typing = typingRef.current;
        const statusDot = statusDotRef.current;
        const status = statusRef.current;
        if (!thread || !typing || !statusDot || !status) return;
        while (!cancelled) {
          typing.hidden = false;
          await sleep(950);
          if (cancelled) return;
          typing.hidden = true;
          const m = bubble(
            thread,
            "in",
            "Wanna grab a coffee at 4? ☕",
            "9:03 AM",
          );
          await sleep(550);
          if (cancelled) return;
          const r = document.createElement("div");
          r.className = "react-badge dyn";
          r.textContent = "❤️ 1";
          m.appendChild(r);
          await sleep(1000);
          if (cancelled) return;
          typing.hidden = false;
          typing.classList.add("out");
          await sleep(800);
          if (cancelled) return;
          typing.hidden = true;
          typing.classList.remove("out");
          const out = bubble(
            thread,
            "out",
            "Absolutely — same spot.",
            "9:04 AM",
          );
          await sleep(650);
          if (cancelled) return;
          setTicks(out, "delivered");
          await sleep(700);
          if (cancelled) return;
          setTicks(out, "read");
          statusDot.className = "dot online";
          status.textContent = "Online";
          const dyn = [...thread.querySelectorAll(".msg.dyn")];
          while (dyn.length > 4) dyn.shift()!.remove();
          await sleep(2300);
          if (cancelled) return;
          m.remove();
          statusDot.className = "dot idle";
          status.textContent = "Away";
          await sleep(700);
        }
      })();
    }, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <section className="hero" id="top" data-od-id="hero">
      <div className="hero-bg" aria-hidden="true" />
      <div className="container hero-inner">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="dot" aria-hidden="true" /> A messenger with a
            personality
          </p>
          <h1>
            Private, real-time chat that <em>feels like yours</em>.
          </h1>
          <p className="lead">
            ChatHubby is a light, personal messenger for the conversations you
            actually care about — instant replies, honest presence, and none of
            the noise.
          </p>
          <div className="hero-ctas">
            <Link
              className="btn btn-primary"
              href="/auth?mode=signup"
              data-od-id="hero-cta-primary"
            >
              Start a conversation
              <ArrowRightIcon className="btn-icon" width={18} height={18} />
            </Link>
            <Link className="btn btn-ghost" href="/auth?mode=login">
              Log in
            </Link>
            <Link className="btn btn-ghost" href="#features">
              See how it works
            </Link>
          </div>
          <p className="hero-note">
            Free to start · Create your account in under a minute
          </p>
        </div>

        <div
          className="chat-wrap"
          data-od-id="hero-chat"
          aria-label="Animated example conversation"
        >
          <div className="float float-mascot" aria-hidden="true">
            <Mascot expr="typing" />
          </div>
          <div className="float float-chip" aria-hidden="true">
            <StarIcon />
            Real-time, always
          </div>
          <div className="chat-card">
            <div className="chat-head">
              <div className="avatar" aria-hidden="true">
                Mi
              </div>
              <div className="who">
                <strong>Mia</strong>
                <span className="status-line">
                  <span
                    className="dot idle"
                    ref={statusDotRef}
                    aria-hidden="true"
                  />
                  <span ref={statusRef}>Away</span>
                </span>
              </div>
              <button className="icon-btn" aria-label="Chat details">
                <DotsIcon width={19} height={19} />
              </button>
            </div>
            <div className="chat-thread" ref={threadRef}>
              <div className="msg in">
                <div className="bubble">Morning! Did the rain clear up?</div>
                <div className="meta">8:41 AM</div>
              </div>
              <div className="msg out">
                <div className="bubble">
                  Yeah — sun&apos;s back. Coffee at 4?
                </div>
                <div className="meta">
                  <span>8:42 AM</span>
                  <span className="ticks" data-state="read" aria-label="Read">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      width="15"
                      height="15"
                    >
                      <path d="M18 6 7 17l-5-5" />
                      <path d="m22 10-7.5 7.5L13 16" />
                    </svg>
                  </span>
                </div>
              </div>
            </div>
            <div className="typing" ref={typingRef} hidden aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
