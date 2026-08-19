"use client";

// Create-category modal (Phase 2 §6.2): a plain name for a new category that
// groups channels in the sidebar. Admin/owner only (server-enforced).
import { useState, type FormEvent } from "react";
import { useShell } from "../state";
import { ChatAPI, getErrorMessage } from "../api";
import { btnPrimary, btnBlock, fieldLabel, fieldInput } from "../styles";

export function CreateCategoryModal({ roomId }: { roomId: string }) {
  const { toast, refreshRoomDetail, clearModals } = useShell();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await ChatAPI.createCategory(roomId, name.trim());
      toast(`Category "${name.trim()}" created`, "success");
      clearModals();
      void refreshRoomDetail(roomId);
    } catch (err) {
      toast(getErrorMessage(err, "Failed to create category"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void create(e)}>
      <div className="mfield mb-3.5">
        <label className={fieldLabel}>Category name</label>
        <input
          className={fieldInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Development, General…"
          autoFocus
          maxLength={64}
        />
      </div>
      <div className="mactions mt-4 grid gap-2.5">
        <button
          className={`${btnPrimary} ${btnBlock}`}
          type="submit"
          disabled={busy || !name.trim()}
        >
          {busy ? "Creating…" : "Create category"}
        </button>
      </div>
    </form>
  );
}
