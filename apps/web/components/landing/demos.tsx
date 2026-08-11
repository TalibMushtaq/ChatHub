"use client";

import { useEffect, useRef, useState } from "react";
import { TicksIcon } from "./icons";

const RM =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const IC_SINGLE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

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

/**
 * Starts `start()` (which must return a cleanup) the first time the observed
 * stage scrolls into view. No-op under `prefers-reduced-motion`.
 */
function useDemo(start: () => () => void) {
  const [started, setStarted] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (RM) return;
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setStarted(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const startRef = useRef(start);
  startRef.current = start;

  useEffect(() => {
    if (!started || RM) return;
    return startRef.current();
  }, [started]);

  return stageRef;
}

const RT_POOL = [
  "want to catch up after work?",
  "sure — 6 at the usual spot?",
  "perfect, I’ll grab us a table",
  "I might be 10 min late, don’t worry",
  "all good — take your time",
  "on my way now 🚶",
];

export function RealtimeDemo() {
  const threadRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef<HTMLDivElement>(null);

  const stageRef = useDemo(() => {
    let cancelled = false;
    (async () => {
      const thread = threadRef.current;
      const typing = typingRef.current;
      let i = 0;
      while (!cancelled) {
        if (typing) typing.hidden = false;
        await sleep(900);
        if (cancelled) return;
        if (typing) typing.hidden = true;
        if (thread) {
          const side = i % 3 === 1 ? "out" : "in";
          bubble(
            thread,
            side,
            RT_POOL[i % RT_POOL.length]!,
            `6:${String(7 + i).padStart(2, "0")} PM`,
          );
        }
        i++;
        if (thread) {
          const dyn = [...thread.querySelectorAll(".msg.dyn")];
          while (dyn.length > 6) dyn.shift()!.remove();
        }
        await sleep(1300);
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  return (
    <div className="stage" ref={stageRef} data-od-id="demo-realtime">
      <div className="stage-card">
        <div className="mini-head">
          <span className="dot online" aria-hidden="true" />
          After work · you &amp; Priya
        </div>
        <div className="mini-thread" ref={threadRef}>
          <div className="msg in">
            <div className="bubble">hey! how was your day?</div>
            <div className="meta">5:58 PM</div>
          </div>
          <div className="msg out">
            <div className="bubble">long but good — free tonight?</div>
            <div className="meta">
              <span>6:01 PM</span>
              <span className="ticks" data-state="read">
                <TicksIcon />
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
  );
}

export function ReactionsDemo() {
  const pillRef = useRef<HTMLDivElement>(null);
  const heartRef = useRef<HTMLSpanElement>(null);
  const laughRef = useRef<HTMLSpanElement>(null);
  const heartCountRef = useRef<HTMLSpanElement>(null);
  const laughCountRef = useRef<HTMLSpanElement>(null);

  const stageRef = useDemo(() => {
    let cancelled = false;
    (async () => {
      while (!cancelled) {
        const pill = pillRef.current;
        if (!pill) return;
        if (heartCountRef.current) heartCountRef.current.textContent = "1";
        if (laughCountRef.current) laughCountRef.current.textContent = "1";
        pill
          .querySelectorAll(".rx-item")
          .forEach((el) => el.classList.remove("new"));
        pill.classList.remove("show");
        await sleep(800);
        if (cancelled) return;
        pill.classList.add("show");
        heartRef.current?.classList.add("new");
        await sleep(700);
        if (cancelled) return;
        if (heartCountRef.current) heartCountRef.current.textContent = "2";
        heartRef.current?.classList.remove("new");
        if (heartRef.current) void heartRef.current.offsetWidth;
        heartRef.current?.classList.add("new");
        await sleep(450);
        if (cancelled) return;
        laughRef.current?.classList.add("new");
        if (laughCountRef.current) laughCountRef.current.textContent = "1";
        await sleep(1700);
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  return (
    <div className="stage" ref={stageRef} data-od-id="demo-reactions">
      <div className="stage-card">
        <div className="rx-thread">
          <div className="msg in">
            <div className="bubble">That photo is incredible 😍</div>
            <div className="rx-pill show" ref={pillRef} aria-label="Reactions">
              <span className="rx-item rx-heart" ref={heartRef}>
                <span>❤️</span>
                <span className="rx-count" ref={heartCountRef}>
                  2
                </span>
              </span>
              <span className="rx-item rx-laugh" ref={laughRef}>
                <span>😂</span>
                <span className="rx-count" ref={laughCountRef}>
                  1
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const PR_STATES: [string, string][] = [
  ["online", "Online"],
  ["idle", "Idle"],
  ["dnd", "Do not disturb"],
  ["offline", "Offline"],
  ["online", "Online"],
  ["online", "Online"],
];

export function PresenceDemo() {
  const rowRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  const stageRef = useDemo(() => {
    let cancelled = false;
    (async () => {
      let i = 0;
      while (!cancelled) {
        const [cls, txt] = PR_STATES[i % PR_STATES.length]!;
        if (dotRef.current) dotRef.current.className = `dot ${cls}`;
        rowRef.current?.classList.toggle("speaks", cls === "online");
        if (labelRef.current) labelRef.current.textContent = txt;
        i++;
        await sleep(1800);
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  return (
    <div className="stage" ref={stageRef} data-od-id="demo-presence">
      <div className="stage-card">
        <div className="presence-row speaks" ref={rowRef}>
          <div className="avatar lg" aria-hidden="true">
            Ma
          </div>
          <div className="pr-meta">
            <strong>Marcus</strong>
            <span className="pr-line">
              <span className="dot online" ref={dotRef} aria-hidden="true" />
              <span ref={labelRef}>Online</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AttachmentsDemo() {
  const tileRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const stageRef = useDemo(() => {
    let cancelled = false;
    (async () => {
      while (!cancelled) {
        const tile = tileRef.current;
        const row = rowRef.current;
        const bar = barRef.current;
        if (!tile || !row || !bar) return;
        tile.style.display = "none";
        row.style.display = "flex";
        bar.classList.remove("done");
        bar.style.width = "0";
        await sleep(650);
        if (cancelled) return;
        bar.style.width = "100%";
        await sleep(1350);
        if (cancelled) return;
        bar.classList.add("done");
        await sleep(400);
        if (cancelled) return;
        tile.style.display = "flex";
        await sleep(1600);
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  return (
    <div className="stage" ref={stageRef} data-od-id="demo-attachments">
      <div className="stage-card">
        <div className="mini-thread">
          <div className="msg in">
            <div className="bubble">
              Here&apos;s the shot from the rooftop 🌇
            </div>
            <div className="meta">6:14 PM</div>
          </div>
          <div
            className="msg in"
            ref={tileRef}
            aria-label="Uploaded image roof-sunset.jpg"
          >
            <div className="bubble img">
              <div className="ph-img">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="30"
                  height="30"
                  aria-hidden="true"
                >
                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                </svg>
              </div>
              <div className="cap">roof-sunset.jpg · 1.2 MB</div>
            </div>
          </div>
          <div className="attach-row" ref={rowRef} style={{ display: "none" }}>
            <div className="a-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="19"
                height="19"
                aria-hidden="true"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
            </div>
            <div className="a-meta">
              <div className="a-name">roof-sunset.jpg</div>
              <div className="progress">
                <div className="bar" ref={barRef} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const RC_STATES: [string, string, string][] = [
  ["sent", "Sent", "4:02 PM"],
  ["delivered", "Delivered", "4:02 PM"],
  ["read", "Read", "Seen 4:03 PM"],
];

export function ReceiptsDemo() {
  const stackRef = useRef<HTMLDivElement>(null);

  const stageRef = useDemo(() => {
    let cancelled = false;
    (async () => {
      const stack = stackRef.current;
      if (!stack) return;
      const rows = [...stack.querySelectorAll<HTMLElement>(".rc-row")];
      let i = 0;
      while (!cancelled) {
        rows.forEach((r) =>
          r.classList.toggle(
            "active",
            r.dataset.stage === RC_STATES[i % 3]![0],
          ),
        );
        i++;
        await sleep(1700);
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  const icon = (i: number) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="18"
      height="18"
      aria-hidden="true"
    >
      {i === 0 ? (
        <path d="M20 6 9 17l-5-5" />
      ) : (
        <>
          <path d="M18 6 7 17l-5-5" />
          <path d="m22 10-7.5 7.5L13 16" />
        </>
      )}
    </svg>
  );

  return (
    <div className="stage" ref={stageRef} data-od-id="demo-receipts">
      <div className="stage-card">
        <div className="rc-stack" ref={stackRef}>
          {RC_STATES.map(([stage, txt, time]) => (
            <div className="rc-row" key={stage} data-stage={stage}>
              <div className="rc-ic">{icon(stage === "sent" ? 0 : 1)}</div>
              <div className="rc-txt">{txt}</div>
              <div className="rc-time">{time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
