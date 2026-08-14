"use client";

// Main messenger shell: owns all conversation state, wires the socket events,
// and composes the rail / list / thread columns plus the modal + toast systems.
import { useEffect, useRef, useState } from "react";
import { socket } from "../../app/lib/socket";
import { getErrorMessage } from "../../app/lib/errors";
import { loadInitialState } from "../../app/lib/initialLoad";
import { ChatAPI, RoomSocket } from "./api";
import {
  ShellContext,
  convKey,
  type ActiveConv,
  type ModalEntry,
  type ToastItem,
} from "./state";
import type {
  AppUser,
  DMInboxEntry,
  Invitation,
  Message,
  ReadReceipt,
  RoomInboxEntry,
  RoomMember,
  SearchUser,
  Tab,
  ToastType,
  TypingUser,
} from "./types";
import AppAvatar from "./AppAvatar";
import ListPanel from "./ListPanel";
import ThreadPanel from "./ThreadPanel";
import Modals from "./Modals";
import { Toasts } from "./Toasts";
import {
  ChatIcon,
  UsersIcon,
  SearchIcon,
  GearIcon,
  LogoutIcon,
  SunIcon,
  MoonIcon,
  UserIcon,
} from "./icons";
import { useTheme } from "../../app/lib/useTheme";
import { btnPrimary, iconBtn } from "./styles";

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
  const [roomMembers, setRoomMembers] = useState<Record<string, RoomMember[]>>(
    {},
  );
  const [readReceipts, setReadReceipts] = useState<
    Record<string, ReadReceipt[]>
  >({});
  const [typing, setTyping] = useState<Record<string, TypingUser[]>>({});
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
  const readReceiptsRef = useRef<Record<string, ReadReceipt[]>>({});
  const typingRef = useRef<Record<string, TypingUser[]>>({});
  // conversation key -> userId -> pending "stopped typing" removal timer.
  const typingTimersRef = useRef<Record<string, Record<string, number>>>({});
  // Track whether we pushed a synthetic history entry for the mobile thread
  // view so that the hardware back button can close it.
  const threadHistoryRef = useRef(false);

  function setMsgsBoth(
    fn: (prev: Record<string, Message[]>) => Record<string, Message[]>,
  ) {
    msgsRef.current = fn(msgsRef.current);
    setMsgs(msgsRef.current);
  }
  function setRoomMembersBoth(
    fn: (prev: Record<string, RoomMember[]>) => Record<string, RoomMember[]>,
  ) {
    roomMembersRef.current = fn(roomMembersRef.current);
    setRoomMembers(roomMembersRef.current);
  }
  function setReadReceiptsBoth(
    fn: (prev: Record<string, ReadReceipt[]>) => Record<string, ReadReceipt[]>,
  ) {
    readReceiptsRef.current = fn(readReceiptsRef.current);
    setReadReceipts(readReceiptsRef.current);
  }
  function setTypingBoth(
    fn: (prev: Record<string, TypingUser[]>) => Record<string, TypingUser[]>,
  ) {
    typingRef.current = fn(typingRef.current);
    setTyping(typingRef.current);
  }

  // ---------------------------------------------------------------------------
  // Toasts & modals
  // ---------------------------------------------------------------------------
  const toast = (text: string, type: ToastType = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      4000,
    );
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
    const live =
      <A extends unknown[]>(fn: (...args: A) => void) =>
      (...args: A) => {
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
        displayName: userRef.current!.displayName,
        avatar: userRef.current!.avatar,
      });
      if (c.kind === "dm") {
        const u = mine
          ? me()
          : c.otherUser
            ? {
                id: c.otherUser.id,
                username: c.otherUser.username ?? "unknown",
                displayName: c.otherUser.displayName ?? null,
                avatar: c.otherUser.avatar ?? null,
              }
            : {
                id: msg.senderId ?? "",
                username: "unknown",
                displayName: null,
                avatar: null,
              };
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
        : (sender ?? {
            id: msg.senderId ?? "",
            username: msg.senderId?.slice(0, 8) ?? "member",
            displayName: null,
            avatar: null,
          });
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
          {
            ...entry,
            lastMessage: lastStub(msg),
            unreadCount: mine ? entry.unreadCount : entry.unreadCount + 1,
          },
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
          {
            ...entry,
            lastMessage: lastStub(msg),
            unreadCount: mine ? entry.unreadCount : entry.unreadCount + 1,
          },
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
      const mine =
        last.senderId != null
          ? last.senderId === userRef.current?.id
          : last.User?.id === userRef.current?.id;
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
        setMsgsBoth((prev) => ({
          ...prev,
          [`dm:${a.id}`]: upsert(prev[`dm:${a.id}`] ?? [], norm),
        }));
        bumpDmList(a.id, norm, mine);
        if (!mine) markReadNow();
      } else if (a.kind === "room" && msg.chatRoomId === a.id) {
        const norm = normalize(a, msg, mine);
        setMsgsBoth((prev) => ({
          ...prev,
          [`room:${a.id}`]: upsert(prev[`room:${a.id}`] ?? [], norm),
        }));
        bumpRoomList(a.id, norm, mine);
        if (!mine) markReadNow();
      }
    }

    function onEdited(patch: {
      messageId: string;
      content: string | null;
      editedAt: string;
    }) {
      const a = activeRef.current;
      if (!a) return;
      const key = `${a.kind}:${a.id}`;
      setMsgsBoth((prev) => ({
        ...prev,
        [key]: (prev[key] ?? []).map((m) =>
          m.id === patch.messageId
            ? { ...m, content: patch.content, editedAt: patch.editedAt }
            : m,
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
          m.id === patch.messageId
            ? {
                ...m,
                isDeleted: true,
                deletedAt: patch.deletedAt,
                // Mirror the server's placeholder so client state matches a refetch.
                content: "deleted",
              }
            : m,
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

    socket.on(
      "directChat:read",
      ({
        directChatId,
        unreadCount,
      }: {
        directChatId: string;
        unreadCount: number;
      }) => {
        setDmList((prev) =>
          prev.map((e) =>
            e.directChatId === directChatId ? { ...e, unreadCount } : e,
          ),
        );
      },
    );

    socket.on(
      "chatroom:read",
      ({
        chatRoomId,
        unreadCount,
      }: {
        chatRoomId: string;
        unreadCount: number;
      }) => {
        setRoomList((prev) =>
          prev.map((r) =>
            r.roomId === chatRoomId ? { ...r, unreadCount } : r,
          ),
        );
      },
    );

    // Socket.IO serializes Date payloads as ISO strings, so normalize either
    // shape before storing.
    const toIso = (v: Date | string): string =>
      typeof v === "string" ? v : v.toISOString();

    function upsertReceipt(
      map: Record<string, ReadReceipt[]>,
      key: string,
      receipt: ReadReceipt,
    ): Record<string, ReadReceipt[]> {
      const list = map[key] ?? [];
      const idx = list.findIndex((r) => r.userId === receipt.userId);
      const next =
        idx >= 0
          ? list.map((r) => (r.userId === receipt.userId ? receipt : r))
          : [...list, receipt];
      return { ...map, [key]: next };
    }

    socket.on(
      "directChat:readReceipt",
      (payload: {
        userId: string;
        directChatId: string;
        lastReadMessageId: string;
        lastReadMessageCreatedAt: Date | string;
      }) => {
        if (payload.userId === userRef.current?.id) return;
        setReadReceiptsBoth((prev) =>
          upsertReceipt(prev, `dm:${payload.directChatId}`, {
            userId: payload.userId,
            lastReadMessageId: payload.lastReadMessageId,
            lastReadMessageCreatedAt: toIso(payload.lastReadMessageCreatedAt),
          }),
        );
      },
    );

    socket.on(
      "chatroom:readReceipt",
      (payload: {
        userId: string;
        chatRoomId: string;
        lastReadMessageId: string;
        lastReadMessageCreatedAt: Date | string;
      }) => {
        if (payload.userId === userRef.current?.id) return;
        setReadReceiptsBoth((prev) =>
          upsertReceipt(prev, `room:${payload.chatRoomId}`, {
            userId: payload.userId,
            lastReadMessageId: payload.lastReadMessageId,
            lastReadMessageCreatedAt: toIso(payload.lastReadMessageCreatedAt),
          }),
        );
      },
    );

    function clearTypingTimer(key: string, userId: string) {
      const byUser = typingTimersRef.current[key];
      if (!byUser?.[userId]) return;
      window.clearTimeout(byUser[userId]);
      delete byUser[userId];
    }

    function removeTyper(key: string, userId: string) {
      clearTypingTimer(key, userId);
      setTypingBoth((prev) => ({
        ...prev,
        [key]: (prev[key] ?? []).filter((t) => t.userId !== userId),
      }));
    }

    // Shared handler for DM and room typing events. A 3s safety timer drops
    // the indicator if the final "stopped" event is ever lost in transit.
    function onTyping(payload: {
      userId: string;
      username: string;
      directChatId?: string;
      chatRoomId?: string;
      isTyping: boolean;
    }) {
      if (payload.userId === userRef.current?.id) return;
      const isDm = payload.directChatId != null;
      const id = isDm ? payload.directChatId! : payload.chatRoomId!;
      const key = convKey(isDm ? "dm" : "room", id);
      if (!payload.isTyping) {
        removeTyper(key, payload.userId);
        return;
      }
      setTypingBoth((prev) => {
        const list = prev[key] ?? [];
        if (list.some((t) => t.userId === payload.userId)) return prev;
        return {
          ...prev,
          [key]: [
            ...list,
            { userId: payload.userId, username: payload.username },
          ],
        };
      });
      const byUser = (typingTimersRef.current[key] ??= {});
      window.clearTimeout(byUser[payload.userId]);
      byUser[payload.userId] = window.setTimeout(
        () => removeTyper(key, payload.userId),
        3000,
      );
    }

    socket.on("directChat:typing", onTyping);
    socket.on("chatroom:typing", onTyping);

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
      socket.off("directChat:readReceipt");
      socket.off("chatroom:readReceipt");
      socket.off("directChat:typing");
      socket.off("chatroom:typing");
      socket.off("connect");
      socket.off("disconnect");
      // Clear pending typing indicators on unmount (app teardown only).
      for (const byUser of Object.values(typingTimersRef.current)) {
        for (const t of Object.values(byUser)) window.clearTimeout(t);
      }
      typingTimersRef.current = {};
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Browser back-button support for mobile thread view
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (
        threadHistoryRef.current &&
        e.state &&
        typeof e.state === "object" &&
        (e.state as { threadOpen?: boolean }).threadOpen === true
      ) {
        closeConv();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (c.kind === "dm")
      socket.emit("directChat:leave", { directChatId: c.id });
    else socket.emit("chatroom:leave", { chatRoomId: c.id });
  }

  function markRead() {
    const a = activeRef.current;
    if (!a) return;
    const key = `${a.kind}:${a.id}`;
    const list = msgsRef.current[key] ?? [];
    const last = list[list.length - 1];
    if (!last || last.pending) return;
    const mine =
      last.senderId != null
        ? last.senderId === userRef.current?.id
        : last.User?.id === userRef.current?.id;
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
      const { messages: list } =
        c.kind === "dm"
          ? await ChatAPI.getDmMessages(c.id)
          : await ChatAPI.getRoomMessages(c.id);
      setMsgsBoth((prev) => ({ ...prev, [key]: list }));
      markRead();
    } catch (err) {
      toast(getErrorMessage(err, "Failed to load messages"), "error");
    }
  }

  function openConv(c: ActiveConv) {
    const prev = activeRef.current;
    const wasActive = prev != null;
    if (prev && !(prev.kind === c.kind && prev.id === c.id)) leaveSocket(prev);
    activeRef.current = c;
    setActive(c);
    setFmenu(false);
    joinSocket(c);
    if (c.kind === "room") {
      ChatAPI.getRoomMembers(c.id)
        .then((members) =>
          setRoomMembersBoth((prev) => ({ ...prev, [c.id]: members })),
        )
        .catch(() => {});
    }
    // Load the current read cursors so per-message read ticks render as soon
    // as the timeline does. Best-effort: a failure just means ticks appear
    // after the next readReceipt event.
    const key = convKey(c.kind, c.id);
    void (
      c.kind === "dm"
        ? ChatAPI.getDmReadReceipt(c.id)
        : ChatAPI.getRoomReadReceipts(c.id)
    )
      .then((receipts) => {
        const list = (
          receipts ? (Array.isArray(receipts) ? receipts : [receipts]) : []
        ).filter((r) => r.userId !== userRef.current?.id);
        setReadReceiptsBoth((prev) => ({ ...prev, [key]: list }));
      })
      .catch(() => {});
    if (!loadedKeysRef.current.has(key)) {
      loadedKeysRef.current.add(key);
      void loadMessages(c);
    } else {
      markRead();
    }
    // Push a synthetic history entry on mobile only when transitioning from
    // the list view (no active conversation) to the thread view. Switching
    // between rooms while already in the thread view does not add entries.
    if (!wasActive && typeof window !== "undefined") {
      const isMobile = window.innerWidth < 768;
      if (isMobile && !threadHistoryRef.current) {
        threadHistoryRef.current = true;
        window.history.pushState({ threadOpen: true }, "");
      }
    }
  }

  function closeConv() {
    const a = activeRef.current;
    if (a) leaveSocket(a);
    activeRef.current = null;
    setActive(null);
    threadHistoryRef.current = false;
  }

  function navigateBack() {
    if (threadHistoryRef.current) {
      threadHistoryRef.current = false;
      window.history.back();
    } else {
      closeConv();
    }
  }

  // ---------------------------------------------------------------------------
  // Messaging
  // ---------------------------------------------------------------------------
  async function sendMessage(content: string, files: File[]): Promise<void> {
    const a = activeRef.current;
    if (!a) return;
    const me = userRef.current!;
    const key = convKey(a.kind, a.id);

    // Optimistic bubble: render immediately with a pending marker, then swap
    // in the server's canonical message on success (or mark failed).
    const tempId = `temp-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const temp: Message = {
      id: tempId,
      content: content.trim() || null,
      messageType: "TEXT",
      createdAt: new Date().toISOString(),
      isDeleted: false,
      attachments: [],
      pending: true,
      User: {
        id: me.id,
        username: me.username,
        displayName: me.displayName,
        avatar: me.avatar,
      },
      ...(a.kind === "room" ? { chatRoomId: a.id, senderId: me.id } : {}),
    };
    setMsgsBoth((prev) => ({
      ...prev,
      [key]: [...(prev[key] ?? []), temp],
    }));

    try {
      let msg: Message | null = null;
      if (files.length) {
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));
        const { attachmentIds, messageType } = await ChatAPI.upload(
          a.kind,
          a.id,
          dt.files,
        );
        if (a.kind === "dm") {
          msg = await ChatAPI.sendDmMessage(a.id, {
            content: content || undefined,
            messageType,
            attachmentIds,
          });
        } else {
          const res = await RoomSocket.send(a.id, {
            content: content || undefined,
            messageType,
            attachmentIds,
          });
          msg = res.message ?? null;
        }
      } else {
        if (a.kind === "dm") {
          msg = await ChatAPI.sendDmMessage(a.id, {
            content,
            messageType: "TEXT",
          });
        } else {
          const res = await RoomSocket.send(a.id, {
            content,
            messageType: "TEXT",
          });
          msg = res.message ?? null;
        }
      }
      if (msg) {
        // Drop the optimistic bubble and upsert the real message (the socket
        // echo may have already delivered it).
        const norm = {
          ...msg,
          User: {
            id: me.id,
            username: me.username,
            displayName: me.displayName,
            avatar: me.avatar,
          },
        };
        setMsgsBoth((prev) => {
          const list = (prev[key] ?? []).filter((m) => m.id !== tempId);
          const idx = list.findIndex((m) => m.id === msg.id);
          const next =
            idx >= 0
              ? list.map((m) => (m.id === msg.id ? norm : m))
              : [...list, norm];
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
            return [
              { ...entry, lastMessage: stub },
              ...prev.filter((e) => e.directChatId !== a.id),
            ];
          });
        } else {
          setRoomList((prev) => {
            const entry = prev.find((r) => r.roomId === a.id);
            if (!entry) return prev;
            return [
              { ...entry, lastMessage: stub },
              ...prev.filter((r) => r.roomId !== a.id),
            ];
          });
        }
      }
    } catch (err) {
      // Keep the bubble so the user can see the failure and dismiss it.
      setMsgsBoth((prev) => ({
        ...prev,
        [key]: (prev[key] ?? []).map((m) =>
          m.id === tempId ? { ...m, pending: false, failed: true } : m,
        ),
      }));
      toast(getErrorMessage(err, "Failed to send message"), "error");
      throw err;
    }
  }

  /** Drop a client-only (pending/failed) message from the timeline. */
  function removeLocalMessage(messageId: string) {
    const a = activeRef.current;
    if (!a) return;
    const key = convKey(a.kind, a.id);
    setMsgsBoth((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).filter((m) => m.id !== messageId),
    }));
  }

  async function editMessage(
    messageId: string,
    content: string,
  ): Promise<void> {
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
      const [dm, rooms] = await Promise.all([
        ChatAPI.getDmInbox(),
        ChatAPI.getRooms(),
      ]);
      setDmList(dm.items);
      setRoomList(rooms.items);
    } catch (err) {
      toast(getErrorMessage(err, "Failed to refresh"), "error");
    }
  }

  async function refreshUser() {
    try {
      const me = await ChatAPI.getMe();
      userRef.current = me;
      setUser(me);
    } catch {
      // best-effort: keep showing the cached user
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
      <div className="app h-full overflow-hidden bg-bg font-body text-fg antialiased">
        <div className="flex h-dvh flex-col items-center justify-center p-[30px] text-center text-[14.5px] text-muted">
          <AppAvatar
            name="ChatHubby"
            src="/chathubby-v2.webp"
            size={96}
            square
          />
          <p className="mt-4">{loadError}</p>
          <button
            className={`${btnPrimary} mt-4`}
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app h-full overflow-hidden bg-bg font-body text-fg antialiased">
        <div className="flex h-dvh flex-col items-center justify-center p-[30px] text-center text-[14.5px] text-muted">
          <AppAvatar
            name="ChatHubby"
            src="/chathubby-v2.webp"
            size={96}
            square
          />
          <p className="mt-4">Loading your conversations…</p>
        </div>
      </div>
    );
  }

  const navItem = (
    t: Tab,
    label: string,
    Icon: React.ReactNode,
    unread: number,
  ) => (
    <button
      className={`nav-item relative flex cursor-pointer flex-col items-center gap-[3px] rounded-[14px] py-[9px] text-[10px] font-extrabold tracking-[0.02em] text-muted transition-colors duration-150 ease-app hover:bg-surface-2 hover:text-fg ${tab === t ? "bg-accent-soft text-accent-solid" : ""}`}
      onClick={() => setTab(t)}
      aria-label={label}
      title={label}
    >
      {Icon}
      {unread > 0 && (
        <span className="nab absolute right-[calc(50%-20px)] top-[3px] inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-extrabold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
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
    readReceipts,
    typing,
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
    navigateBack,
    refreshLists,
    refreshUser,
    openModal,
    popModal,
    clearModals,
    toast,
    sendMessage,
    editMessage,
    deleteMessage,
    removeLocalMessage,
    markRead,
    inviteRows: (list: Invitation[]) => list,
    joinRequests: (roomId: string) => ChatAPI.getJoinRequests(roomId),
    joinLinks: () => ChatAPI.myJoinLinks(),
    createLink: (roomId: string) => ChatAPI.createJoinLink(roomId),
    deactivateLink: (roomId: string, linkId: string) =>
      ChatAPI.deactivateJoinLink(roomId, linkId),
    roomInfo,
  };

  return (
    <ShellContext.Provider value={ctx}>
      <div
        data-thread-open={active ? "" : undefined}
        className="app group h-full overflow-hidden bg-bg font-body text-fg antialiased"
      >
        <div className="shell grid h-dvh grid-cols-[76px_330px_1fr] max-md:grid-cols-1">
          {/* Rail */}
          <aside className="rail flex flex-col items-center border-r border-border bg-surface px-0 py-4 pb-3 max-md:hidden">
            <div className="logo flex items-center justify-center">
              <AppAvatar
                name="ChatHubby"
                src="/chathubby-v2.webp"
                size={38}
                square
              />
            </div>
            <div className="nav flex w-full flex-1 flex-col gap-2 px-2.5 py-[22px]">
              {navItem(
                "dm",
                "Chat",
                <ChatIcon className="h-[21px] w-[21px]" />,
                dmUnread,
              )}
              {navItem(
                "room",
                "Rooms",
                <UsersIcon className="h-[21px] w-[21px]" />,
                roomUnread,
              )}
              {navItem(
                "search",
                "Search",
                <SearchIcon className="h-[21px] w-[21px]" />,
                0,
              )}
              {navItem(
                "settings",
                "Settings",
                <GearIcon className="h-[21px] w-[21px]" />,
                0,
              )}
            </div>
            <div className="me flex flex-col items-center gap-1.5">
              <button
                className={`${iconBtn} h-[34px] w-[34px] hover:bg-surface-2 hover:text-danger`}
                onClick={toggleTheme}
                aria-label="Toggle theme"
                title="Toggle theme"
              >
                {theme === "dark" ? <SunIcon /> : <MoonIcon />}
              </button>
              <button
                className={`${iconBtn} h-[34px] w-[34px]`}
                onClick={() => setFmenu((f) => !f)}
                aria-label="Profile menu"
                title="Profile"
              >
                <AppAvatar
                  name={user.displayName ?? user.username}
                  src={user.avatar}
                  size={34}
                />
              </button>
              {fmenu && (
                <div
                  className="fmenu fixed z-[90] min-w-[190px] rounded-[14px] border border-border bg-surface p-1.5 shadow-lg animate-[pop_.13s_cubic-bezier(.2,.8,.2,1)]"
                  style={{ left: 68, bottom: 12 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="flex w-full cursor-pointer items-center gap-[11px] rounded-[9px] px-3 py-2.5 text-left text-[13.5px] font-extrabold text-fg transition-colors duration-150 ease-app hover:bg-surface-2"
                    onClick={() => {
                      setFmenu(false);
                      openModal("profile");
                    }}
                  >
                    <UserIcon className="h-4 w-4 flex-none" /> Profile
                  </button>
                  <button
                    className="flex w-full cursor-pointer items-center gap-[11px] rounded-[9px] px-3 py-2.5 text-left text-[13.5px] font-extrabold text-fg transition-colors duration-150 ease-app hover:bg-surface-2"
                    onClick={() => {
                      setFmenu(false);
                      openModal("account");
                    }}
                  >
                    <GearIcon className="h-4 w-4 flex-none" /> Account
                  </button>
                  <button
                    className="flex w-full cursor-pointer items-center gap-[11px] rounded-[9px] px-3 py-2.5 text-left text-[13.5px] font-extrabold text-danger transition-colors duration-150 ease-app hover:bg-surface-2"
                    onClick={() => {
                      setFmenu(false);
                      void logout();
                    }}
                  >
                    <LogoutIcon className="h-4 w-4 flex-none" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </aside>

          {/* List column */}
          <section className="list flex min-w-0 flex-col border-r border-border bg-surface max-md:pb-[70px] max-md:group-data-[thread-open]:hidden">
            <ListPanel />
          </section>

          {/* Thread column: slides in as a full-screen sheet on mobile. */}
          <aside
            className={`thread flex min-h-0 min-w-0 flex-col bg-bg max-md:fixed max-md:inset-0 max-md:z-30 max-md:translate-x-full max-md:transition-transform max-md:duration-[260ms] max-md:ease-app ${active ? "max-md:group-data-[thread-open]:translate-x-0" : ""}`}
          >
            <ThreadPanel />
          </aside>
        </div>

        {/* Mobile bottom nav */}
        <nav className="bottomnav fixed inset-x-0 bottom-0 z-20 hidden border-t border-border bg-surface px-2 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5 max-md:block">
          <div className="bn-row grid grid-cols-4 gap-1.5">
            <button
              className={`bn-item relative flex cursor-pointer flex-col items-center gap-[3px] rounded-[12px] py-[7px] text-[10.5px] font-extrabold text-muted transition-colors duration-150 ease-app ${tab === "dm" ? "bg-accent-soft text-accent-solid" : ""}`}
              onClick={() => {
                setTab("dm");
                if (typeof window !== "undefined" && window.innerWidth < 768) {
                  navigateBack();
                }
              }}
            >
              <ChatIcon className="h-[21px] w-[21px]" />
              {dmUnread > 0 && (
                <span className="nab absolute right-[calc(50%-18px)] top-0 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-extrabold text-white">
                  {dmUnread > 9 ? "9+" : dmUnread}
                </span>
              )}
              Chat
            </button>
            <button
              className={`bn-item relative flex cursor-pointer flex-col items-center gap-[3px] rounded-[12px] py-[7px] text-[10.5px] font-extrabold text-muted transition-colors duration-150 ease-app ${tab === "room" ? "bg-accent-soft text-accent-solid" : ""}`}
              onClick={() => {
                setTab("room");
                if (typeof window !== "undefined" && window.innerWidth < 768) {
                  navigateBack();
                }
              }}
            >
              <UsersIcon className="h-[21px] w-[21px]" />
              {roomUnread > 0 && (
                <span className="nab absolute right-[calc(50%-18px)] top-0 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-extrabold text-white">
                  {roomUnread > 9 ? "9+" : roomUnread}
                </span>
              )}
              Rooms
            </button>
            <button
              className={`bn-item relative flex cursor-pointer flex-col items-center gap-[3px] rounded-[12px] py-[7px] text-[10.5px] font-extrabold text-muted transition-colors duration-150 ease-app ${tab === "search" ? "bg-accent-soft text-accent-solid" : ""}`}
              onClick={() => {
                setTab("search");
                if (typeof window !== "undefined" && window.innerWidth < 768) {
                  navigateBack();
                }
              }}
            >
              <SearchIcon className="h-[21px] w-[21px]" />
              Search
            </button>
            <button
              className={`bn-item relative flex cursor-pointer flex-col items-center gap-[3px] rounded-[12px] py-[7px] text-[10.5px] font-extrabold text-muted transition-colors duration-150 ease-app ${tab === "settings" ? "bg-accent-soft text-accent-solid" : ""}`}
              onClick={() => {
                setTab("settings");
                if (typeof window !== "undefined" && window.innerWidth < 768) {
                  navigateBack();
                }
              }}
            >
              <GearIcon className="h-[21px] w-[21px]" />
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
