"use client";

// Edit-channel modal (Phase 3 §7.1): rename, edit the topic, or move the
// channel to another category (the keyboard/mobile path for "move"). The type
// is fixed after creation, mirroring Discord. Duplicate names are rejected
// client-side against the loaded tree AND server-side (409) as the authority.
import { useMemo, useState, type FormEvent } from "react";
import { useShell } from "../state";
import { ChatAPI, getErrorMessage } from "../api";
import { normalizeChannelName } from "@repo/validators";
import { btnPrimary, btnBlock, fieldLabel, fieldInput } from "../styles";
import { useRoomDetail } from "./useRoomDetail";

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

export function EditChannelModal({
  roomId,
  channelId,
}: {
  roomId: string;
  channelId: string;
}) {
  const { toast, patchRoomDetail, clearModals } = useShell();
  const { detail } = useRoomDetail(roomId);
  const channel = useMemo(() => {
    if (!detail) return undefined;
    for (const cat of detail.categories) {
      const hit = (cat.channels ?? []).find((c) => c.id === channelId);
      if (hit) return hit;
    }
    return detail.uncategorized.find((c) => c.id === channelId);
  }, [detail, channelId]);

  const [name, setName] = useState(channel?.name ?? "");
  const [topic, setTopic] = useState(channel?.topic ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(
    channel?.categoryId ?? null,
  );
  const [busy, setBusy] = useState(false);

  // Client-side mirror of the server's channel-name rules (2–32 lowercase
  // alphanumeric/hyphen, spaces collapsed to hyphens). The server still
  // re-validates and enforces the unique constraint.
  const normalized = useMemo(() => normalizeChannelName(name), [name]);
  const nameError = useMemo(() => {
    if (name.trim() && normalized.length < 2) {
      return "Channel names must be at least 2 characters";
    }
    if (name.trim() && normalized.length > 32) {
      return "Channel names must be at most 32 characters";
    }
    if (name.trim() && !NAME_RE.test(normalized)) {
      return "Only lowercase letters, numbers, and hyphens allowed";
    }
    if (detail && normalized) {
      const clash = [
        ...detail.categories.flatMap((c) => c.channels ?? []),
        ...detail.uncategorized,
      ].some((c) => c.id !== channelId && c.name === normalized);
      if (clash) return "A channel with that name already exists";
    }
    return null;
  }, [name, normalized, detail, channelId]);

  if (!channel) {
    return (
      <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
        Channel not found.
      </p>
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!normalized || nameError || busy) return;
    setBusy(true);
    try {
      const updated = await ChatAPI.updateChannel(roomId, channelId, {
        name: normalized,
        topic: topic.trim() || null,
        categoryId,
      });
      // Swap the edited channel into the cached tree (updates its category
      // bucket too when the user moved it).
      patchRoomDetail(roomId, (detail) => {
        const categories = detail.categories.map((cat) => ({
          ...cat,
          channels: [
            ...(cat.channels ?? []).filter((c) => c.id !== channelId),
            ...(updated.categoryId === cat.id ? [updated] : []),
          ].sort((a, b) => a.position - b.position),
        }));
        return {
          ...detail,
          categories,
          uncategorized:
            updated.categoryId === null
              ? [
                  ...detail.uncategorized.filter((c) => c.id !== channelId),
                  updated,
                ]
              : detail.uncategorized.filter((c) => c.id !== channelId),
        };
      });
      toast(`#${normalized} saved`, "success");
      clearModals();
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't update the channel"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)}>
      <div className="mfield mb-3.5">
        <label className={fieldLabel}>Channel name</label>
        <input
          className={fieldInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="general-development"
          autoFocus
          maxLength={64}
        />
        {nameError && (
          <p className="mt-1 text-[12px] font-semibold text-danger">
            {nameError}
          </p>
        )}
      </div>
      <div className="mfield mb-3.5">
        <label className={fieldLabel}>Topic (optional)</label>
        <input
          className={fieldInput}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What is this channel about?"
          maxLength={200}
        />
      </div>
      <div className="mfield mb-3.5">
        <label className={fieldLabel}>Category</label>
        <select
          className={fieldInput}
          value={categoryId ?? ""}
          onChange={(e) => setCategoryId(e.target.value || null)}
        >
          <option value="">Uncategorized</option>
          {(detail?.categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="mactions mt-4 grid gap-2.5">
        <button
          className={`${btnPrimary} ${btnBlock}`}
          type="submit"
          disabled={busy || !!nameError || !normalized}
        >
          {busy ? "Saving…" : "Save channel"}
        </button>
      </div>
    </form>
  );
}
