"use client";

// Hue-based avatar: a stable color is derived from the name so the same user
// always renders the same color without any server round-trip.
import { hueOf, initials } from "./helpers";

interface AppAvatarProps {
  name?: string | null;
  src?: string | null;
  size?: number;
  square?: boolean;
}

export default function AppAvatar({ name, src, size = 36, square }: AppAvatarProps) {
  const display = name || "?";
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={display}
        className="avatar"
        style={{ width: size, height: size, borderRadius: square ? "10px" : "50%" }}
      />
    );
  }
  return (
    <div
      className="avatar"
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
}
