"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";

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
        const inboxRes = await api.get("/dm/inbox");
        const chat = inboxRes.data.inbox.find(
          (c: { directChatId: string }) => c.directChatId === directChatId,
        );
        if (chat) {
          setOtherUser(chat.otherUser);
        }
      } catch (err) {
        console.error("Failed to load chat info", err);
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
