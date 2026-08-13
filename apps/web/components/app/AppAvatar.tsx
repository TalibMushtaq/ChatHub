"use client";

// Hue-based avatar: a stable color is derived from the name so the same user
// always renders the same color without any server round-trip.
import { avatarUrl, hueOf, initials } from "./helpers";

interface AppAvatarProps {
  name?: string | null;
  src?: string | null;
  size?: number;
  square?: boolean;
  className?: string;
}

export default function AppAvatar({
  name,
  src,
  size = 36,
  square,
  className = "",
}: AppAvatarProps) {
  const display = name || "?";
  const image = avatarUrl(src);
  if (image) {
    return (
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
    );
  }
  return (
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
}
