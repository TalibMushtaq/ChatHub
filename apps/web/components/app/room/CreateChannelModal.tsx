"use client";

// Create-channel modal (Phase 3 §7.1): name + type + optional topic + category.
// TEXT and VOICE are fully wired. ANNOUNCEMENT/FORUM are dropped because the
// server only accepts TEXT/VOICE. Name rules are mirrored
// client-side; the server re-validates and enforces the unique constraint.
import { useMemo, useState, type FormEvent } from "react";
import { useShell } from "../state";
import { ChatAPI, getErrorMessage } from "../api";
import { normalizeChannelName } from "@repo/validators";
import { useRoomDetail } from "./useRoomDetail";
import type { ChannelType } from "../types";
import { btnPrimary, btnBlock, fieldLabel, fieldInput } from "../styles";

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

export function CreateChannelModal({
  roomId,
  initialCategoryId,
}: {
  roomId: string;
  initialCategoryId?: string | null;
}) {
  const { toast, refreshRoomDetail, clearModals } = useShell();
  const { detail } = useRoomDetail(roomId);
  const [name, setName] = useState("");
  const [type, setType] = useState<ChannelType>("TEXT");
  const [topic, setTopic] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(
    initialCategoryId ?? null,
  );
  const [busy, setBusy] = useState(false);

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
      ].some((c) => c.name === normalized);
      if (clash) return "A channel with that name already exists";
    }
    return null;
  }, [name, normalized, detail]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!normalized || nameError || busy) return;
    setBusy(true);
    try {
      await ChatAPI.createChannel(roomId, {
        name: normalized,
        type,
        topic: topic.trim() || null,
        categoryId,
      });
      toast(`#${normalized} created`, "success");
      clearModals();
      void refreshRoomDetail(roomId);
    } catch (err) {
      toast(getErrorMessage(err, "Failed to create channel"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void create(e)}>
      <div className="mfield mb-3.5">
        <label htmlFor="create-channel-name" className={fieldLabel}>
          Channel name
        </label>
        <input
          id="create-channel-name"
          className={fieldInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. general-development"
          autoFocus
          maxLength={64}
          aria-invalid={!!nameError || undefined}
          aria-describedby={nameError ? "create-channel-name-error" : undefined}
        />
        {nameError && (
          <p
            id="create-channel-name-error"
            className="mt-1 text-[12px] font-semibold text-danger"
          >
            {nameError}
          </p>
        )}
      </div>
      <div className="mfield mb-3.5">
        <label htmlFor="create-channel-type" className={fieldLabel}>
          Type
        </label>
        <select
          id="create-channel-type"
          className={fieldInput}
          value={type}
          onChange={(e) => setType(e.target.value as ChannelType)}
        >
          <option value="TEXT">Text</option>
          <option value="VOICE">Voice</option>
        </select>
      </div>
      <div className="mfield mb-3.5">
        <label htmlFor="create-channel-topic" className={fieldLabel}>
          Topic (optional)
        </label>
        <input
          id="create-channel-topic"
          className={fieldInput}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What is this channel about?"
          maxLength={200}
        />
      </div>
      <div className="mfield mb-3.5">
        <label htmlFor="create-channel-category" className={fieldLabel}>
          Category
        </label>
        <select
          id="create-channel-category"
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
          {busy ? "Creating…" : "Create channel"}
        </button>
      </div>
    </form>
  );
}
