"use client";

/**
 * AvatarSelector
 *
 * Displays a responsive grid of default avatars loaded from the backend.
 * Supports user and room avatar sets.
 *
 * Props:
 *   source   - "user" | "room"
 *   selected - currently selected key (e.g. "defaults/user/01.png")
 *   onSelect - called with the key when user clicks an avatar
 *   className - optional extra class
 *
 * The component fetches the avatar list once on mount. Each avatar is
 * displayed as an image with a presigned S3 GET URL. Selecting one calls
 * onSelect(key). The selected avatar has a visible ring + checkmark.
 */

import { useEffect, useRef, useState } from "react";
import { api } from "../../app/lib/api";

export interface DefaultAvatar {
  key: string;
  url: string;
}

interface AvatarSelectorProps {
  source: "user" | "room";
  selected: string | null;
  onSelect: (key: string) => void;
  className?: string;
}

function CheckRing() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="absolute bottom-[-4px] right-[-4px] h-5 w-5 drop-shadow-sm"
    >
      <circle cx="10" cy="10" r="9" fill="var(--color-accent-btn)" />
      <path
        d="M6 10.5l2.5 2.5 5.5-5.5"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="avatar-selector-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="avatar-selector-cell skeleton"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export default function AvatarSelector({
  source,
  selected,
  onSelect,
  className = "",
}: AvatarSelectorProps) {
  const [avatars, setAvatars] = useState<DefaultAvatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track which images failed to load so we can show a fallback
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    api
      .get<{ ok: boolean; avatars: DefaultAvatar[] }>(
        `/defaults/avatars?source=${source}`,
      )
      .then((res) => {
        setAvatars(res.data.avatars ?? []);
      })
      .catch(() => {
        setError("Couldn't load avatars. Please try again.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [source]);

  if (loading) return <SkeletonGrid />;

  if (error) {
    return <p className="text-[13px] text-danger">{error}</p>;
  }

  if (avatars.length === 0) {
    return <p className="text-[13px] text-muted">No default avatars found.</p>;
  }

  return (
    <div
      className={`avatar-selector-grid ${className}`}
      role="radiogroup"
      aria-label="Select an avatar"
    >
      {avatars.map((av) => {
        const isSelected = selected === av.key;
        const hasFailed = failed.has(av.key);
        return (
          <button
            key={av.key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={av.key.split("/").pop()?.replace(".png", "") ?? av.key}
            onClick={() => onSelect(av.key)}
            className={`avatar-selector-cell${isSelected ? " selected" : ""}`}
            tabIndex={0}
          >
            {hasFailed ? (
              <div className="avatar-selector-fallback">?</div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={av.url}
                alt=""
                draggable={false}
                className="avatar-selector-img"
                onError={() => setFailed((prev) => new Set([...prev, av.key]))}
              />
            )}
            {isSelected && <CheckRing />}
          </button>
        );
      })}
    </div>
  );
}
