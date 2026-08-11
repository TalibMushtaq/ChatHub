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
      <div className="list-head">
        <div className="lrow">
          <h1>{title}</h1>
          {(tab === "dm" || tab === "room") && (
            <button
              className="icon-btn"
              onClick={() => openModal(tab === "dm" ? "newDm" : "newRoom")}
              aria-label={tab === "dm" ? "New direct message" : "New room"}
            >
              <PlusIcon />
            </button>
          )}
        </div>
        {tab !== "settings" && (
          <div className="searchbox">
            <SearchIcon />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search users…"
              aria-label="Search users"
            />
          </div>
        )}
      </div>

      <div className="list-body">
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
                  className={`conv ${active && active.kind === "dm" && active.id === e.directChatId ? "on" : ""}`}
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
                  <div className="mid">
                    <div className="line1">
                      <span className="name">{displayName(e.otherUser)}</span>
                      {e.lastMessage && (
                        <span className="time">
                          {fmtList(e.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <div className="line2">
                      <span className="preview">
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
                        <span className="unread">
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
                    className={`conv ${active && active.kind === "room" && active.id === r.roomId ? "on" : ""}`}
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
                    <div className="mid">
                      <div className="line1">
                        <span className="name">
                          # {r.name}
                          {(r.myRole === "OWNER" || r.myRole === "ADMIN") && (
                            <span className={`chip ${r.myRole.toLowerCase()}`}>
                              {r.myRole.toLowerCase()}
                            </span>
                          )}
                        </span>
                        {r.lastMessage && (
                          <span className="time">
                            {fmtList(r.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      <div className="line2">
                        <span className="preview">
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
                          <span className="unread">
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
        <button key={u.id} className="conv" onClick={() => onPick(u)}>
          <AppAvatar name={u.displayname ?? u.username} size={44} />
          <div className="mid">
            <div className="line1">
              <span className="name">{displayName(u)}</span>
            </div>
            <div className="line2">
              <span className="preview">@{u.username}</span>
            </div>
          </div>
          <span className="time">new</span>
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
          className="conv"
          onClick={() => openModal(it.modal)}
        >
          <span
            className="avatar"
            style={{
              width: 44,
              height: 44,
              fontSize: 16,
              background: "var(--surface-2)",
            }}
          >
            {it.icon}
          </span>
          <div className="mid">
            <div className="line1">
              <span className="name">{it.label}</span>
            </div>
            <div className="line2">
              <span className="preview">{it.sub}</span>
            </div>
          </div>
          <MoreIcon />
        </button>
      ))}
    </>
  );
}

function Empty({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="empty-list">
      <AppAvatar name="ChatHubby" size={74} square />
      <b>{text}</b>
      {sub && <span>{sub}</span>}
    </div>
  );
}

function Skeletons() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skel" />
      ))}
    </>
  );
}
