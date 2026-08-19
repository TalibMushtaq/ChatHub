"use client";

// Create-channel modal (Phase 2 §6.2): name + type (TEXT/VOICE/ANNOUNCEMENT/
// FORUM), optional topic, and the category it belongs to. Admin/owner only —
// the server enforces the permission, and the sidebar only surfaces the
// "+" affordance to authorized roles.
import { useState, type FormEvent } from "react";
import { useShell } from "../state";
import { ChatAPI, getErrorMessage } from "../api";
import { useRoomDetail } from "./useRoomDetail";
import type { ChannelType } from "../types";
import { btnPrimary, btnBlock, fieldLabel, fieldInput } from "../styles";

const CHANNEL_TYPES: { value: ChannelType; label: string }[] = [
  { value: "TEXT", label: "Text" },
  { value: "VOICE", label: "Voice" },
  { value: "ANNOUNCEMENT", label: "Announcement" },
  { value: "FORUM", label: "Forum" },
];

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

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await ChatAPI.createChannel(roomId, {
        name: name.trim(),
        type,
        topic: topic.trim() || null,
        categoryId,
      });
      toast(`#${name.trim()} created`, "success");
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
        <label className={fieldLabel}>Channel name</label>
        <input
          className={fieldInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. general, dev-talk…"
          autoFocus
          maxLength={64}
        />
      </div>
      <div className="mfield mb-3.5">
        <label className={fieldLabel}>Type</label>
        <select
          className={fieldInput}
          value={type}
          onChange={(e) => setType(e.target.value as ChannelType)}
        >
          {CHANNEL_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mfield mb-3.5">
        <label className={fieldLabel}>Topic (optional)</label>
        <input
          className={fieldInput}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What is this channel about?"
          maxLength={140}
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
          disabled={busy || !name.trim()}
        >
          {busy ? "Creating…" : "Create channel"}
        </button>
      </div>
    </form>
  );
}
