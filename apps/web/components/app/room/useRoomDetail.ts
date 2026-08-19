"use client";

// Loads (and caches) a room's detail structure for the shell. RoomShell and
// the create-channel/category modals share this so the sidebar tree and the
// category dropdown agree on the same source of truth. Only fetched once per
// room id; callers can `refresh` after a mutation to re-pull from the server.
import { useEffect, useState } from "react";
import { useShell } from "../state";
import type { RoomDetail } from "../types";

export function useRoomDetail(roomId: string): {
  detail: RoomDetail | undefined;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const { roomDetails, refreshRoomDetail } = useShell();
  const cached = roomDetails[roomId];
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cached) {
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void refreshRoomDetail(roomId)
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load room");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // refreshRoomDetail is stable (AppShell function); cached drives re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, cached]);

  return {
    detail: cached,
    loading,
    error,
    refresh: () => refreshRoomDetail(roomId),
  };
}
