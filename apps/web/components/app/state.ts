"use client";

// Shell state contract: a single React context consumed by every app panel so
// rail/list/thread/modals share one source of truth instead of prop drilling.
import { createContext, useContext } from "react";
import type {
  AppUser,
  BlockedUser,
  DMInboxEntry,
  FriendRequest,
  JoinLink,
  JoinRequest,
  Invitation,
  Message,
  ModalName,
  PresenceInfo,
  ReadReceipt,
  RoomInboxEntry,
  RoomMember,
  SearchUser,
  Tab,
  ToastType,
  TypingUser,
} from "./types";
import type { Relationship } from "@repo/validators";

export type ConvKind = "dm" | "room";

/** The conversation currently open in the thread column. */
export interface ActiveConv {
  kind: ConvKind;
  id: string;
  otherUser?: {
    id: string;
    username?: string;
    displayName?: string | null;
    avatar?: string | null;
  } | null;
  name?: string;
  description?: string | null;
  avatar?: string | null;
  myRole?: string;
}

export interface ModalEntry {
  name: ModalName;
  payload?: unknown;
}

export interface ToastItem {
  id: number;
  text: string;
  type: ToastType;
}

export interface ShellCtx {
  user: AppUser;
  tab: Tab;
  active: ActiveConv | null;
  dmList: DMInboxEntry[];
  roomList: RoomInboxEntry[];
  dmUnread: number;
  roomUnread: number;
  msgs: Record<string, Message[]>;
  roomMembers: Record<string, RoomMember[]>;
  /** convKey -> read cursors of every participant (excluding self's). */
  readReceipts: Record<string, ReadReceipt[]>;
  /** convKey -> users currently typing in that conversation. */
  typing: Record<string, TypingUser[]>;
  /** userId -> live presence/status, kept current by `presence:changed`. */
  presence: Record<string, PresenceInfo>;
  q: string;
  results: SearchUser[];
  listLoading: boolean;
  mStack: ModalEntry[];
  toasts: ToastItem[];
  /** Pending incoming friend requests (inbox system cards). */
  friendRequests: FriendRequest[];
  /** Users blocked by the current user (settings > privacy). */
  blockedUsers: BlockedUser[];
  setTab: (t: Tab) => void;
  setQ: (q: string) => void;
  search: (q: string) => Promise<void>;
  openConv: (c: ActiveConv) => void;
  closeConv: () => void;
  navigateBack: () => void;
  refreshLists: () => Promise<void>;
  /** Re-fetch the current user (e.g. after an avatar update). */
  refreshUser: () => Promise<void>;
  openModal: (name: ModalName, payload?: unknown) => void;
  popModal: () => void;
  clearModals: () => void;
  toast: (text: string, type?: ToastType) => void;
  sendMessage: (content: string, files: File[]) => Promise<void>;
  /** Upload + send a voice recording (optional text caption alongside). */
  sendVoiceMessage: (
    blob: Blob,
    durationSeconds: number,
    waveformPeaks: number[],
    caption?: string,
  ) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  /** Drop a client-only (pending/failed) message from the timeline. */
  removeLocalMessage: (messageId: string) => void;
  markRead: () => void;
  /** Invitation payloads and join-link payloads share this row shape. */
  inviteRows: (list: Invitation[]) => Invitation[];
  joinRequests: (roomId: string) => Promise<JoinRequest[]>;
  joinLinks: () => Promise<JoinLink[]>;
  createLink: (roomId: string) => Promise<JoinLink>;
  deactivateLink: (roomId: string, linkId: string) => Promise<void>;
  /** The active room's inbox entry (name, role, member count) or null. */
  roomInfo: () => RoomInboxEntry | null;
  /** Re-fetch the pending friend requests (e.g. after opening the dm list). */
  refreshFriendRequests: () => Promise<void>;
  /** Send a friend request to another user; flips the chip to REQUEST_SENT. */
  sendFriendRequest: (userId: string) => Promise<void>;
  /** Accept an incoming friend request; removes its inbox card. */
  acceptFriendRequest: (requestId: string) => Promise<void>;
  /** Decline an incoming friend request; removes its inbox card. */
  declineFriendRequest: (requestId: string) => Promise<void>;
  /** Withdraw a friend request the current user sent; removes its inbox card. */
  withdrawFriendRequest: (requestId: string) => Promise<void>;
  /** Block a user (idempotent); clears any request card involving them. */
  blockUser: (userId: string) => Promise<void>;
  /** Unblock a user (idempotent). */
  unblockUser: (userId: string) => Promise<void>;
  /** Re-fetch the blocked-users list (e.g. when opening Settings > Privacy). */
  refreshBlockedUsers: () => Promise<void>;
  /** Locally flip a search result's relationship chip (socket-driven). */
  updateRelationship: (userId: string, relationship: Relationship) => void;
}

export const ShellContext = createContext<ShellCtx | null>(null);

export function useShell(): ShellCtx {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within <AppShell>");
  return ctx;
}

/** Cache key for a conversation's message timeline. */
export function convKey(kind: ConvKind, id: string): string {
  return `${kind}:${id}`;
}

export type { SearchUser };
