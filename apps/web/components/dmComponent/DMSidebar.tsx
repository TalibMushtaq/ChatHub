"use client";
import { useEffect, useState } from "react";
import { api } from "../../app/lib/api";
import { useRouter, usePathname } from "next/navigation";
import NewDMModal from "./NewDMModel";

interface DMChat {
  directChatId: string;
  otherUser: {
    username: string;
  };
}

export default function DMSidebar({ onClose }: { onClose?: () => void }) {
  const [inbox, setInbox] = useState<DMChat[]>([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    api.get("/dm/inbox").then((res) => {
      setInbox(res.data.inbox);
    });
  }, []);

  const navigateTo = (chatId: string) => {
    if (pathname === `/dashboard/dm/${chatId}`) return;
    router.push(`/dashboard/dm/${chatId}`);
    onClose?.();
  };

  return (
    <div className="w-full h-full flex flex-col bg-surface border-r border-white/7">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/7 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg
                text-muted hover:text-text hover:bg-white/8 transition-all duration-200"
            >
              ✕
            </button>
          )}
          <span className="text-[11px] font-semibold uppercase tracking-[1px] text-muted">
            Direct Messages
          </span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer
            bg-primary/15 border border-primary/30 text-primary
            text-lg font-light leading-none transition-all duration-200
            hover:bg-primary/25 hover:border-primary/50 hover:text-white hover:scale-105
            hover:shadow-[0_0_12px_rgba(108,99,255,0.3)]"
        >
          +
        </button>
      </div>

      {/* Inbox List */}
      <div className="flex-1 overflow-y-auto px-2 py-2.5 flex flex-col gap-0.5">
        {inbox.length === 0 && (
          <p className="text-muted text-[13px] text-center mt-8 px-4 leading-relaxed">
            No conversations yet
          </p>
        )}
        {inbox.map((chat, i) => {
          const isActive = pathname === `/dashboard/dm/${chat.directChatId}`;
          const letter = chat.otherUser.username?.[0]?.toUpperCase() ?? "?";
          return (
            <div
              key={chat.directChatId}
              onClick={() => navigateTo(chat.directChatId)}
              style={{ animationDelay: `${i * 50}ms` }}
              className={`
                group flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] cursor-pointer
                border transition-all duration-200
                animate-[fadeSlideIn_0.3s_ease_both] [animation-fill-mode:both]
                ${
                  isActive
                    ? "bg-primary/12 border-primary/20"
                    : "border-transparent hover:bg-surface-2 hover:border-white/6"
                }
              `}
            >
              <div
                className={`w-9 h-9 rounded-[10px] border shrink-0
                  flex items-center justify-center text-[13px] font-bold
                  transition-all duration-200
                  ${
                    isActive
                      ? "bg-linear-to-br from-primary to-[#9d95ff] border-primary/40 text-white"
                      : "bg-linear-to-br from-surface-2 to-surface-3 border-white/7 text-muted"
                  }
                `}
              >
                {letter}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-[13px] font-medium truncate transition-colors duration-200
                  ${isActive ? "text-[#a09bff]" : "text-text"}`}
                >
                  {chat.otherUser.username}
                </p>
                <p className="text-[11px] text-muted truncate mt-0.5">
                  Click to open conversation
                </p>
              </div>
              <div
                className={`w-1.5 h-1.5 rounded-full bg-primary shrink-0 transition-opacity duration-200
                ${isActive ? "opacity-100" : "opacity-0"}`}
              />
            </div>
          );
        })}
      </div>

      {open && <NewDMModal onClose={() => setOpen(false)} />}
    </div>
  );
}
