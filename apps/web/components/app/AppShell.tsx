"use client";

// Main messenger shell: owns all conversation state, wires the socket events,
// and composes the rail / list / thread columns plus the modal + toast systems.
import { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../../app/lib/socket";
import { getErrorMessage } from "../../app/lib/errors";
import { loadInitialState } from "../../app/lib/initialLoad";
import { mergePresence } from "./helpers";
import { ChatAPI, CallAPI, RoomSocket } from "./api";
import { uploadVoiceAttachment } from "../../app/lib/attachments";
import {
  ShellContext,
  convKey,
  channelKey,
  type ActiveConv,
  type ModalEntry,
  type ToastItem,
} from "./state";
import { useCallStore } from "./callStore";
import type {
  AppUser,
  BlockedUser,
  Category,
  Channel,
  ChannelUnreadState,
  DMInboxEntry,
  FriendRequest,
  Invitation,
  Message,
  PresenceInfo,
  ReadReceipt,
  RoomBan,
  RoomDetail,
  RoomInboxEntry,
  RoomMember,
  SearchUser,
  Tab,
  ToastType,
  TypingUser,
  RoomRole,
} from "./types";
import type { Relationship } from "@repo/validators";
import AppAvatar from "./AppAvatar";
import ListPanel from "./ListPanel";
import ThreadPanel from "./ThreadPanel";
import RoomShell from "./room/RoomShell";
import { parseConvParam as parseConvParamHelper } from "./room/sidebarReorder";
import Modals from "./Modals";
import { Toasts } from "./Toasts";
import CallProvider from "./CallProvider";
import FloatingCallWidget from "./room/FloatingCallWidget";
import IncomingCallModal from "./IncomingCallModal";
import CallingOverlay from "./CallingOverlay";
import { ReconnectBanner } from "./ReconnectBanner";
import {
  ChatIcon,
  UsersIcon,
  SearchIcon,
  GearIcon,
  LogoutIcon,
  SunIcon,
  MoonIcon,
  UserIcon,
  SmileyIcon,
} from "./icons";
import { useTheme } from "../../app/lib/useTheme";
import {
  handleIncomingMessageNotification,
  handleIncomingFriendRequestNotification,
  setNotificationUserId,
  type NotificationSource,
} from "./incomingNotifications";
import {
  ensureNotificationsInitialized,
  setActiveConversation,
  clearActiveConversation,
} from "./notifications";
import { btnPrimary, iconBtn } from "./styles";

/** Pure API wrappers — hoisted to module level so they never trigger ctx ref changes. */
const inviteRows = (list: Invitation[]) => list;
const joinRequests = (roomId: string) => ChatAPI.getJoinRequests(roomId);
const joinLinks = () => ChatAPI.myJoinLinks();
const createLink = (roomId: string) => ChatAPI.createJoinLink(roomId);
const deactivateLink = (roomId: string, linkId: string) =>
  ChatAPI.deactivateJoinLink(roomId, linkId);

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
  roomId?: string;
  channelId?: string;
  attachments?: Message["attachments"];
  metadata?: Message["metadata"];
};

/**
 * Merge a rooms-list's per-channel unread counts into the global map without
 * overwriting fresher state already set by realtime events (Phase 6 §10.1).
 * Kept pure/module-level so it can be referenced from the once-registered
 * socket effect without tripping exhaustive-deps.
 */
function mergeChannelUnreads(
  prev: Record<string, ChannelUnreadState>,
  rooms: RoomInboxEntry[],
): Record<string, ChannelUnreadState> {
  let next = prev;
  for (const room of rooms) {
    for (const [channelId, state] of Object.entries(
      room.channelUnreads ?? {},
    )) {
      const key = channelKey(room.roomId, channelId);
      if (next[key]) continue;
      next = { ...next, [key]: state };
    }
  }
  return next;
}

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
  const [presence, setPresence] = useState<Record<string, PresenceInfo>>({});
  const [roomDetails, setRoomDetails] = useState<Record<string, RoomDetail>>(
    {},
  );
  const [roomBans, setRoomBans] = useState<Record<string, RoomBan[]>>({});
  const [channelUnreads, setChannelUnreads] = useState<
    Record<string, ChannelUnreadState>
  >({});
  const [roomNotificationPrefs, setRoomNotificationPrefs] = useState<
    Record<string, "ALL" | "MENTIONS" | "MUTED">
  >({});
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [mStack, setMStack] = useState<ModalEntry[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [fmenu, setFmenu] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const { theme, toggle: toggleTheme } = useTheme();

  // Refs mirror state so the once-registered socket handlers never see stale closures.
  const activeRef = useRef<ActiveConv | null>(null);
  const userRef = useRef<AppUser | null>(null);
  const joinedRef = useRef<Set<string>>(new Set());
  const loadedKeysRef = useRef<Set<string>>(new Set());
  // Per-channel pagination cursors (channelKey -> nextCursor / has-more flag).
  const channelCursorRef = useRef<Record<string, string | null>>({});
  const channelHasMoreRef = useRef<Record<string, boolean>>({});
  // Per-DM pagination cursors (dmKey -> nextCursor / has-more flag).
  const dmCursorRef = useRef<Record<string, string | null>>({});
  const dmHasMoreRef = useRef<Record<string, boolean>>({});
  const msgsRef = useRef<Record<string, Message[]>>({});
  const roomMembersRef = useRef<Record<string, RoomMember[]>>({});
  const readReceiptsRef = useRef<Record<string, ReadReceipt[]>>({});
  const typingRef = useRef<Record<string, TypingUser[]>>({});
  const presenceRef = useRef<Record<string, PresenceInfo>>({});
  const roomBansRef = useRef<Record<string, RoomBan[]>>({});
  const friendRequestsRef = useRef<FriendRequest[]>([]);
  const channelUnreadsRef = useRef<Record<string, ChannelUnreadState>>({});
  // conversation key -> userId -> pending "stopped typing" removal timer.
  const typingTimersRef = useRef<Record<string, Record<string, number>>>({});
  // Track whether we pushed a synthetic history entry for the mobile thread
  // view so that the hardware back button can close it.
  const threadHistoryRef = useRef(false);
  // Latest deep-link handler for the service worker's navigate messages; the
  // listener is registered once, so it must read through a ref.
  const openConvFromLinkRef = useRef<
    (kind: "dm" | "room", id: string, channelId?: string) => void
  >(() => {});
  // Latest friend-request event applier, shared by the once-registered socket
  // and service-worker handlers (same ref pattern as openConvFromLinkRef).
  const applyFriendRequestEventRef = useRef<
    (
      input: {
        event: "new" | "accepted" | "declined" | "blocked";
        requestId: string;
        fromId: string;
        fromName: string;
        payload?: FriendRequest;
      },
      source: NotificationSource,
    ) => void
  >(() => {});

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
  function setPresenceBoth(
    fn: (prev: Record<string, PresenceInfo>) => Record<string, PresenceInfo>,
  ) {
    presenceRef.current = fn(presenceRef.current);
    setPresence(presenceRef.current);
  }
  function setRoomBansBoth(
    fn: (prev: Record<string, RoomBan[]>) => Record<string, RoomBan[]>,
  ) {
    roomBansRef.current = fn(roomBansRef.current);
    setRoomBans(roomBansRef.current);
  }

  function setChannelUnreadsBoth(
    fn: (
      prev: Record<string, ChannelUnreadState>,
    ) => Record<string, ChannelUnreadState>,
  ) {
    channelUnreadsRef.current = fn(channelUnreadsRef.current);
    setChannelUnreads(channelUnreadsRef.current);
  }

  /** Replace a member row in a room's member list (socket-driven Phase 4). */
  function patchRoomMember(
    roomId: string,
    userId: string,
    patch: Partial<RoomMember>,
  ) {
    setRoomMembersBoth((prev) => ({
      ...prev,
      [roomId]: (prev[roomId] ?? []).map((m) =>
        m.user.id === userId ? { ...m, ...patch } : m,
      ),
    }));
  }
  function setFriendRequestsBoth(
    fn: (prev: FriendRequest[]) => FriendRequest[],
  ) {
    friendRequestsRef.current = fn(friendRequestsRef.current);
    setFriendRequests(friendRequestsRef.current);
  }

  // The timeline cache key for a conversation. Rooms are keyed per channel so
  // each channel's history loads/updates independently (Phase 2).
  function timelineKey(c: ActiveConv): string {
    return c.kind === "room" && c.channelId
      ? channelKey(c.id, c.channelId)
      : convKey(c.kind, c.id);
  }

  // Pick the default channel for a freshly opened room: #general when present
  // (Phase 1 guarantees every room has one), otherwise the first channel.
  function defaultChannelId(detail: RoomDetail): string | undefined {
    const all = [
      ...detail.categories.flatMap((cat) => cat.channels ?? []),
      ...detail.uncategorized,
    ];
    return (all.find((ch) => ch.name.toLowerCase() === "general") ?? all[0])
      ?.id;
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
  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };
  const openModal = (name: ModalEntry["name"], payload?: unknown) =>
    setMStack((prev) => [...prev, { name, payload }]);
  const popModal = () => setMStack((prev) => prev.slice(0, -1));
  const clearModals = () => setMStack([]);

  // ---------------------------------------------------------------------------
  // Friends & blocks
  // ---------------------------------------------------------------------------

  /**
   * Apply a friend-request lifecycle event that targets THIS user. Shared by
   * the socket path (full request payloads) and the service-worker push path
   * (fromId/fromName only). Only touches refs + stable setters + the module
   * notification pipeline, so it is safe to capture in once-registered effects.
   */
  function applyFriendRequestEvent(
    input: {
      event: "new" | "accepted" | "declined" | "blocked";
      requestId: string;
      fromId: string;
      fromName: string;
      payload?: FriendRequest;
    },
    source: NotificationSource = "socket",
  ) {
    const { event, requestId, fromId, fromName, payload } = input;

    if (event === "new") {
      if (payload) {
        setFriendRequestsBoth((prev) =>
          prev.some((r) => r.id === payload.id) ? prev : [payload, ...prev],
        );
      } else {
        // Push path only carries the sender summary — refresh so the inbox
        // card appears even if the socket event was missed.
        void ChatAPI.getFriendRequests()
          .then(({ items }) => setFriendRequestsBoth(() => items))
          .catch(() => {});
      }
      setResults((prev) =>
        prev.map((u) =>
          u.id === fromId ? { ...u, relationship: "REQUEST_RECEIVED" } : u,
        ),
      );
    } else if (event === "accepted") {
      setResults((prev) =>
        prev.map((u) =>
          u.id === fromId ? { ...u, relationship: "FRIENDS" } : u,
        ),
      );
    } else if (event === "declined") {
      setResults((prev) =>
        prev.map((u) => (u.id === fromId ? { ...u, relationship: "NONE" } : u)),
      );
    } else if (event === "blocked") {
      // Drop any pending request card from the blocker.
      setFriendRequestsBoth((prev) =>
        prev.filter((r) => r.sender.id !== fromId && r.recipient.id !== fromId),
      );
      setResults((prev) =>
        prev.map((u) =>
          u.id === fromId ? { ...u, relationship: "BLOCKED" } : u,
        ),
      );
    }

    handleIncomingFriendRequestNotification({
      source,
      event,
      requestId,
      fromId,
      fromName,
    });
  }

  async function refreshFriendRequests() {
    try {
      const { items } = await ChatAPI.getFriendRequests();
      setFriendRequestsBoth(() => items);
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't load friend requests"), "error");
    }
  }

  async function sendFriendRequest(userId: string) {
    try {
      await ChatAPI.sendFriendRequest(userId);
      setResults((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, relationship: "REQUEST_SENT" } : u,
        ),
      );
      toast("Friend request sent", "success");
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't send the request"), "error");
      throw err;
    }
  }

  async function acceptFriendRequest(requestId: string) {
    try {
      const req = await ChatAPI.acceptFriendRequest(requestId);
      setFriendRequestsBoth((prev) => prev.filter((r) => r.id !== requestId));
      setResults((prev) =>
        prev.map((u) =>
          u.id === req.sender.id ? { ...u, relationship: "FRIENDS" } : u,
        ),
      );
      toast(
        `${req.sender.displayName ?? req.sender.username} is now your friend`,
        "success",
      );
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't accept the request"), "error");
      throw err;
    }
  }

  async function declineFriendRequest(requestId: string) {
    try {
      await ChatAPI.declineFriendRequest(requestId);
      setFriendRequestsBoth((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't decline the request"), "error");
      throw err;
    }
  }

  async function withdrawFriendRequest(requestId: string) {
    try {
      await ChatAPI.withdrawFriendRequest(requestId);
      setFriendRequestsBoth((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't cancel the request"), "error");
      throw err;
    }
  }

  async function blockUser(userId: string) {
    try {
      const blocked = await ChatAPI.blockUser(userId);
      setFriendRequestsBoth((prev) =>
        prev.filter((r) => r.sender.id !== userId && r.recipient.id !== userId),
      );
      setBlockedUsers((prev) => [
        blocked,
        ...prev.filter((b) => b.id !== userId),
      ]);
      setResults((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, relationship: "BLOCKED" } : u,
        ),
      );
      toast(`Blocked ${blocked.displayName ?? blocked.username}`, "success");
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't block the user"), "error");
      throw err;
    }
  }

  async function unblockUser(userId: string) {
    try {
      await ChatAPI.unblockUser(userId);
      setBlockedUsers((prev) => prev.filter((b) => b.id !== userId));
      setResults((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, relationship: "NONE" } : u)),
      );
      toast("User unblocked", "success");
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't unblock the user"), "error");
      throw err;
    }
  }

  async function refreshBlockedUsers() {
    try {
      const { items } = await ChatAPI.getBlockedUsers();
      setBlockedUsers(items);
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't load blocked users"), "error");
    }
  }

  function updateRelationship(userId: string, relationship: Relationship) {
    setResults((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, relationship } : u)),
    );
  }

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
        getFriendRequests: () => ChatAPI.getFriendRequests(),
      },
      {
        onUser: live((me) => {
          userRef.current = me;
          setUser(me);
          // Notification-click deep link (?conv=<kind>:<id>) — open the
          // conversation once auth has resolved.
          const target = parseConvParam();
          if (target) {
            if (typeof window !== "undefined") {
              history.replaceState({}, "", "/dashboard");
            }
            openConvFromLinkRef.current(
              target.kind,
              target.id,
              target.channelId,
            );
          }
        }),
        onLists: live((dm, rooms, friendRequests) => {
          setDmList(dm);
          setRoomList(rooms);
          setFriendRequestsBoth(() => friendRequests);
          setChannelUnreadsBoth((prev) => mergeChannelUnreads(prev, rooms));
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
  // Notification pipeline context (current user for self-message rejection)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    setNotificationUserId(user?.id ?? null);
  }, [user?.id]);

  // ---------------------------------------------------------------------------
  // Web Push / service worker (registered once)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    void ensureNotificationsInitialized();

    const onSwMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "chathubby:navigate" && msg.conversationId) {
        const kind: "dm" | "room" = msg.kind === "room" ? "room" : "dm";
        openConvFromLinkRef.current(kind, msg.conversationId);
        return;
      }
      // A friend-request push landed while this client is open: the service
      // worker already showed (or suppressed) the OS notification, so this
      // client only plays the tone and applies the inbox/chip update. The
      // pipeline dedupes by request id against the socket path.
      if (msg.type === "chathubby:incoming-friend-request") {
        const event = msg.event as "new" | "accepted" | "declined" | "blocked";
        applyFriendRequestEventRef.current(
          {
            event,
            requestId: msg.requestId,
            fromId: msg.fromId,
            fromName: msg.fromName ?? "Someone",
          },
          "push",
        );
      }
      // A push landed while this client is open: the service worker already
      // showed (or suppressed) the OS notification, so this client only plays
      // the custom tone. `seenIds` dedupes against the socket path.
      if (msg.type === "chathubby:incoming-message") {
        handleIncomingMessageNotification({
          source: "push",
          kind: msg.kind === "room" ? "room" : "dm",
          conversationId: msg.conversationId,
          messageId: msg.messageId,
          senderId: msg.senderId ?? null,
          senderName: msg.senderName ?? "Someone",
          roomName: msg.roomName ?? null,
          messageType: msg.messageType ?? null,
          content: msg.content ?? null,
        });
      }
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onSwMessage);
    }

    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onSwMessage);
      }
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
          metadata: msg.metadata,
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
        roomId: msg.roomId ?? c.id,
        channelId: msg.channelId,
        attachments: msg.attachments ?? [],
        metadata: msg.metadata,
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
      const key = timelineKey(a);
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
      } else if (a.channelId) {
        // Phase 6: mark the active channel read (not the whole room) and clear
        // its client-side unread state.
        ChatAPI.markChannelRead(a.id, a.channelId, last.id).catch(() => {});
        setChannelUnreadsBoth((prev) => {
          const key = channelKey(a.id, a.channelId!);
          if (!prev[key]) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
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
        if (!mine) {
          // Feed the socket-delivered message into the shared notification
          // pipeline (sound + possible in-page Notification). History loads go
          // through loadMessages(), never this path, and the pipeline dedupes
          // by message id so re-renders or a parallel push can't replay it.
          handleIncomingMessageNotification({
            source: "socket",
            kind: "dm",
            conversationId: a.id,
            messageId: msg.id,
            senderId: msg.senderId,
            senderName:
              norm.User?.displayName ?? norm.User?.username ?? "Someone",
            messageType: msg.messageType,
            content: msg.content,
          });
          markReadNow();
        }
      } else if (a.kind === "room" && msg.roomId === a.id && msg.channelId) {
        const norm = normalize(a, msg, mine);
        const key = channelKey(msg.roomId, msg.channelId);
        // Only append when this channel's timeline is actually loaded — a
        // message for a channel we've never opened must not fabricate one.
        if (loadedKeysRef.current.has(key)) {
          setMsgsBoth((prev) => ({
            ...prev,
            [key]: upsert(prev[key] ?? [], norm),
          }));
        }
        // Per-channel unread state (Phase 6 §10.1): bump the count for every
        // channel the message isn't in. The active channel is read-on-delivery
        // (markReadNow below), so only non-active channels accumulate.
        if (!mine && msg.channelId !== a.channelId) {
          setChannelUnreadsBoth((prev) => {
            const cur = prev[key] ?? { unreadCount: 0, mentionCount: 0 };
            return {
              ...prev,
              [key]: { ...cur, unreadCount: cur.unreadCount + 1 },
            };
          });
        }
        bumpRoomList(a.id, norm, mine);
        if (!mine) {
          handleIncomingMessageNotification({
            source: "socket",
            kind: "room",
            conversationId: a.id,
            messageId: msg.id,
            senderId: msg.senderId,
            senderName:
              norm.User?.displayName ?? norm.User?.username ?? "Someone",
            roomName: a.name,
            messageType: msg.messageType,
            content: msg.content,
          });
          if (msg.channelId === a.channelId) markReadNow();
        }
      }
    }

    function onEdited(patch: {
      messageId: string;
      content: string | null;
      editedAt: string;
    }) {
      const a = activeRef.current;
      if (!a) return;
      if (a.kind === "dm") {
        const key = `dm:${a.id}`;
        setMsgsBoth((prev) => ({
          ...prev,
          [key]: (prev[key] ?? []).map((m) =>
            m.id === patch.messageId
              ? { ...m, content: patch.content, editedAt: patch.editedAt }
              : m,
          ),
        }));
        return;
      }
      // Room edit payloads carry no channelId, so patch every loaded channel
      // timeline of the active room (Phase 2 decision — client-side scan).
      const prefix = `room:${a.id}:`;
      setMsgsBoth((prev) => {
        let changed = false;
        const next: Record<string, Message[]> = { ...prev };
        for (const key of Object.keys(prev)) {
          if (!key.startsWith(prefix)) continue;
          const mapped = (prev[key] ?? []).map((m) =>
            m.id === patch.messageId
              ? { ...m, content: patch.content, editedAt: patch.editedAt }
              : m,
          );
          if (mapped !== prev[key]) {
            next[key] = mapped;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }

    function onDeleted(patch: { messageId: string; deletedAt: string }) {
      const a = activeRef.current;
      if (!a) return;
      const applyDelete = (m: Message): Message =>
        m.id === patch.messageId
          ? {
              ...m,
              isDeleted: true,
              deletedAt: patch.deletedAt,
              // Mirror the server's placeholder so client state matches a refetch.
              content: "deleted",
            }
          : m;
      if (a.kind === "dm") {
        const key = `dm:${a.id}`;
        setMsgsBoth((prev) => ({
          ...prev,
          [key]: (prev[key] ?? []).map(applyDelete),
        }));
        return;
      }
      // Same client-side scan as onEdited: the delete payload has no channelId.
      const prefix = `room:${a.id}:`;
      setMsgsBoth((prev) => {
        let changed = false;
        const next: Record<string, Message[]> = { ...prev };
        for (const key of Object.keys(prev)) {
          if (!key.startsWith(prefix)) continue;
          const mapped = (prev[key] ?? []).map(applyDelete);
          if (mapped !== prev[key]) {
            next[key] = mapped;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
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
      ({ roomId, unreadCount }: { roomId: string; unreadCount: number }) => {
        setRoomList((prev) =>
          prev.map((r) => (r.roomId === roomId ? { ...r, unreadCount } : r)),
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
        roomId: string;
        lastReadMessageId: string;
        lastReadMessageCreatedAt: Date | string;
      }) => {
        if (payload.userId === userRef.current?.id) return;
        setReadReceiptsBoth((prev) =>
          upsertReceipt(prev, `room:${payload.roomId}`, {
            userId: payload.userId,
            lastReadMessageId: payload.lastReadMessageId,
            lastReadMessageCreatedAt: toIso(payload.lastReadMessageCreatedAt),
          }),
        );
      },
    );

    // Phase 6 §10.1: this user's other tabs/devices moved a channel cursor.
    socket.on(
      "channel:read",
      (payload: {
        roomId: string;
        channelId: string;
        unreadCount: number;
        mentionCount: number;
      }) => {
        const key = channelKey(payload.roomId, payload.channelId);
        // Only apply when the channel isn't active here — the active channel's
        // state is cleared locally by markRead() and the cursor syncs via REST.
        const a = activeRef.current;
        if (
          a?.kind === "room" &&
          a.id === payload.roomId &&
          a.channelId === payload.channelId
        )
          return;
        setChannelUnreadsBoth((prev) => ({
          ...prev,
          [key]: {
            unreadCount: payload.unreadCount,
            mentionCount: payload.mentionCount,
          },
        }));
      },
    );

    // Phase 6 §10.1: a message @-mentioned this user. Flip the channel to
    // Mentioned (unless it's already active and being read) and surface a
    // toast so the mention isn't missed while the channel is in the background.
    socket.on(
      "mention:new",
      (payload: {
        messageId: string;
        roomId: string;
        channelId: string;
        channelName: string;
        senderId: string;
        senderName: string;
        content: string | null;
      }) => {
        const a = activeRef.current;
        const activeInChannel =
          a?.kind === "room" &&
          a.id === payload.roomId &&
          a.channelId === payload.channelId;
        if (!activeInChannel) {
          const key = channelKey(payload.roomId, payload.channelId);
          setChannelUnreadsBoth((prev) => {
            const cur = prev[key] ?? { unreadCount: 0, mentionCount: 0 };
            return {
              ...prev,
              [key]: { ...cur, mentionCount: cur.mentionCount + 1 },
            };
          });
        }
        const preview = (payload.content ?? "").slice(0, 80);
        toast(
          `${payload.senderName} mentioned you in #${payload.channelName}: ${preview}`,
        );
      },
    );

    // Channel + category lifecycle (Phase 6 §10.2): keep the sidebar tree live
    // for every member without a refetch. The server is authoritative for
    // permissions; these events just mirror the committed change.
    socket.on(
      "channel:created",
      (payload: { roomId: string; channel: Channel }) => {
        setRoomDetails((prev) => {
          const detail = prev[payload.roomId];
          if (!detail) return prev;
          const categories = detail.categories.map((cat) =>
            cat.id === payload.channel.categoryId
              ? { ...cat, channels: [...(cat.channels ?? []), payload.channel] }
              : cat,
          );
          return { ...prev, [payload.roomId]: { ...detail, categories } };
        });
      },
    );
    socket.on(
      "channel:updated",
      (payload: { roomId: string; channel: Channel }) => {
        setRoomDetails((prev) => {
          const detail = prev[payload.roomId];
          if (!detail) return prev;
          const apply = (c: Channel) =>
            c.id === payload.channel.id ? { ...c, ...payload.channel } : c;
          return {
            ...prev,
            [payload.roomId]: {
              ...detail,
              categories: detail.categories.map((cat) => ({
                ...cat,
                channels: (cat.channels ?? []).map(apply),
              })),
              uncategorized: detail.uncategorized.map(apply),
            },
          };
        });
      },
    );
    socket.on(
      "channel:deleted",
      (payload: { roomId: string; channelId: string }) => {
        setRoomDetails((prev) => {
          const detail = prev[payload.roomId];
          if (!detail) return prev;
          const remove = (c: Channel) => c.id !== payload.channelId;
          return {
            ...prev,
            [payload.roomId]: {
              ...detail,
              categories: detail.categories.map((cat) => ({
                ...cat,
                channels: (cat.channels ?? []).filter(remove),
              })),
              uncategorized: detail.uncategorized.filter(remove),
            },
          };
        });
        setChannelUnreadsBoth((prev) => {
          const key = channelKey(payload.roomId, payload.channelId);
          if (!prev[key]) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
      },
    );
    socket.on(
      "channel:reordered",
      (payload: {
        roomId: string;
        items: { id: string; categoryId: string | null }[];
      }) => {
        // Reorder is applied optimistically by the drag layer already; this
        // event reconciles a remote member's change by re-deriving positions.
        setRoomDetails((prev) => {
          const detail = prev[payload.roomId];
          if (!detail) return prev;
          const positionOf = new Map(
            payload.items.map((item, i) => [item.id, i]),
          );
          const recat = (c: Channel) => {
            const item = payload.items.find((i) => i.id === c.id);
            if (!item) return c;
            return {
              ...c,
              categoryId: item.categoryId,
              position: positionOf.get(c.id) ?? c.position,
            };
          };
          return {
            ...prev,
            [payload.roomId]: {
              ...detail,
              categories: detail.categories.map((cat) => ({
                ...cat,
                channels: (cat.channels ?? []).map(recat),
              })),
              uncategorized: detail.uncategorized.map(recat),
            },
          };
        });
      },
    );
    socket.on(
      "category:created",
      (payload: { roomId: string; category: Category }) => {
        setRoomDetails((prev) => {
          const detail = prev[payload.roomId];
          if (!detail) return prev;
          if (detail.categories.some((c) => c.id === payload.category.id))
            return prev;
          return {
            ...prev,
            [payload.roomId]: {
              ...detail,
              categories: [
                ...detail.categories,
                { ...payload.category, channels: [] },
              ],
            },
          };
        });
      },
    );
    socket.on(
      "category:updated",
      (payload: { roomId: string; category: Category }) => {
        setRoomDetails((prev) => {
          const detail = prev[payload.roomId];
          if (!detail) return prev;
          return {
            ...prev,
            [payload.roomId]: {
              ...detail,
              categories: detail.categories.map((cat) =>
                cat.id === payload.category.id
                  ? { ...cat, ...payload.category }
                  : cat,
              ),
            },
          };
        });
      },
    );
    socket.on(
      "category:deleted",
      (payload: { roomId: string; categoryId: string }) => {
        // The server moved the category's channels to Uncategorized before
        // deleting, so move them client-side to match the committed state.
        setRoomDetails((prev) => {
          const detail = prev[payload.roomId];
          if (!detail) return prev;
          const removed = detail.categories.find(
            (c) => c.id === payload.categoryId,
          );
          if (!removed) return prev;
          return {
            ...prev,
            [payload.roomId]: {
              ...detail,
              categories: detail.categories.filter(
                (c) => c.id !== payload.categoryId,
              ),
              uncategorized: [
                ...(removed.channels ?? []).map((c) => ({
                  ...c,
                  categoryId: null,
                })),
                ...detail.uncategorized,
              ],
            },
          };
        });
      },
    );
    socket.on(
      "category:reordered",
      (payload: { roomId: string; orderedIds: string[] }) => {
        setRoomDetails((prev) => {
          const detail = prev[payload.roomId];
          if (!detail) return prev;
          const positionOf = new Map(
            payload.orderedIds.map((id, i) => [id, i]),
          );
          return {
            ...prev,
            [payload.roomId]: {
              ...detail,
              categories: detail.categories
                .map((cat) => ({
                  ...cat,
                  position: positionOf.get(cat.id) ?? cat.position,
                }))
                .sort((a, b) => a.position - b.position),
            },
          };
        });
      },
    );
    socket.on(
      "room:updated",
      (payload: {
        roomId: string;
        room: {
          id: string;
          name: string;
          description: string | null;
          avatar: string | null;
        };
      }) => {
        setRoomList((prev) =>
          prev.map((r) =>
            r.roomId === payload.roomId
              ? {
                  ...r,
                  name: payload.room.name,
                  description: payload.room.description,
                  avatar: payload.room.avatar ?? r.avatar,
                }
              : r,
          ),
        );
        setRoomDetails((prev) => {
          const detail = prev[payload.roomId];
          if (!detail) return prev;
          return {
            ...prev,
            [payload.roomId]: {
              ...detail,
              name: payload.room.name,
              description: payload.room.description,
              avatar: payload.room.avatar,
            },
          };
        });
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
      roomId?: string;
      isTyping: boolean;
    }) {
      if (payload.userId === userRef.current?.id) return;
      const isDm = payload.directChatId != null;
      const id = isDm ? payload.directChatId! : payload.roomId!;
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

    // Live presence updates: the server broadcasts a gated payload for every
    // change and pushes a snapshot of currently-present users on connect, so
    // we can keep the presence map purely event-driven (no polling).
    function onPresenceChanged(p: PresenceInfo) {
      setPresenceBoth((prev) => mergePresence(prev, p));
    }
    socket.on("presence:changed", onPresenceChanged);

    // Friend-request lifecycle: the server emits to the relevant user's room.
    // The applier dedupes and updates inbox cards + relationship chips; for
    // "new" the full request arrives so the card renders without a refetch.
    socket.on("friend-request:new", (payload) => {
      applyFriendRequestEventRef.current(
        {
          event: "new",
          requestId: payload.id,
          fromId: payload.sender.id,
          fromName: payload.sender.displayName ?? payload.sender.username,
          payload,
        },
        "socket",
      );
    });
    socket.on("friend-request:accepted", (payload) => {
      applyFriendRequestEventRef.current(
        {
          event: "accepted",
          requestId: payload.requestId,
          fromId: payload.friend.id,
          fromName: payload.friend.displayName ?? payload.friend.username,
        },
        "socket",
      );
    });
    socket.on("friend-request:declined", (payload) => {
      applyFriendRequestEventRef.current(
        {
          event: "declined",
          requestId: payload.requestId,
          fromId: payload.userId,
          fromName: payload.userId,
        },
        "socket",
      );
    });
    socket.on("friend-request:blocked", (payload) => {
      applyFriendRequestEventRef.current(
        {
          event: "blocked",
          requestId: payload.blockedBy.id,
          fromId: payload.blockedBy.id,
          fromName: payload.blockedBy.displayName ?? payload.blockedBy.username,
        },
        "socket",
      );
    });

    // Voice channel call events (Phase 7): update the call store's participant
    // list when others join/leave/get kicked from a call in the same room.
    // Events are broadcast room-wide; we update both the active call's flat
    // list and the per-channel map so the sidebar shows live counts everywhere.
    socket.on("call.participant.joined", (payload) => {
      const call = useCallStore.getState();
      const participant = {
        userId: payload.userId,
        username: payload.user.username,
        displayName: payload.user.displayName,
        avatar: payload.user.avatar,
      };

      // Per-channel map: append if not already present.
      call.setParticipantsForChannel(payload.channelId, (prev) => {
        if (prev.some((p) => p.userId === payload.userId)) return prev;
        return [...prev, participant];
      });

      // Active call flat list (kept for widget/CallView).
      if (call.activeChannelId === payload.channelId) {
        if (!call.participants.some((p) => p.userId === payload.userId)) {
          call.setParticipants([...call.participants, participant]);
        }
      }
    });
    socket.on("call.participant.left", (payload) => {
      const call = useCallStore.getState();
      call.setParticipantsForChannel(payload.channelId, (prev) =>
        prev.filter((p) => p.userId !== payload.userId),
      );
      if (call.activeChannelId === payload.channelId) {
        call.setParticipants(
          call.participants.filter((p) => p.userId !== payload.userId),
        );
      }
    });
    socket.on("call.participant.kicked", (payload) => {
      const call = useCallStore.getState();
      if (payload.userId === userRef.current?.id) {
        call.requestEndCall();
        return;
      }
      call.setParticipantsForChannel(payload.channelId, (prev) =>
        prev.filter((p) => p.userId !== payload.userId),
      );
      if (call.activeChannelId === payload.channelId) {
        call.setParticipants(
          call.participants.filter((p) => p.userId !== payload.userId),
        );
      }
    });
    socket.on("call.participant.muted", (payload) => {
      const call = useCallStore.getState();
      call.setParticipantsForChannel(payload.channelId, (prev) =>
        prev.map((p) =>
          p.userId === payload.userId ? { ...p, isMuted: true } : p,
        ),
      );
      if (call.activeChannelId === payload.channelId) {
        call.setParticipants(
          call.participants.map((p) =>
            p.userId === payload.userId ? { ...p, isMuted: true } : p,
          ),
        );
      }
    });
    socket.on("call.ended", (payload) => {
      const call = useCallStore.getState();
      call.setParticipantsForChannel(payload.channelId, []);
      if (call.activeChannelId === payload.channelId) {
        call.requestEndCall();
      }
    });

    // DM call events (Phase 14): handle incoming, accepted, declined, cancelled,
    // connected, ended, and dismiss events for 1:1 voice/video calls.
    socket.on("dmCall:invited", (payload) => {
      const call = useCallStore.getState();
      // Ignore if already in a call (room or DM).
      if (call.activeSessionId) return;
      call.setIncomingCallInfo({
        sessionId: payload.sessionId,
        directChatId: payload.directChatId,
        callType: payload.callType,
        caller: payload.caller,
      });
      call.setDmCallStatus("INCOMING");
    });

    socket.on("dmCall:accepted", (payload) => {
      const call = useCallStore.getState();
      // Only relevant to the caller — callee is joining LiveKit via REST.
      if (
        call.dmCallStatus === "OUTGOING" &&
        call.dmCallSessionId === payload.sessionId
      ) {
        call.setDmCallStatus("ACTIVE");
      }
    });

    socket.on("dmCall:declined", (payload) => {
      const call = useCallStore.getState();
      // If we were the caller, toast the decline and clear.
      if (call.dmCallSessionId === payload.sessionId) {
        call.requestEndCall();
      }
    });

    socket.on("dmCall:cancelled", (payload) => {
      const call = useCallStore.getState();
      // If this user was the callee, dismiss the incoming call overlay.
      if (call.incomingCallInfo?.sessionId === payload.sessionId) {
        call.setIncomingCallInfo(null);
        call.setDmCallStatus("IDLE");
      }
    });

    socket.on("dmCall:connected", (payload) => {
      const call = useCallStore.getState();
      if (call.dmCallSessionId === payload.sessionId) {
        call.setDmCallStatus("ACTIVE");
        call.setDmCallConnectedAt(Date.now());
      }
    });

    socket.on("dmCall:ended", (payload) => {
      const call = useCallStore.getState();
      if (
        call.dmCallSessionId === payload.sessionId ||
        call.activeSessionId === payload.sessionId
      ) {
        call.requestEndCall();
      }
    });

    socket.on("dmCall:dismiss", (payload) => {
      const call = useCallStore.getState();
      // Multi-device sync: dismiss incoming call UI on all devices.
      if (call.incomingCallInfo?.sessionId === payload.sessionId) {
        call.setIncomingCallInfo(null);
        call.setDmCallStatus("IDLE");
      }
    });

    socket.on(
      "dmCall:error",
      (payload: { reason: string; sessionId?: string }) => {
        const call = useCallStore.getState();
        // Clear call UI if the error relates to our active session.
        if (payload.sessionId && payload.sessionId === call.dmCallSessionId) {
          call.requestEndCall();
        }
        toast(payload.reason || "Call failed", "error");
      },
    );

    // Member lifecycle events (Phase 4 §8): keep the sidebar's member list and
    // role chips live. Uses refs + stable setters so the once-registered
    // handlers never read stale closures.
    socket.on(
      "chatroom:member:added",
      (payload: { roomId: string; member: RoomMember }) => {
        setRoomMembersBoth((prev) => {
          const list = prev[payload.roomId] ?? [];
          if (list.some((m) => m.user.id === payload.member.user.id))
            return prev;
          return { ...prev, [payload.roomId]: [...list, payload.member] };
        });
      },
    );
    socket.on(
      "chatroom:member:removed",
      (payload: { roomId: string; userId: string }) => {
        setRoomMembersBoth((prev) => ({
          ...prev,
          [payload.roomId]: (prev[payload.roomId] ?? []).filter(
            (m) => m.user.id !== payload.userId,
          ),
        }));
      },
    );
    socket.on(
      "chatroom:member:roleChanged",
      (payload: { roomId: string; userId: string; role: RoomRole }) => {
        patchRoomMember(payload.roomId, payload.userId, {
          role: payload.role,
        });
      },
    );
    socket.on(
      "chatroom:member:muted",
      (payload: { roomId: string; userId: string; mutedUntil: string }) => {
        patchRoomMember(payload.roomId, payload.userId, {
          mutedUntil: payload.mutedUntil,
        });
      },
    );
    socket.on(
      "chatroom:member:unmuted",
      (payload: { roomId: string; userId: string }) => {
        patchRoomMember(payload.roomId, payload.userId, { mutedUntil: null });
      },
    );
    socket.on(
      "chatroom:member:nicknameChanged",
      (payload: {
        roomId: string;
        userId: string;
        nickname: string | null;
      }) => {
        patchRoomMember(payload.roomId, payload.userId, {
          nickname: payload.nickname,
        });
      },
    );

    // Re-join the active conversation after a reconnect (the server drops rooms).
    socket.on("connect", () => {
      joinedRef.current.clear();
      const a = activeRef.current;
      if (a) joinSocket(a);

      // Resync state that may have changed while disconnected.
      void ChatAPI.getRooms()
        .then(({ items }) => {
          setRoomList(items);
          setChannelUnreadsBoth((prev) => mergeChannelUnreads(prev, items));
        })
        .catch(() => {});

      if (a?.kind === "room") {
        void ChatAPI.getRoomDetail(a.id)
          .then((detail) => {
            setRoomDetails((prev) => ({ ...prev, [a.id]: detail }));
          })
          .catch(() => {});

        // Resync live call presence across all voice channels.
        void CallAPI.getActiveCalls(a.id)
          .then((calls) => {
            const callStore = useCallStore.getState();
            for (const c of calls) {
              callStore.setParticipantsForChannel(c.channelId, (prev) => {
                // Merge: keep existing participants (may have fresher data from
                // socket events), add any new ones from the server snapshot.
                let next = prev;
                for (const p of c.participants) {
                  if (!next.some((x) => x.userId === p.userId)) {
                    next = [...next, p];
                  }
                }
                // Remove participants no longer on the server.
                next = next.filter((x) =>
                  c.participants.some((p) => p.userId === x.userId),
                );
                return next;
              });
            }
          })
          .catch(() => {});
      }
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
      socket.off("channel:read");
      socket.off("mention:new");
      socket.off("channel:created");
      socket.off("channel:updated");
      socket.off("channel:deleted");
      socket.off("channel:reordered");
      socket.off("category:created");
      socket.off("category:updated");
      socket.off("category:deleted");
      socket.off("category:reordered");
      socket.off("room:updated");
      socket.off("directChat:typing");
      socket.off("chatroom:typing");
      socket.off("presence:changed", onPresenceChanged);
      socket.off("friend-request:new");
      socket.off("friend-request:accepted");
      socket.off("friend-request:declined");
      socket.off("friend-request:blocked");
      socket.off("call.participant.joined");
      socket.off("call.participant.left");
      socket.off("call.participant.kicked");
      socket.off("call.participant.muted");
      socket.off("call.ended");
      socket.off("dmCall:invited");
      socket.off("dmCall:accepted");
      socket.off("dmCall:declined");
      socket.off("dmCall:cancelled");
      socket.off("dmCall:connected");
      socket.off("dmCall:ended");
      socket.off("dmCall:dismiss");
      socket.off("dmCall:error");
      socket.off("chatroom:member:added");
      socket.off("chatroom:member:removed");
      socket.off("chatroom:member:roleChanged");
      socket.off("chatroom:member:muted");
      socket.off("chatroom:member:unmuted");
      socket.off("chatroom:member:nicknameChanged");
      socket.off("connect");
      socket.off("disconnect");
      // Clear pending typing indicators on unmount (app teardown only).
      for (const byUser of Object.values(typingTimersRef.current)) {
        for (const t of Object.values(byUser)) window.clearTimeout(t);
      }
      typingTimersRef.current = {};
    };
    // The socket handlers only reference refs and the module-level
    // notification pipeline (handleIncomingMessageNotification), so this
    // effect registers exactly once for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Presence heartbeat
  // ---------------------------------------------------------------------------
  // Tab liveness signal: the server flags a user idle when no heartbeat
  // arrives for 5 minutes. Pausing while the tab is hidden is what makes the
  // idle threshold meaningful, so the interval only runs while visible.
  useEffect(() => {
    const HEARTBEAT_MS = 30_000;
    let timer: ReturnType<typeof setInterval> | null = null;
    const beat = () => socket.emit("presence:heartbeat");
    const start = () => {
      if (timer) return;
      beat();
      timer = setInterval(beat, HEARTBEAT_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start(); // emit immediately on return so presence flips back fast
    };
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
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
  // ---------------------------------------------------------------------------
  // Deep links (notification clicks): open a conversation by kind + id, or a
  // specific room channel via `?conv=room:<roomId>:<channelId>` (Phase 3).
  // ---------------------------------------------------------------------------
  function parseConvParam(): {
    kind: "dm" | "room";
    id: string;
    channelId?: string;
  } | null {
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("conv");
    const parsed = parseConvParamHelper(raw);
    return parsed;
  }

  async function openDmFromLink(directChatId: string) {
    // The thread header needs the other user's profile; resolve it from the
    // inbox when possible, else open with a minimal placeholder.
    let otherUser: ActiveConv["otherUser"] = { id: directChatId };
    try {
      const inbox = await ChatAPI.getDmInbox();
      const entry = inbox.items.find((e) => e.directChatId === directChatId);
      if (entry) {
        otherUser = {
          id: entry.otherUser.id,
          username: entry.otherUser.username,
          displayName: entry.otherUser.displayName,
          avatar: entry.otherUser.avatar ?? null,
        };
      }
    } catch {
      // best-effort: open with the minimal profile
    }
    openConv({ kind: "dm", id: directChatId, otherUser });
  }

  function openConvFromLink(
    kind: "dm" | "room",
    id: string,
    channelId?: string,
  ) {
    if (kind === "dm") void openDmFromLink(id);
    else openConv({ kind: "room", id, channelId });
  }
  openConvFromLinkRef.current = openConvFromLink;
  applyFriendRequestEventRef.current = applyFriendRequestEvent;

  function joinSocket(c: ActiveConv) {
    const key = `${c.kind}:${c.id}`;
    if (joinedRef.current.has(key)) return;
    joinedRef.current.add(key);
    if (c.kind === "dm") socket.emit("directChat:join", { directChatId: c.id });
    else socket.emit("chatroom:join", { roomId: c.id });
  }

  function leaveSocket(c: ActiveConv) {
    const key = `${c.kind}:${c.id}`;
    if (!joinedRef.current.has(key)) return;
    joinedRef.current.delete(key);
    if (c.kind === "dm")
      socket.emit("directChat:leave", { directChatId: c.id });
    else socket.emit("chatroom:leave", { roomId: c.id });
  }

  function markRead() {
    const a = activeRef.current;
    if (!a) return;
    const key = timelineKey(a);
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
    } else if (a.channelId) {
      // Phase 6: per-channel cursor — entering/reading a channel marks that
      // channel read without clearing the room's other channels.
      ChatAPI.markChannelRead(a.id, a.channelId, last.id).catch(() => {});
      // Viewing a channel clears its per-channel unread state (Phase 6).
      setChannelUnreadsBoth((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  async function loadMessages(c: ActiveConv) {
    const key = timelineKey(c);
    try {
      if (c.kind === "dm") {
        const { messages: list, nextCursor } = await ChatAPI.getDmMessages(
          c.id,
        );
        setMsgsBoth((prev) => ({ ...prev, [key]: list }));
        dmCursorRef.current[key] = nextCursor;
        dmHasMoreRef.current[key] = !!nextCursor;
      } else if (c.channelId) {
        const { messages: list, nextCursor } = await ChatAPI.getChannelMessages(
          c.id,
          c.channelId,
        );
        setMsgsBoth((prev) => ({ ...prev, [key]: list }));
        channelCursorRef.current[key] = nextCursor;
        channelHasMoreRef.current[key] = !!nextCursor;
      }
      markRead();
    } catch (err) {
      toast(getErrorMessage(err, "Failed to load messages"), "error");
    }
  }

  /** Fetch the page of messages before a room channel's oldest loaded one. */
  async function loadOlderMessages(roomId: string, channelId: string) {
    const key = channelKey(roomId, channelId);
    if (!channelHasMoreRef.current[key]) return { hasMore: false };
    const cursor = channelCursorRef.current[key] ?? undefined;
    try {
      const { messages, nextCursor } = await ChatAPI.getChannelMessages(
        roomId,
        channelId,
        { cursor },
      );
      setMsgsBoth((prev) => {
        const existing = prev[key] ?? [];
        const known = new Set(existing.map((m) => m.id));
        const fresh = messages.filter((m) => !known.has(m.id));
        if (fresh.length === 0) return prev;
        return { ...prev, [key]: [...fresh, ...existing] };
      });
      channelCursorRef.current[key] = nextCursor;
      channelHasMoreRef.current[key] = !!nextCursor;
      return { hasMore: !!nextCursor };
    } catch (err) {
      toast(getErrorMessage(err, "Failed to load older messages"), "error");
      return { hasMore: false };
    }
  }

  /** Fetch the page of messages before a DM conversation's oldest loaded one. */
  async function loadOlderDmMessages(directChatId: string) {
    const key = convKey("dm", directChatId);
    if (!dmHasMoreRef.current[key]) return { hasMore: false };
    const cursor = dmCursorRef.current[key] ?? undefined;
    try {
      const { messages, nextCursor } = await ChatAPI.getDmMessages(
        directChatId,
        { cursor },
      );
      setMsgsBoth((prev) => {
        const existing = prev[key] ?? [];
        const known = new Set(existing.map((m) => m.id));
        const fresh = messages.filter((m) => !known.has(m.id));
        if (fresh.length === 0) return prev;
        return { ...prev, [key]: [...fresh, ...existing] };
      });
      dmCursorRef.current[key] = nextCursor;
      dmHasMoreRef.current[key] = !!nextCursor;
      return { hasMore: !!nextCursor };
    } catch (err) {
      toast(getErrorMessage(err, "Failed to load older messages"), "error");
      return { hasMore: false };
    }
  }

  function openConv(c: ActiveConv) {
    const prev = activeRef.current;
    const wasActive = prev != null;
    if (prev && !(prev.kind === c.kind && prev.id === c.id)) leaveSocket(prev);
    if (c.kind === "room") {
      // Rooms are opened at a channel. A deep link may specify one; otherwise
      // (or if it no longer exists) fall back to #general / the first channel.
      void openRoomWithChannel(c, wasActive);
      return;
    }
    activateConv(c, wasActive);
  }

  /** Fetch a room's structure, validate the requested (or default) channel, open. */
  async function openRoomWithChannel(c: ActiveConv, wasActive: boolean) {
    let channelId = c.channelId;
    try {
      const detail = await ChatAPI.getRoomDetail(c.id);
      setRoomDetails((prev) => ({ ...prev, [c.id]: detail }));
      if (!channelId || !channelExists(detail, channelId)) {
        channelId = defaultChannelId(detail);
      }
    } catch (err) {
      toast(getErrorMessage(err, "Failed to load room"), "error");
    }
    activateConv({ ...c, channelId }, wasActive);
  }

  /** Whether a channel id exists anywhere in a room's structure. */
  function channelExists(detail: RoomDetail, channelId: string): boolean {
    for (const cat of detail.categories) {
      if ((cat.channels ?? []).some((ch) => ch.id === channelId)) return true;
    }
    return detail.uncategorized.some((ch) => ch.id === channelId);
  }

  /** Core open path — everything `openConv` used to do synchronously. */
  function activateConv(c: ActiveConv, wasActive: boolean) {
    activeRef.current = c;
    setActive(c);
    setFmenu(false);
    // Tell the service worker what's on screen so it can suppress redundant
    // OS notifications for the active conversation.
    setActiveConversation(c.kind, c.id);
    joinSocket(c);
    if (c.kind === "room") {
      ChatAPI.getRoomMembers(c.id)
        .then((members) =>
          setRoomMembersBoth((prev) => ({ ...prev, [c.id]: members })),
        )
        .catch(() => {});
      // Load this user's room notification pref so the sidebar can suppress
      // unread indicators for muted rooms (Phase 6 §10.1). Best-effort.
      ChatAPI.getRoomMemberNotificationPref(c.id)
        .then(({ notificationPref }) =>
          setRoomNotificationPrefs((prev) => ({
            ...prev,
            [c.id]: notificationPref,
          })),
        )
        .catch(() => {});
    }
    // Load the current read cursors so per-message read ticks render as soon
    // as the timeline does. Best-effort: a failure just means ticks appear
    // after the next readReceipt event. Room cursors are stored at room
    // granularity (matching the chatroom:readReceipt handler) and shared by
    // every channel timeline, so key by room id, not the channel timeline.
    const key = timelineKey(c);
    const receiptsKey = c.kind === "room" ? convKey("room", c.id) : key;
    void (
      c.kind === "dm"
        ? ChatAPI.getDmReadReceipt(c.id)
        : ChatAPI.getRoomReadReceipts(c.id)
    )
      .then((receipts) => {
        const list = (
          receipts ? (Array.isArray(receipts) ? receipts : [receipts]) : []
        ).filter((r) => r.userId !== userRef.current?.id);
        setReadReceiptsBoth((prev) => ({ ...prev, [receiptsKey]: list }));
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

  /** Switch the active room's channel (loads it if not yet loaded). */
  function openChannel(roomId: string, channelId: string) {
    const a = activeRef.current;
    if (!a || a.kind !== "room" || a.id !== roomId) return;
    if (a.channelId === channelId) return;
    const updated: ActiveConv = { ...a, channelId };
    activeRef.current = updated;
    setActive(updated);
    setActiveConversation("room", roomId);
    // Entering a channel clears its per-channel unread state (Phase 6); the
    // markRead() call below syncs the cursor with the server.
    setChannelUnreadsBoth((prev) => {
      const key = channelKey(roomId, channelId);
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    const key = channelKey(roomId, channelId);
    if (!loadedKeysRef.current.has(key)) {
      loadedKeysRef.current.add(key);
      void loadMessages(updated);
    } else {
      markRead();
    }
  }

  /** Remove the current user from a room (owner transfer/delete is Phase 5). */
  async function leaveRoom(roomId: string): Promise<void> {
    await ChatAPI.leaveRoom(roomId);
    // The server also emits chatroom:left to this user's room, but the client
    // updates its own state here so the list drops the room immediately (the
    // socket echo can't be distinguished from the chatroom:leave ack).
    setRoomList((prev) => prev.filter((r) => r.roomId !== roomId));
    const a = activeRef.current;
    if (a && a.kind === "room" && a.id === roomId) {
      leaveSocket(a);
      activeRef.current = null;
      setActive(null);
      clearActiveConversation();
      threadHistoryRef.current = false;
    }
    // Drop the room's cached timelines/cursors so a later re-join refetches.
    const prefix = `room:${roomId}:`;
    for (const k of Object.keys(msgsRef.current)) {
      if (k.startsWith(prefix)) delete msgsRef.current[k];
    }
    setMsgs(msgsRef.current);
    for (const k of Object.keys(channelCursorRef.current)) {
      if (k.startsWith(prefix)) delete channelCursorRef.current[k];
    }
    for (const k of Object.keys(channelHasMoreRef.current)) {
      if (k.startsWith(prefix)) delete channelHasMoreRef.current[k];
    }
    for (const k of [...loadedKeysRef.current]) {
      if (k.startsWith(prefix)) loadedKeysRef.current.delete(k);
    }
  }

  /** Re-fetch a room's category/channel tree (e.g. after creating a channel). */
  async function refreshRoomDetail(roomId: string): Promise<void> {
    const detail = await ChatAPI.getRoomDetail(roomId);
    setRoomDetails((prev) => ({ ...prev, [roomId]: detail }));
  }

  /** Locally apply an edit/delete/reorder to the cached room structure so the
      sidebar reflects it instantly; a later refresh reconciles with the server. */
  function patchRoomDetail(
    roomId: string,
    updater: (detail: RoomDetail) => RoomDetail,
  ) {
    setRoomDetails((prev) => {
      const detail = prev[roomId];
      if (!detail) return prev;
      return { ...prev, [roomId]: updater(detail) };
    });
  }

  // ---------------------------------------------------------------------------
  // Member management (Phase 4 §8)
  // ---------------------------------------------------------------------------

  async function changeMemberRole(
    roomId: string,
    userId: string,
    role: RoomRole,
  ): Promise<void> {
    try {
      const member = await ChatAPI.changeMemberRole(roomId, userId, role);
      // Optimistically reflect the role change; the socket echo reconciles too.
      patchRoomMember(roomId, userId, { role: member.role });
      toast(
        role === "MEMBER"
          ? "Role updated to member"
          : `Promoted to ${role.toLowerCase()}`,
        "success",
      );
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't change role"), "error");
      throw err;
    }
  }

  async function kickMember(roomId: string, userId: string): Promise<void> {
    try {
      await ChatAPI.kickMember(roomId, userId);
      // Drop the member from the local list; the socket echo reconciles too.
      setRoomMembersBoth((prev) => ({
        ...prev,
        [roomId]: (prev[roomId] ?? []).filter((m) => m.user.id !== userId),
      }));
      toast("Member removed", "success");
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't remove member"), "error");
      throw err;
    }
  }

  async function banMember(
    roomId: string,
    userId: string,
    reason?: string,
  ): Promise<void> {
    try {
      await ChatAPI.banMember(roomId, userId, reason);
      setRoomMembersBoth((prev) => ({
        ...prev,
        [roomId]: (prev[roomId] ?? []).filter((m) => m.user.id !== userId),
      }));
      // Refresh the ban list if it's already loaded.
      if (roomBansRef.current[roomId]) void refreshRoomBans(roomId);
      toast("Member banned", "success");
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't ban member"), "error");
      throw err;
    }
  }

  async function unbanMember(roomId: string, userId: string): Promise<void> {
    try {
      await ChatAPI.unbanMember(roomId, userId);
      setRoomBansBoth((prev) => ({
        ...prev,
        [roomId]: (prev[roomId] ?? []).filter((b) => b.userId !== userId),
      }));
      toast("Ban lifted", "success");
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't lift ban"), "error");
      throw err;
    }
  }

  async function muteMember(
    roomId: string,
    userId: string,
    durationMinutes: number,
  ): Promise<void> {
    try {
      const member = await ChatAPI.muteMember(roomId, userId, durationMinutes);
      patchRoomMember(roomId, userId, { mutedUntil: member.mutedUntil });
      toast("Member muted", "success");
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't mute member"), "error");
      throw err;
    }
  }

  async function unmuteMember(roomId: string, userId: string): Promise<void> {
    try {
      const member = await ChatAPI.unmuteMember(roomId, userId);
      patchRoomMember(roomId, userId, { mutedUntil: member.mutedUntil });
      toast("Member unmuted", "success");
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't unmute member"), "error");
      throw err;
    }
  }

  async function setMemberNickname(
    roomId: string,
    userId: string,
    nickname: string | null,
  ): Promise<void> {
    try {
      const member = await ChatAPI.setMemberNickname(roomId, userId, nickname);
      patchRoomMember(roomId, userId, { nickname: member.nickname });
      toast(nickname ? "Nickname updated" : "Nickname cleared", "success");
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't update nickname"), "error");
      throw err;
    }
  }

  async function refreshRoomBans(roomId: string): Promise<void> {
    try {
      const bans = await ChatAPI.getRoomBans(roomId);
      setRoomBansBoth((prev) => ({ ...prev, [roomId]: bans }));
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't load bans"), "error");
    }
  }

  function closeConv() {
    const a = activeRef.current;
    if (a) leaveSocket(a);
    activeRef.current = null;
    setActive(null);
    clearActiveConversation();
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
    const key = timelineKey(a);

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
      ...(a.kind === "room"
        ? { roomId: a.id, channelId: a.channelId, senderId: me.id }
        : {}),
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
          const res = await RoomSocket.send(a.id, a.channelId!, {
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
          const res = await RoomSocket.send(a.id, a.channelId!, {
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

  /**
   * Upload + send a voice recording. Mirrors sendMessage's optimistic flow:
   * a pending VOICE bubble renders immediately, the recording is uploaded via
   * the voice presign path, then the message is sent through the same DM REST
   * or room-socket pipeline as any other attachment message.
   */
  async function sendVoiceMessage(
    blob: Blob,
    durationSeconds: number,
    waveformPeaks: number[],
    caption?: string,
  ): Promise<void> {
    const a = activeRef.current;
    if (!a) return;
    const me = userRef.current!;
    const key = timelineKey(a);
    const text = caption?.trim() ?? "";

    const tempId = `temp-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const temp: Message = {
      id: tempId,
      content: text || null,
      messageType: "VOICE",
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
      ...(a.kind === "room"
        ? { roomId: a.id, channelId: a.channelId, senderId: me.id }
        : {}),
    };
    setMsgsBoth((prev) => ({
      ...prev,
      [key]: [...(prev[key] ?? []), temp],
    }));

    try {
      const attachmentId = await uploadVoiceAttachment(
        a.kind,
        a.id,
        blob,
        durationSeconds,
        waveformPeaks,
      );

      let msg: Message | null = null;
      const body = {
        content: text || undefined,
        messageType: "VOICE",
        attachmentIds: [attachmentId],
      };
      if (a.kind === "dm") {
        msg = await ChatAPI.sendDmMessage(a.id, body);
      } else {
        const res = await RoomSocket.send(a.id, a.channelId!, body);
        msg = res.message ?? null;
      }

      if (msg) {
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
      // Keep the bubble so the failure is visible; the recorder stays open
      // (its onSend throws) and the user can retry or discard.
      setMsgsBoth((prev) => ({
        ...prev,
        [key]: (prev[key] ?? []).map((m) =>
          m.id === tempId ? { ...m, pending: false, failed: true } : m,
        ),
      }));
      toast(getErrorMessage(err, "Failed to send voice message"), "error");
      throw err;
    }
  }

  /** Drop a client-only (pending/failed) message from the timeline. */
  function removeLocalMessage(messageId: string) {
    const a = activeRef.current;
    if (!a) return;
    const key = timelineKey(a);
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
      setChannelUnreadsBoth((prev) => mergeChannelUnreads(prev, rooms.items));
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

  // Stabilise the context value so children using useShell() only re-render
  // when the state slices they depend on actually change.
  const ctx = useMemo(
    () => ({
      // user is guaranteed non-null when ctx is consumed (early return above).
      user: user!,
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
      presence,
      channelUnreads,
      roomNotificationPrefs,
      setRoomNotificationPrefs,
      roomDetails,
      roomBans,
      q,
      results,
      listLoading,
      mStack,
      toasts,
      friendRequests,
      blockedUsers,
      setTab,
      setQ,
      search,
      openConv,
      openChannel,
      leaveRoom,
      changeMemberRole,
      kickMember,
      banMember,
      unbanMember,
      muteMember,
      unmuteMember,
      setMemberNickname,
      refreshRoomBans,
      refreshRoomDetail,
      patchRoomDetail,
      loadOlderMessages,
      loadOlderDmMessages,
      closeConv,
      navigateBack,
      refreshLists,
      refreshUser,
      openModal,
      popModal,
      clearModals,
      toast,
      dismissToast,
      sendMessage,
      sendVoiceMessage,
      editMessage,
      deleteMessage,
      removeLocalMessage,
      markRead,
      inviteRows,
      joinRequests,
      joinLinks,
      createLink,
      deactivateLink,
      roomInfo,
      refreshFriendRequests,
      sendFriendRequest,
      acceptFriendRequest,
      declineFriendRequest,
      withdrawFriendRequest,
      blockUser,
      unblockUser,
      refreshBlockedUsers,
      updateRelationship,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
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
      presence,
      channelUnreads,
      roomNotificationPrefs,
      roomDetails,
      roomBans,
      q,
      results,
      listLoading,
      mStack,
      toasts,
      friendRequests,
      blockedUsers,
    ],
  );

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

  return (
    <ShellContext.Provider value={ctx}>
      <CallProvider>
        {/* Skip link: keyboard users jump past rail + list to the main content area. */}
        <a
          href="#main-content"
          className="skip-link sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[200] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-on focus:shadow-lg"
        >
          Skip to content
        </a>
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
                    presence={presence[user.id]}
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
                        openModal("status");
                      }}
                    >
                      <SmileyIcon className="h-4 w-4 flex-none" /> Status
                    </button>
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
                        setTab("settings");
                      }}
                    >
                      <GearIcon className="h-4 w-4 flex-none" /> Settings
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
            <main
              id="main-content"
              className={`thread flex min-h-0 min-w-0 flex-col bg-bg max-md:fixed max-md:inset-0 max-md:z-30 max-md:translate-x-full max-md:transition-transform max-md:duration-[260ms] max-md:ease-app ${active ? "max-md:group-data-[thread-open]:translate-x-0" : ""}`}
            >
              {active?.kind === "room" ? (
                <RoomShell key={active.id} />
              ) : (
                <ThreadPanel />
              )}
            </main>
          </div>

          <ReconnectBanner />

          {/* Mobile bottom nav */}
          <nav className="bottomnav fixed inset-x-0 bottom-0 z-20 hidden border-t border-border bg-surface px-2 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5 max-md:block">
            <div className="bn-row grid grid-cols-4 gap-1.5">
              <button
                className={`bn-item relative flex cursor-pointer flex-col items-center gap-[3px] rounded-[12px] py-[7px] text-[10.5px] font-extrabold text-muted transition-colors duration-150 ease-app ${tab === "dm" ? "bg-accent-soft text-accent-solid" : ""}`}
                onClick={() => {
                  setTab("dm");
                  if (
                    typeof window !== "undefined" &&
                    window.innerWidth < 768
                  ) {
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
                  if (
                    typeof window !== "undefined" &&
                    window.innerWidth < 768
                  ) {
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
                  if (
                    typeof window !== "undefined" &&
                    window.innerWidth < 768
                  ) {
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
                  if (
                    typeof window !== "undefined" &&
                    window.innerWidth < 768
                  ) {
                    navigateBack();
                  }
                }}
              >
                <GearIcon className="h-[21px] w-[21px]" />
                Settings
              </button>
            </div>
          </nav>

          <FloatingCallWidget />
          <IncomingCallModal />
          <CallingOverlay />
          <Modals />
          <Toasts />
        </div>
      </CallProvider>
    </ShellContext.Provider>
  );
}
