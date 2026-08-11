"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { getErrorMessage } from "../../lib/errors";

interface DMChatTopbarProps {
  directChatId: string;
  onMenuOpen: () => void;
}

export default function DMChatTopbar({
  directChatId,
  onMenuOpen,
}: DMChatTopbarProps) {
  const router = useRouter();
  const [otherUser, setOtherUser] = useState<{
    username: string;
    avatar?: string;
  } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // The inbox is paginated, so the open chat may not be on the first
        // page — follow the cursor through subsequent pages until it's found.
        let cursor: string | undefined;
        do {
          const inboxRes = await api.get("/dm/inbox", {
            params: cursor ? { cursor, limit: 50 } : { limit: 50 },
          });
          const { inbox, nextCursor } = inboxRes.data as {
            inbox: {
              directChatId: string;
              otherUser: { username: string; avatar?: string };
            }[];
            nextCursor: string | null;
          };
          const chat = inbox.find(
            (c: { directChatId: string }) => c.directChatId === directChatId,
          );
          if (chat) {
            setOtherUser(chat.otherUser);
            return;
          }
          cursor = nextCursor ?? undefined;
        } while (cursor);
      } catch (err) {
        toast.error(getErrorMessage(err, "Failed to load chat info"));
      }
    }
    load();
  }, [directChatId]);

  const letter = otherUser?.username?.[0]?.toUpperCase() ?? "?";

  return (
    <header
      className="
        md:hidden
        h-13 shrink-0 flex items-center gap-3 px-3
        bg-surface border-b border-white/7
      "
    >
      {/* Back arrow → goes to DM inbox */}
      <button
        onClick={() => router.push("/dashboard/dm")}
        className="
          w-8 h-8 flex items-center justify-center rounded-lg
          text-muted hover:text-text hover:bg-white/8
          transition-all duration-200
        "
      >
        ←
      </button>

      {/* Avatar + name */}
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <div
          className="
            w-8 h-8 rounded-[10px] bg-primary/15 border border-primary/25
            flex items-center justify-center text-[12px] font-bold text-primary shrink-0
          "
        >
          {letter}
        </div>

        <span className="text-[14px] font-semibold text-text truncate">
          {otherUser?.username ?? "Loading…"}
        </span>
      </div>

      {/* Hamburger → opens DM sidebar */}
      <button
        onClick={onMenuOpen}
        className="
          w-8 h-8 flex items-center justify-center rounded-lg
          text-muted hover:text-text hover:bg-white/8
          transition-all duration-200
        "
      >
        ☰
      </button>
    </header>
  );
}
