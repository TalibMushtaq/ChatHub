"use client";

// List column: title row, search box, and conversation rows for the active tab.
import { useEffect, useRef } from "react";
import { useShell } from "./state";
import { ChatAPI, getErrorMessage } from "./api";
import { displayName, fmtList } from "./helpers";
import AppAvatar from "./AppAvatar";
import {
  PlusIcon,
  SearchIcon,
  MailIcon,
  LinkIcon,
  RefreshIcon,
  GearIcon,
  UserIcon,
  MoreIcon,
} from "./icons";
import { iconBtn } from "./styles";

function lastText(content: string | null, messageType: string): string {
  if (messageType === "IMAGE") return "Photo";
  if (messageType === "VIDEO") return "Video";
  if (messageType === "AUDIO") return "Audio";
  if (messageType === "VOICE") return "Voice message";
  return content ?? "";
}

export default function ListPanel() {
  const {
    tab,
    q,
    setQ,
    search,
    dmList,
    roomList,
    active,
    listLoading,
    openConv,
    openModal,
    toast,
  } = useShell();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced user search while typing in the list search box.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      search("");
      return;
    }
    debounceRef.current = setTimeout(() => void search(q), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function startDmWith(user: {
    id: string;
    username: string;
    displayname?: string | null;
  }) {
    try {
      const chat = await ChatAPI.startDm(user.id);
      openConv({ kind: "dm", id: chat.id, otherUser: user });
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't start a chat"), "error");
    }
  }

  const title =
    tab === "dm"
      ? "Messages"
      : tab === "room"
        ? "Rooms"
        : tab === "search"
          ? "Search"
          : "Settings";

  return (
    <>
      <div className="list-head px-[14px] pt-[18px] pb-3">
        <div className="lrow mb-3 flex items-center justify-between gap-2">
          <h1 className="font-display text-[21px] leading-[1.15] tracking-tight">
            {title}
          </h1>
          {(tab === "dm" || tab === "room") && (
            <button
              className={`${iconBtn} h-9 w-9 hover:bg-accent-soft hover:text-accent-solid`}
              onClick={() => openModal(tab === "dm" ? "newDm" : "newRoom")}
              aria-label={tab === "dm" ? "New direct message" : "New room"}
            >
              <PlusIcon />
            </button>
          )}
        </div>
        {tab !== "settings" && (
          <div className="searchbox flex items-center gap-2 rounded-xl border-[1.5px] border-border bg-bg px-3 py-[9px] transition-[border-color,box-shadow] duration-150 ease-app focus-within:border-accent-solid focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-accent)_45%,transparent)]">
            <SearchIcon className="h-[17px] w-[17px] flex-none text-muted" />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] focus:outline-none"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search users…"
              aria-label="Search users"
            />
          </div>
        )}
      </div>

      <div className="list-body flex-1 overflow-y-auto px-2 py-1 pb-4">
        {tab === "dm" && (
          <>
            {q.trim() ? (
              <SearchResults onPick={startDmWith} />
            ) : listLoading ? (
              <Skeletons />
            ) : dmList.length === 0 ? (
              <Empty
                text="No messages yet"
                sub="Tap + to start a conversation."
              />
            ) : (
              dmList.map((e) => (
                <button
                  key={e.directChatId}
                  className={`conv flex w-full cursor-pointer items-center gap-[11px] rounded-[14px] p-2.5 text-left transition-colors duration-150 ease-app hover:bg-surface-2 ${active && active.kind === "dm" && active.id === e.directChatId ? "bg-accent-soft" : ""}`}
                  onClick={() =>
                    openConv({
                      kind: "dm",
                      id: e.directChatId,
                      otherUser: e.otherUser,
                    })
                  }
                >
                  <AppAvatar
                    name={displayName(e.otherUser)}
                    src={e.otherUser.avatar}
                    size={44}
                  />
                  <div className="mid min-w-0 flex-1">
                    <div className="line1 flex items-baseline justify-between gap-2">
                      <span className="name truncate text-[14.5px] font-extrabold">
                        {displayName(e.otherUser)}
                      </span>
                      {e.lastMessage && (
                        <span className="time flex-none text-[11px] font-semibold text-muted">
                          {fmtList(e.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <div className="line2 mt-0.5 flex items-center justify-between gap-2">
                      <span className="preview truncate text-[13px] text-muted">
                        {e.lastMessage?.isDeleted
                          ? "Message deleted"
                          : e.lastMessage
                            ? lastText(
                                e.lastMessage.content,
                                e.lastMessage.messageType,
                              )
                            : "Say hi 👋"}
                      </span>
                      {e.unreadCount > 0 && (
                        <span className="unread inline-flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-accent-btn px-1.5 text-[11px] font-extrabold text-accent-on">
                          {e.unreadCount > 9 ? "9+" : e.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </>
        )}

        {tab === "room" && (
          <>
            {listLoading ? (
              <Skeletons />
            ) : roomList.length === 0 ? (
              <Empty text="No rooms yet" sub="Tap + to create a room." />
            ) : (
              roomList
                .filter(
                  (r) =>
                    !q.trim() || r.name.toLowerCase().includes(q.toLowerCase()),
                )
                .map((r) => (
                  <button
                    key={r.roomId}
                    className={`conv flex w-full cursor-pointer items-center gap-[11px] rounded-[14px] p-2.5 text-left transition-colors duration-150 ease-app hover:bg-surface-2 ${active && active.kind === "room" && active.id === r.roomId ? "bg-accent-soft" : ""}`}
                    onClick={() =>
                      openConv({
                        kind: "room",
                        id: r.roomId,
                        name: r.name,
                        description: r.description,
                        myRole: r.myRole,
                      })
                    }
                  >
                    <AppAvatar name={r.name} size={44} square />
                    <div className="mid min-w-0 flex-1">
                      <div className="line1 flex items-baseline justify-between gap-2">
                        <span className="name truncate text-[14.5px] font-extrabold">
                          # {r.name}
                          {(r.myRole === "OWNER" || r.myRole === "ADMIN") && (
                            <span
                              className={`chip ml-2 inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-extrabold tracking-[0.02em] ${r.myRole === "OWNER" ? "bg-accent-wash text-accent-solid" : "bg-[color-mix(in_oklab,oklch(0.7_0.15_265)_14%,transparent)] text-[oklch(0.55_0.14_265)]"}`}
                            >
                              {r.myRole.toLowerCase()}
                            </span>
                          )}
                        </span>
                        {r.lastMessage && (
                          <span className="time flex-none text-[11px] font-semibold text-muted">
                            {fmtList(r.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      <div className="line2 mt-0.5 flex items-center justify-between gap-2">
                        <span className="preview truncate text-[13px] text-muted">
                          {r.lastMessage?.isDeleted
                            ? "Message deleted"
                            : r.lastMessage
                              ? lastText(
                                  r.lastMessage.content,
                                  r.lastMessage.messageType,
                                )
                              : `${r.memberCount} member${r.memberCount === 1 ? "" : "s"}`}
                        </span>
                        {r.unreadCount > 0 && (
                          <span className="unread inline-flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-accent-btn px-1.5 text-[11px] font-extrabold text-accent-on">
                            {r.unreadCount > 9 ? "9+" : r.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
            )}
          </>
        )}

        {tab === "search" && (
          <>
            {q.trim() ? (
              <SearchResults onPick={startDmWith} />
            ) : (
              <Empty
                text="Find people"
                sub="Search for a username to start a new chat."
              />
            )}
          </>
        )}

        {tab === "settings" && <SettingsMenu />}
      </div>
    </>
  );
}

function SearchResults({
  onPick,
}: {
  onPick: (u: {
    id: string;
    username: string;
    displayname?: string | null;
  }) => void;
}) {
  const { results } = useShell();
  if (results.length === 0) return <Empty text="No users found" />;
  return (
    <>
      {results.map((u) => (
        <button
          key={u.id}
          className="conv flex w-full cursor-pointer items-center gap-[11px] rounded-[14px] p-2.5 text-left transition-colors duration-150 ease-app hover:bg-surface-2"
          onClick={() => onPick(u)}
        >
          <AppAvatar name={u.displayname ?? u.username} size={44} />
          <div className="mid min-w-0 flex-1">
            <div className="line1 flex items-baseline justify-between gap-2">
              <span className="name truncate text-[14.5px] font-extrabold">
                {displayName(u)}
              </span>
            </div>
            <div className="line2 mt-0.5 flex items-center justify-between gap-2">
              <span className="preview truncate text-[13px] text-muted">
                @{u.username}
              </span>
            </div>
          </div>
          <span className="time flex-none text-[11px] font-semibold text-muted">
            new
          </span>
        </button>
      ))}
    </>
  );
}

function SettingsMenu() {
  const { openModal } = useShell();
  const items = [
    {
      label: "My Account",
      sub: "Email, sign out, theme",
      icon: <GearIcon />,
      modal: "account",
    },
    {
      label: "Profile",
      sub: "Your public info",
      icon: <UserIcon />,
      modal: "profile",
    },
    {
      label: "Recovery codes",
      sub: "Regenerate your backup codes",
      icon: <RefreshIcon />,
      modal: "recovery",
    },
    {
      label: "Received invitations",
      sub: "Pending room invites",
      icon: <MailIcon />,
      modal: "receivedInvites",
    },
    {
      label: "Sent invitations",
      sub: "Invites you have sent",
      icon: <MailIcon />,
      modal: "sentInvites",
    },
    {
      label: "My join links",
      sub: "Manage shared room links",
      icon: <LinkIcon />,
      modal: "myLinks",
    },
  ] as const;
  return (
    <>
      {items.map((it) => (
        <button
          key={it.label}
          className="conv flex w-full cursor-pointer items-center gap-[11px] rounded-[14px] p-2.5 text-left transition-colors duration-150 ease-app hover:bg-surface-2"
          onClick={() => openModal(it.modal)}
        >
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-surface-2 text-fg">
            {it.icon}
          </span>
          <div className="mid min-w-0 flex-1">
            <div className="line1 flex items-baseline justify-between gap-2">
              <span className="name truncate text-[14.5px] font-extrabold">
                {it.label}
              </span>
            </div>
            <div className="line2 mt-0.5 flex items-center justify-between gap-2">
              <span className="preview truncate text-[13px] text-muted">
                {it.sub}
              </span>
            </div>
          </div>
          <MoreIcon className="flex-none text-muted" />
        </button>
      ))}
    </>
  );
}

function Empty({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="px-6 py-[42px] text-center text-[14px] text-muted">
      <div className="mb-3.5 flex justify-center">
        <AppAvatar name="ChatHubby" size={74} square />
      </div>
      <b className="mb-1 block text-fg">{text}</b>
      {sub && <span>{sub}</span>}
    </div>
  );
}

function Skeletons() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="relative mx-0.5 my-1 h-[58px] overflow-hidden rounded-[14px] bg-surface-2"
        >
          <div
            className="absolute inset-0 -translate-x-full animate-[shimmer_1.3s_infinite] bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--color-fg)_7%,transparent),transparent)]"
            aria-hidden
          />
        </div>
      ))}
    </>
  );
}
