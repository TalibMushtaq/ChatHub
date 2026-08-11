"use client";

// Main messenger shell: owns all conversation state, wires the socket events,
// and composes the rail / list / thread columns plus the modal + toast systems.
import { useEffect, useRef, useState } from "react";
import { socket } from "../../app/lib/socket";
import { getErrorMessage } from "../../app/lib/errors";
import { loadInitialState } from "../../app/lib/initialLoad";
import { ChatAPI, RoomSocket } from "./api";
import { ShellContext, type ActiveConv, type ModalEntry, type ToastItem } from "./state";
import type { AppUser, DMInboxEntry, Invitation, Message, RoomInboxEntry, RoomMember, SearchUser, Tab, ToastType } from "./types";
import AppAvatar from "./AppAvatar";
import ListPanel from "./ListPanel";
import ThreadPanel from "./ThreadPanel";
import Modals from "./Modals";
import { Toasts } from "./Toasts";
import { ChatIcon, UsersIcon, SearchIcon, GearIcon, LogoutIcon, SunIcon, MoonIcon, UserIcon } from "./icons";
import { useTheme } from "../../app/lib/useTheme";

type AnyMsg = {
  id: string;
  content?: string | null;
  messageType?: string;
  createdAt?: string;
  isDeleted?: boolean;
  editedAt?: string | null;
  deletedAt?: string | null;
  senderId?: string;
  directChatId?: string;
  chatRoomId?: string;
  attachments?: Message["attachments"];
};

export default function AppShell() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [tab, setTab] = useState<Tab>("dm");
  const [active, setActive] = useState<ActiveConv | null>(null);
  const [dmList, setDmList] = useState<DMInboxEntry[]>([]);
  const [roomList, setRoomList] = useState<RoomInboxEntry[]>([]);
  const [msgs, setMsgs] = useState<Record<string, Message[]>>({});
  const [roomMembers, setRoomMembers] = useState<Record<string, RoomMember[]>>({});
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [mStack, setMStack] = useState<ModalEntry[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [fmenu, setFmenu] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { theme, toggle: toggleTheme } = useTheme();

  // Refs mirror state so the once-registered socket handlers never see stale closures.
  const activeRef = useRef<ActiveConv | null>(null);
  const userRef = useRef<AppUser | null>(null);
  const joinedRef = useRef<Set<string>>(new Set());
  const loadedKeysRef = useRef<Set<string>>(new Set());
  const msgsRef = useRef<Record<string, Message[]>>({});
  const roomMembersRef = useRef<Record<string, RoomMember[]>>({});

  function setMsgsBoth(fn: (prev: Record<string, Message[]>) => Record<string, Message[]>) {
    msgsRef.current = fn(msgsRef.current);
    setMsgs(msgsRef.current);
  }
  function setRoomMembersBoth(fn: (prev: Record<string, RoomMember[]>) => Record<string, RoomMember[]>) {
    roomMembersRef.current = fn(roomMembersRef.current);
    setRoomMembers(roomMembersRef.current);
  }

  // ---------------------------------------------------------------------------
  // Toasts & modals
  // ---------------------------------------------------------------------------
  const toast = (text: string, type: ToastType = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };
  const openModal = (name: ModalEntry["name"], payload?: unknown) =>
    setMStack((prev) => [...prev, { name, payload }]);
  const popModal = () => setMStack((prev) => prev.slice(0, -1));
  const clearModals = () => setMStack([]);

  // ---------------------------------------------------------------------------
  // Initial load
  // ---------------------------------------------------------------------------
  // Auth first, lists best-effort: /auth/me resolving is what flips the shell
  // out of the splash. If the inbox/rooms requests fail (e.g. API hiccup or a
  // rate-limited endpoint), we still render the shell with empty lists rather
  // than leaving the user stuck on the loading screen.
  useEffect(() => {
    let cancelled = false;
    const live = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => {
      if (!cancelled) fn(...args);
    };
    void loadInitialState(
      {
        getMe: () => ChatAPI.getMe(),
        getDmInbox: () => ChatAPI.getDmInbox(),
        getRooms: () => ChatAPI.getRooms(),
      },
      {
        onUser: live((me) => {
          userRef.current = me;
          setUser(me);
        }),
        onLists: live((dm, rooms) => {
          setDmList(dm);
          setRoomList(rooms);
        }),
        onUnauthorized: () => {
          window.location.href = "/auth";
        },
        onLoadError: live((message) => setLoadError(message)),
        onListError: live((message) => toast(message, "error")),
        onDone: live(() => setListLoading(false)),
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Socket wiring (registered once; reads via refs)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    function normalize(c: ActiveConv, msg: AnyMsg, mine: boolean): Message {
      const me = () => ({
        id: userRef.current!.id,
        username: userRef.current!.username,
        displayname: userRef.current!.displayname,
        avatar: userRef.current!.avatar,
      });
      if (c.kind === "dm") {
        const u = mine
          ? me()
          : c.otherUser
            ? {
                id: c.otherUser.id,
                username: c.otherUser.username ?? "unknown",
                displayname: c.otherUser.displayname ?? null,
                avatar: c.otherUser.avatar ?? null,
              }
            : { id: msg.senderId ?? "", username: "unknown", displayname: null, avatar: null };
        return {
          id: msg.id,
          content: msg.content ?? null,
          messageType: msg.messageType ?? "TEXT",
          createdAt: msg.createdAt ?? new Date().toISOString(),
          isDeleted: msg.isDeleted ?? false,
          editedAt: msg.editedAt ?? undefined,
          deletedAt: msg.deletedAt ?? undefined,
          senderId: msg.senderId,
          directChatId: msg.directChatId ?? c.id,
          attachments: msg.attachments ?? [],
          User: u,
        };
      }
      const members = roomMembersRef.current[c.id] ?? [];
      const sender = members.find((m) => m.user.id === msg.senderId)?.user;
      const u = mine
        ? me()
        : (sender ?? { id: msg.senderId ?? "", username: msg.senderId?.slice(0, 8) ?? "member", displayname: null, avatar: null });
      return {
        id: msg.id,
        content: msg.content ?? null,
        messageType: msg.messageType ?? "TEXT",
        createdAt: msg.createdAt ?? new Date().toISOString(),
        isDeleted: msg.isDeleted ?? false,
        editedAt: msg.editedAt ?? undefined,
        deletedAt: msg.deletedAt ?? undefined,
        senderId: msg.senderId,
        chatRoomId: msg.chatRoomId ?? c.id,
        attachments: msg.attachments ?? [],
        User: u,
      };
    }

    function upsert(list: Message[], msg: Message): Message[] {
      const idx = list.findIndex((m) => m.id === msg.id);
      if (idx >= 0) {
        const copy = [...list];
        copy[idx] = msg;
        return copy;
      }
      return [...list, msg];
    }

    function lastStub(msg: Message) {
      return {
        id: msg.id,
        content: msg.content,
        messageType: msg.messageType,
        createdAt: msg.createdAt,
        isDeleted: !!msg.isDeleted,
      };
    }

    function bumpDmList(directChatId: string, msg: Message, mine: boolean) {
      setDmList((prev) => {
        const entry = prev.find((e) => e.directChatId === directChatId);
        if (!entry) return prev;
        const rest = prev.filter((e) => e.directChatId !== directChatId);
        return [
          { ...entry, lastMessage: lastStub(msg), unreadCount: mine ? entry.unreadCount : entry.unreadCount + 1 },
          ...rest,
        ];
      });
    }

    function bumpRoomList(roomId: string, msg: Message, mine: boolean) {
      setRoomList((prev) => {
        const entry = prev.find((r) => r.roomId === roomId);
        if (!entry) return prev;
        const rest = prev.filter((r) => r.roomId !== roomId);
        return [
          { ...entry, lastMessage: lastStub(msg), unreadCount: mine ? entry.unreadCount : entry.unreadCount + 1 },
          ...rest,
        ];
      });
    }

    function markReadNow() {
      const a = activeRef.current;
      if (!a) return;
      const key = `${a.kind}:${a.id}`;
      const list = msgsRef.current[key] ?? [];
      const last = list[list.length - 1];
      if (!last || last.pending) return;
      // DM timelines omit senderId (only User.id), so compare via either field.
      const mine = last.senderId != null ? last.senderId === userRef.current?.id : last.User?.id === userRef.current?.id;
      if (mine) return;
      if (a.kind === "dm") {
        ChatAPI.markDmRead(a.id, last.id).catch(() => {});
      } else {
        ChatAPI.markRoomRead(a.id, last.id).catch(() => {});
      }
    }

    function onNew(msg: AnyMsg) {
      const a = activeRef.current;
      if (!a) return;
      const mine = msg.senderId === userRef.current?.id;
      if (a.kind === "dm" && msg.directChatId === a.id) {
        const norm = normalize(a, msg, mine);
        setMsgsBoth((prev) => ({ ...prev, [`dm:${a.id}`]: upsert(prev[`dm:${a.id}`] ?? [], norm) }));
        bumpDmList(a.id, norm, mine);
        if (!mine) markReadNow();
      } else if (a.kind === "room" && msg.chatRoomId === a.id) {
        const norm = normalize(a, msg, mine);
        setMsgsBoth((prev) => ({ ...prev, [`room:${a.id}`]: upsert(prev[`room:${a.id}`] ?? [], norm) }));
        bumpRoomList(a.id, norm, mine);
        if (!mine) markReadNow();
      }
    }

    function onEdited(patch: { messageId: string; content: string | null; editedAt: string }) {
      const a = activeRef.current;
      if (!a) return;
      const key = `${a.kind}:${a.id}`;
      setMsgsBoth((prev) => ({
        ...prev,
        [key]: (prev[key] ?? []).map((m) =>
          m.id === patch.messageId ? { ...m, content: patch.content, editedAt: patch.editedAt } : m,
        ),
      }));
    }

    function onDeleted(patch: { messageId: string; deletedAt: string }) {
      const a = activeRef.current;
      if (!a) return;
      const key = `${a.kind}:${a.id}`;
      setMsgsBoth((prev) => ({
        ...prev,
        [key]: (prev[key] ?? []).map((m) =>
          m.id === patch.messageId ? { ...m, isDeleted: true, deletedAt: patch.deletedAt, content: null } : m,
        ),
      }));
    }

    socket.on("message:new", onNew);
    socket.on("chatroom:message", onNew);
    socket.on("message:edited", onEdited);
    socket.on("chatroom:message:edited", onEdited);
    socket.on("message:deleted", onDeleted);
    socket.on("chatroom:message:deleted", onDeleted);

    socket.on("inbox:update", () => {
      ChatAPI.getDmInbox()
        .then((dm) => setDmList(dm.items))
        .catch(() => {});
    });

    socket.on("directChat:read", ({ directChatId, unreadCount }: { directChatId: string; unreadCount: number }) => {
      setDmList((prev) => prev.map((e) => (e.directChatId === directChatId ? { ...e, unreadCount } : e)));
    });

    socket.on("chatroom:read", ({ chatRoomId, unreadCount }: { chatRoomId: string; unreadCount: number }) => {
      setRoomList((prev) => prev.map((r) => (r.roomId === chatRoomId ? { ...r, unreadCount } : r)));
    });

    // Re-join the active conversation after a reconnect (the server drops rooms).
    socket.on("connect", () => {
      joinedRef.current.clear();
      const a = activeRef.current;
      if (a) joinSocket(a);
    });
    socket.on("disconnect", () => joinedRef.current.clear());

    return () => {
      socket.off("message:new", onNew);
      socket.off("chatroom:message", onNew);
      socket.off("message:edited", onEdited);
      socket.off("chatroom:message:edited", onEdited);
      socket.off("message:deleted", onDeleted);
      socket.off("chatroom:message:deleted", onDeleted);
      socket.off("inbox:update");
      socket.off("directChat:read");
      socket.off("chatroom:read");
      socket.off("connect");
      socket.off("disconnect");
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Conversation lifecycle
  // ---------------------------------------------------------------------------
  function joinSocket(c: ActiveConv) {
    const key = `${c.kind}:${c.id}`;
    if (joinedRef.current.has(key)) return;
    joinedRef.current.add(key);
    if (c.kind === "dm") socket.emit("directChat:join", { directChatId: c.id });
    else socket.emit("chatroom:join", { chatRoomId: c.id });
  }

  function leaveSocket(c: ActiveConv) {
    const key = `${c.kind}:${c.id}`;
    if (!joinedRef.current.has(key)) return;
    joinedRef.current.delete(key);
    if (c.kind === "dm") socket.emit("directChat:leave", { directChatId: c.id });
    else socket.emit("chatroom:leave", { chatRoomId: c.id });
  }

  function markRead() {
    const a = activeRef.current;
    if (!a) return;
    const key = `${a.kind}:${a.id}`;
    const list = msgsRef.current[key] ?? [];
    const last = list[list.length - 1];
    if (!last || last.pending) return;
    const mine = last.senderId != null ? last.senderId === userRef.current?.id : last.User?.id === userRef.current?.id;
    if (mine) return;
    if (a.kind === "dm") {
      ChatAPI.markDmRead(a.id, last.id).catch(() => {});
    } else {
      ChatAPI.markRoomRead(a.id, last.id).catch(() => {});
    }
  }

  async function loadMessages(c: ActiveConv) {
    const key = `${c.kind}:${c.id}`;
    try {
      const list = c.kind === "dm" ? await ChatAPI.getDmMessages(c.id) : await ChatAPI.getRoomMessages(c.id);
      setMsgsBoth((prev) => ({ ...prev, [key]: list }));
      markRead();
    } catch (err) {
      toast(getErrorMessage(err, "Failed to load messages"), "error");
    }
  }

  function openConv(c: ActiveConv) {
    const prev = activeRef.current;
    if (prev && !(prev.kind === c.kind && prev.id === c.id)) leaveSocket(prev);
    activeRef.current = c;
    setActive(c);
    setFmenu(false);
    joinSocket(c);
    if (c.kind === "room") {
      ChatAPI.getRoomMembers(c.id)
        .then((members) => setRoomMembersBoth((prev) => ({ ...prev, [c.id]: members })))
        .catch(() => {});
    }
    const key = `${c.kind}:${c.id}`;
    if (!loadedKeysRef.current.has(key)) {
      loadedKeysRef.current.add(key);
      void loadMessages(c);
    } else {
      markRead();
    }
  }

  function closeConv() {
    const a = activeRef.current;
    if (a) leaveSocket(a);
    activeRef.current = null;
    setActive(null);
  }

  // ---------------------------------------------------------------------------
  // Messaging
  // ---------------------------------------------------------------------------
  async function sendMessage(content: string, files: File[]): Promise<void> {
    const a = activeRef.current;
    if (!a) return;
    try {
      let msg: Message | null = null;
      if (files.length) {
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));
        const { attachmentIds, messageType } = await ChatAPI.upload(a.kind, a.id, dt.files);
        if (a.kind === "dm") {
          msg = await ChatAPI.sendDmMessage(a.id, { content: content || undefined, messageType, attachmentIds });
        } else {
          const res = await RoomSocket.send(a.id, { content: content || undefined, messageType, attachmentIds });
          msg = res.message ?? null;
        }
      } else {
        if (a.kind === "dm") {
          msg = await ChatAPI.sendDmMessage(a.id, { content, messageType: "TEXT" });
        } else {
          const res = await RoomSocket.send(a.id, { content, messageType: "TEXT" });
          msg = res.message ?? null;
        }
      }
      if (msg) {
        const me = userRef.current!;
        const norm = { ...msg, User: { id: me.id, username: me.username, displayname: me.displayname, avatar: me.avatar } };
        const key = `${a.kind}:${a.id}`;
        setMsgsBoth((prev) => {
          const list = prev[key] ?? [];
          const idx = list.findIndex((m) => m.id === msg.id);
          const next = idx >= 0 ? list.map((m) => (m.id === msg.id ? norm : m)) : [...list, norm];
          return { ...prev, [key]: next };
        });
        const stub = {
          id: msg.id,
          content: msg.content,
          messageType: msg.messageType,
          createdAt: msg.createdAt,
          isDeleted: false,
        };
        if (a.kind === "dm") {
          setDmList((prev) => {
            const entry = prev.find((e) => e.directChatId === a.id);
            if (!entry) return prev;
            return [{ ...entry, lastMessage: stub }, ...prev.filter((e) => e.directChatId !== a.id)];
          });
        } else {
          setRoomList((prev) => {
            const entry = prev.find((r) => r.roomId === a.id);
            if (!entry) return prev;
            return [{ ...entry, lastMessage: stub }, ...prev.filter((r) => r.roomId !== a.id)];
          });
        }
      }
    } catch (err) {
      toast(getErrorMessage(err, "Failed to send message"), "error");
      throw err;
    }
  }

  async function editMessage(messageId: string, content: string): Promise<void> {
    const a = activeRef.current;
    if (!a) throw new Error("No active conversation");
    if (a.kind === "dm") await ChatAPI.editDmMessage(messageId, content);
    else await RoomSocket.edit(a.id, messageId, content);
  }

  async function deleteMessage(messageId: string): Promise<void> {
    const a = activeRef.current;
    if (!a) return;
    if (a.kind === "dm") await ChatAPI.deleteDmMessage(messageId);
    else await RoomSocket.remove(a.id, messageId);
  }

  // ---------------------------------------------------------------------------
  // Search & lists
  // ---------------------------------------------------------------------------
  async function search(term: string) {
    setQ(term);
    if (!term.trim()) {
      setResults([]);
      return;
    }
    try {
      const users = await ChatAPI.searchUsers(term.trim());
      setResults(users);
    } catch (err) {
      toast(getErrorMessage(err, "Search unavailable"), "error");
    }
  }

  async function refreshLists() {
    try {
      const [dm, rooms] = await Promise.all([ChatAPI.getDmInbox(), ChatAPI.getRooms()]);
      setDmList(dm.items);
      setRoomList(rooms.items);
    } catch (err) {
      toast(getErrorMessage(err, "Failed to refresh"), "error");
    }
  }

  function roomInfo(): RoomInboxEntry | null {
    const a = activeRef.current;
    if (!a || a.kind !== "room") return null;
    return roomList.find((r) => r.roomId === a.id) ?? null;
  }

  async function logout() {
    try {
      await ChatAPI.logout();
    } finally {
      window.location.href = "/auth";
    }
  }

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------
  const dmUnread = dmList.reduce((s, e) => s + e.unreadCount, 0);
  const roomUnread = roomList.reduce((s, r) => s + r.unreadCount, 0);

  if (loadError) {
    return (
      <div className="app">
        <div className="empty-thread" style={{ height: "100dvh" }}>
          <AppAvatar name="ChatHubby" size={96} square />
          <p>{loadError}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app">
        <div className="empty-thread" style={{ height: "100dvh" }}>
          <AppAvatar name="ChatHubby" size={96} square />
          <p>Loading your conversations…</p>
        </div>
      </div>
    );
  }

  const navItem = (t: Tab, label: string, Icon: React.ReactNode, unread: number) => (
    <button className={`nav-item ${tab === t ? "on" : ""}`} onClick={() => setTab(t)} aria-label={label} title={label}>
      {Icon}
      {unread > 0 && <span className="nab">{unread > 9 ? "9+" : unread}</span>}
      <span>{label}</span>
    </button>
  );

  const ctx = {
    user,
    tab,
    active,
    dmList,
    roomList,
    dmUnread,
    roomUnread,
    msgs,
    roomMembers,
    q,
    results,
    listLoading,
    mStack,
    toasts,
    setTab,
    setQ,
    search,
    openConv,
    closeConv,
    refreshLists,
    openModal,
    popModal,
    clearModals,
    toast,
    sendMessage,
    editMessage,
    deleteMessage,
    markRead,
    inviteRows: (list: Invitation[]) => list,
    joinRequests: (roomId: string) => ChatAPI.getJoinRequests(roomId),
    joinLinks: () => ChatAPI.myJoinLinks(),
    createLink: (roomId: string) => ChatAPI.createJoinLink(roomId),
    deactivateLink: (roomId: string, linkId: string) => ChatAPI.deactivateJoinLink(roomId, linkId),
    roomInfo,
  };

  return (
    <ShellContext.Provider value={ctx}>
      <div className={`app ${active ? "thread-open" : ""}`}>
        <div className="shell">
          {/* Rail */}
          <aside className="rail">
            <div className="logo">
              <AppAvatar name="ChatHubby" size={38} square />
            </div>
            <div className="nav">
              {navItem("dm", "Chat", <ChatIcon />, dmUnread)}
              {navItem("room", "Rooms", <UsersIcon />, roomUnread)}
              {navItem("search", "Search", <SearchIcon />, 0)}
            </div>
            <div className="me">
              <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
                {theme === "dark" ? <SunIcon /> : <MoonIcon />}
              </button>
              <button className="icon-btn" onClick={() => setFmenu((f) => !f)} aria-label="Profile menu" title="Profile">
                <AppAvatar name={user.displayname ?? user.username} src={user.avatar} size={34} />
              </button>
              {fmenu && (
                <div className="fmenu" style={{ left: 68, bottom: 12 }} onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => {
                      setFmenu(false);
                      openModal("profile");
                    }}
                  >
                    <UserIcon /> Profile
                  </button>
                  <button
                    onClick={() => {
                      setFmenu(false);
                      openModal("account");
                    }}
                  >
                    <GearIcon /> Account
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      setFmenu(false);
                      void logout();
                    }}
                  >
                    <LogoutIcon /> Sign out
                  </button>
                </div>
              )}
            </div>
          </aside>

          {/* List column */}
          <section className="list">
            <ListPanel />
          </section>

          {/* Thread column */}
          <aside className="thread">
            <ThreadPanel />
          </aside>
        </div>

        {/* Mobile bottom nav */}
        <nav className="bottomnav">
          <div className="bn-row">
            <button className={`bn-item ${tab === "dm" ? "on" : ""}`} onClick={() => setTab("dm")}>
              <ChatIcon />
              {dmUnread > 0 && <span className="nab">{dmUnread > 9 ? "9+" : dmUnread}</span>}
              Chat
            </button>
            <button className={`bn-item ${tab === "room" ? "on" : ""}`} onClick={() => setTab("room")}>
              <UsersIcon />
              {roomUnread > 0 && <span className="nab">{roomUnread > 9 ? "9+" : roomUnread}</span>}
              Rooms
            </button>
            <button className={`bn-item ${tab === "search" ? "on" : ""}`} onClick={() => setTab("search")}>
              <SearchIcon />
              Search
            </button>
            <button className={`bn-item ${tab === "settings" ? "on" : ""}`} onClick={() => setTab("settings")}>
              <GearIcon />
              Settings
            </button>
          </div>
        </nav>

        <Modals />
        <Toasts />
      </div>
    </ShellContext.Provider>
  );
}
