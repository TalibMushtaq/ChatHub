"use client";

// Rename-category modal (Phase 3 §7.2). Names are free-form (not normalized
// like channels); duplicate category names are rejected server-side (409) and
// surfaced through the toast. Category reordering happens via drag-and-drop.
import { useMemo, useState, type FormEvent } from "react";
import { useShell } from "../state";
import { ChatAPI, getErrorMessage } from "../api";
import { btnPrimary, btnBlock, fieldLabel, fieldInput } from "../styles";
import { useRoomDetail } from "./useRoomDetail";

export function EditCategoryModal({
  roomId,
  categoryId,
}: {
  roomId: string;
  categoryId: string;
}) {
  const { toast, patchRoomDetail, clearModals } = useShell();
  const { detail } = useRoomDetail(roomId);
  const category = useMemo(
    () => detail?.categories.find((c) => c.id === categoryId),
    [detail, categoryId],
  );
  const [name, setName] = useState(category?.name ?? "");
  const [busy, setBusy] = useState(false);

  const nameError = useMemo(() => {
    if (name.trim().length > 100) {
      return "Category names must be at most 100 characters";
    }
    if (detail && name.trim()) {
      const clash = detail.categories.some(
        (c) => c.id !== categoryId && c.name === name.trim(),
      );
      if (clash) return "A category with that name already exists";
    }
    return null;
  }, [name, detail, categoryId]);

  if (!category) {
    return (
      <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
        Category not found.
      </p>
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || nameError || busy) return;
    setBusy(true);
    try {
      const updated = await ChatAPI.updateCategory(roomId, categoryId, {
        name: trimmed,
      });
      patchRoomDetail(roomId, (detail) => ({
        ...detail,
        categories: detail.categories.map((c) =>
          c.id === categoryId ? { ...c, ...updated } : c,
        ),
      }));
      toast(`Category "${trimmed}" saved`, "success");
      clearModals();
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't update the category"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)}>
      <div className="mfield mb-3.5">
        <label className={fieldLabel}>Category name</label>
        <input
          className={fieldInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Development, General…"
          autoFocus
          maxLength={100}
        />
        {nameError && (
          <p className="mt-1 text-[12px] font-semibold text-danger">
            {nameError}
          </p>
        )}
      </div>
      <div className="mactions mt-4 grid gap-2.5">
        <button
          className={`${btnPrimary} ${btnBlock}`}
          type="submit"
          disabled={busy || !!nameError || !name.trim()}
        >
          {busy ? "Saving…" : "Save category"}
        </button>
      </div>
    </form>
  );
}
