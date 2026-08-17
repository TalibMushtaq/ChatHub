"use client";

// Shared entry points for opening a user's profile card or full-screen avatar
// viewer from any surface that renders a user. Keeping them as separate
// functions (rather than one handler branching on event.target) is what lets
// callers attach distinct click targets to the avatar vs. the name, with the
// avatar's handler stopping propagation so it never bubbles to a parent
// "open profile card" or "open conversation" handler.
import { useCallback } from "react";
import { useShell } from "./state";

export function useUserActions() {
  const { openModal } = useShell();

  const openProfile = useCallback(
    (userId: string) => openModal("userProfile", { userId }),
    [openModal],
  );

  const openAvatar = useCallback(
    (userId: string, name?: string | null, avatar?: string | null) =>
      openModal("avatarViewer", {
        userId,
        name: name ?? undefined,
        avatar: avatar ?? null,
      }),
    [openModal],
  );

  return { openProfile, openAvatar };
}
