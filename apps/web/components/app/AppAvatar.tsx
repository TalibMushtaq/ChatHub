"use client";

// Hue-based avatar: a stable color is derived from the name so the same user
// always renders the same color without any server round-trip. Optionally
// overlays a presence dot whose color comes from the shared status-tone map
// (green online, amber away/idle, red busy/DND, gray offline/invisible).
import { avatarUrl, hueOf, initials } from "./helpers";
import { presenceTone, TONE_BG } from "./statusTones";
import type { PresenceInfo } from "./types";

interface AppAvatarProps {
  name?: string | null;
  src?: string | null;
  size?: number;
  square?: boolean;
  presence?: PresenceInfo | null;
  className?: string;
}

export default function AppAvatar({
  name,
  src,
  size = 36,
  square,
  presence,
  className = "",
}: AppAvatarProps) {
  const display = name || "?";
  const image = avatarUrl(src);
  const avatar = image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image}
      alt={display}
      className={`avatar ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: square ? "10px" : "50%",
      }}
    />
  ) : (
    <div
      className={`avatar ${className}`}
      style={
        {
          width: size,
          height: size,
          fontSize: Math.max(10, Math.round(size * 0.36)),
          borderRadius: square ? "10px" : "50%",
          "--h": hueOf(display),
        } as React.CSSProperties
      }
    >
      {initials(display)}
    </div>
  );

  // No presence data yet (e.g. search results, message rows) -> plain avatar.
  if (!presence) return avatar;

  const tone = presenceTone(presence);
  const dotSize = Math.max(10, Math.round(size * 0.32));
  return (
    <span className="relative inline-flex flex-none">
      {avatar}
      {/* Ring matches the surface color so the dot reads as sitting on the
          avatar's edge regardless of the background behind it. */}
      <span
        aria-hidden
        className={`absolute bottom-0 right-0 rounded-full border-2 border-surface ${TONE_BG[tone]}`}
        style={{ width: dotSize, height: dotSize }}
      />
    </span>
  );
}
