"use client";

/**
 * AvatarSelector
 *
 * Displays a responsive grid of default avatars loaded from the backend.
 * Supports user and room avatar sets, and (when a scoped upload is possible)
 * an "Upload your own" flow: pick a file → crop/zoom/pan in AvatarCropper →
 * upload the processed image to S3 → onSelect(key).
 *
 * Props:
 *   source   - "user" | "room"
 *   selected - currently selected key (e.g. "defaults/user/01.png")
 *   onSelect - called with the key when user clicks an avatar or finishes an upload
 *   contextId - room id for room uploads; when source is "room" and this is
 *               missing, upload is hidden (the room doesn't exist yet, e.g.
 *               while creating it) so only defaults can be picked.
 *   className - optional extra class
 *
 * The default grid behavior is unchanged.
 */

import { useEffect, useRef, useState } from "react";
import { api } from "../../app/lib/api";
import { ChatAPI } from "./api";
import { validateAvatarFile } from "../../app/lib/avatarCrop";
import { uploadAvatarBlob } from "../../app/lib/avatarUpload";
import { getErrorMessage } from "../../app/lib/errors";
import { avatarUrl } from "./helpers";
import AvatarCropper from "./AvatarCropper";
import { btnGhost, btnSm } from "./styles";

export interface DefaultAvatar {
  key: string;
  url: string;
}

interface AvatarSelectorProps {
  source: "user" | "room";
  selected: string | null;
  onSelect: (key: string) => void;
  contextId?: string;
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

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AvatarSelector({
  source,
  selected,
  onSelect,
  contextId,
  className = "",
}: AvatarSelectorProps) {
  const [avatars, setAvatars] = useState<DefaultAvatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track which images failed to load so we can show a fallback
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const hasFetched = useRef(false);

  // Upload flow state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingSrc, setEditingSrc] = useState<string | null>(null);
  const [editingMime, setEditingMime] = useState("image/png");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Upload is only possible when the target exists to scope the S3 key:
  // user avatars are always scoped to the session, rooms need their id.
  const canUpload = source === "user" || !!contextId;

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

  function pickFile(file: File | undefined) {
    if (!file) return;
    const problem = validateAvatarFile(file);
    if (problem) {
      setUploadError(problem);
      return;
    }
    setUploadError(null);
    setEditingMime(file.type || "image/png");
    setEditingSrc(URL.createObjectURL(file));
  }

  function cancelEdit() {
    if (editingSrc) URL.revokeObjectURL(editingSrc);
    setEditingSrc(null);
    setUploadError(null);
  }

  async function handleCropDone(blob: Blob) {
    setUploading(true);
    setUploadError(null);
    try {
      const s3Key = await uploadAvatarBlob(
        ChatAPI.presignAvatar,
        source,
        blob,
        {
          contextId,
        },
      );
      onSelect(s3Key);
      cancelEdit();
    } catch (err) {
      setUploadError(getErrorMessage(err, "Failed to upload avatar"));
    } finally {
      setUploading(false);
    }
  }

  // If the user is editing, show the cropper instead of the default grid.
  if (editingSrc) {
    return (
      <div className={className}>
        <AvatarCropper
          imageSrc={editingSrc}
          mimeType={editingMime}
          busy={uploading}
          onCancel={cancelEdit}
          onDone={(blob) => void handleCropDone(blob)}
        />
        {uploadError && (
          <p className="mt-2 text-[13px] text-danger">{uploadError}</p>
        )}
      </div>
    );
  }

  if (loading) return <SkeletonGrid />;

  if (error) {
    return <p className="text-[13px] text-danger">{error}</p>;
  }

  const uploadedAvatar = selected?.startsWith("avatars/") ? (
    <button
      type="button"
      role="radio"
      aria-checked
      aria-label="Your uploaded avatar"
      className="avatar-selector-cell selected"
      tabIndex={0}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarUrl(selected) ?? ""}
        alt=""
        draggable={false}
        className="avatar-selector-img"
        onError={() => setFailed((prev) => new Set([...prev, selected]))}
      />
      <CheckRing />
    </button>
  ) : null;

  return (
    <div>
      <div
        className={`avatar-selector-grid ${className}`}
        role="radiogroup"
        aria-label="Select an avatar"
      >
        {uploadedAvatar}
        {avatars.map((av) => {
          const isSelected = selected === av.key;
          const hasFailed = failed.has(av.key);
          return (
            <button
              key={av.key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={
                av.key.split("/").pop()?.replace(".png", "") ?? av.key
              }
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
                  onError={() =>
                    setFailed((prev) => new Set([...prev, av.key]))
                  }
                />
              )}
              {isSelected && <CheckRing />}
            </button>
          );
        })}
      </div>

      {canUpload && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              pickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className={`${btnGhost} ${btnSm} mt-2 w-full`}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon /> Upload your own
          </button>
          {uploadError && (
            <p className="mt-1.5 text-[13px] text-danger">{uploadError}</p>
          )}
        </>
      )}
    </div>
  );
}
