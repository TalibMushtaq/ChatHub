// Shared domain types for the app shell — mirrors the API response shapes
// the server actually returns (see routes/services) so the client never
// invents fields that don't exist.

import type { Relationship, FriendRequestStatus } from "@repo/validators";

export type Gender =
  "MALE" | "FEMALE" | "NON_BINARY" | "OTHER" | "PREFER_NOT_TO_SAY";

/** Manual status a user chooses (independent of their live presence). */
export type UserStatus = "AVAILABLE" | "BUSY" | "DND" | "AWAY" | "INVISIBLE";

/** Live connection state, derived server-side from heartbeat activity. */
export type PresenceState = "online" | "idle" | "offline";

/**
 * A user's live presence as broadcast by the server's `presence:changed`
 * event. `status`/`customStatus` are null for hidden or invisible users (the
 * server never leaks those to other clients).
 */
export interface PresenceInfo {
  userId: string;
  presence: PresenceState;
  status: UserStatus | null;
  customStatus: string | null;
}

export interface AppUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  bio: string | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  status: UserStatus;
  customStatus: string | null;
  showOnlineStatus: boolean;
  showTypingStatus: boolean;
  createdAt: string;
}

export interface SearchUser {
  id: string;
  username: string;
  displayName: string | null;
  /** How the current user relates to this search result (server-derived). */
  relationship: Relationship;
}

/** A user as shown in friend requests, friendships, and blocks. */
export interface FriendUser {
  id: string;
  username: string;
  displayName: string | null;
  avatar?: string | null;
}

export interface FriendRequest {
  id: string;
  status: FriendRequestStatus;
  createdAt: string;
  sender: FriendUser;
  recipient: FriendUser;
}

/** A blocked user entry from GET /api/users/blocked. */
export interface BlockedUser extends FriendUser {
  blockedAt: string;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  thumbnailKey?: string | null;
}

export interface MessageUser {
  id: string;
  username: string;
  displayName: string | null;
  avatar?: string | null;
}

/** A user's read cursor in a conversation. */
export interface ReadReceipt {
  userId: string;
  lastReadMessageId: string;
  lastReadMessageCreatedAt: string;
}

/** Someone currently typing in the active conversation. */
export interface TypingUser {
  userId: string;
  username: string;
}

export interface Message {
  id: string;
  content: string | null;
  messageType: string;
  createdAt: string;
  isDeleted?: boolean;
  editedAt?: string | null;
  deletedAt?: string | null;
  senderId?: string;
  directChatId?: string;
  chatRoomId?: string;
  attachments?: Attachment[];
  User?: MessageUser | null;
  /** Client-only: optimistic send state. */
  pending?: boolean;
  failed?: boolean;
}

export interface DMInboxEntry {
  directChatId: string;
  otherUser: MessageUser;
  lastMessage: {
    id: string;
    content: string | null;
    messageType: string;
    createdAt: string;
    isDeleted: boolean;
  } | null;
  unreadCount: number;
  createdAt: string;
}

export type RoomRole = "OWNER" | "ADMIN" | "MEMBER";

export interface RoomInboxEntry {
  roomId: string;
  name: string;
  description: string | null;
  avatar?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  myRole: RoomRole;
  lastMessage: {
    id: string;
    content: string | null;
    messageType: string;
    createdAt: string;
    isDeleted: boolean;
  } | null;
  memberCount: number;
  unreadCount: number;
}

export interface RoomMember {
  memberId: string;
  role: RoomRole;
  joinedAt: string;
  user: MessageUser;
}

export interface Invitation {
  id: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  room?: {
    id: string;
    name: string;
    description?: string | null;
  };
  invitedBy?: {
    id: string;
    username: string;
    displayName?: string | null;
    avatar?: string | null;
  };
  /** Matches the sent-invites endpoint's `invitedUser` field. */
  invitedUser?: {
    id: string;
    username: string;
    displayName?: string | null;
    avatar?: string | null;
  };
}

export interface JoinRequest {
  id: string;
  status: string;
  createdAt: string;
  user?: {
    id: string;
    username: string;
    displayName: string | null;
    avatar?: string | null;
  };
}

export interface JoinLink {
  id: string;
  /** Raw token — only present on the create response (server returns it once). */
  token: string;
  maxUses: number | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt?: string;
  isActive?: boolean;
  active?: boolean;
  usedCount?: number;
  uses?: number;
  room?: {
    id: string;
    name: string;
  };
}

export interface RecoveryCode {
  code: string;
  usedAt: string | null;
  createdAt: string;
}

export type Tab = "dm" | "room" | "search" | "settings";

export type ToastType = "error" | "success" | "info";

export interface ActiveConv {
  kind: "dm" | "room";
  id: string;
}

export type ModalName =
  | "newDm"
  | "newRoom"
  | "roomInfo"
  | "invite"
  | "joinRequests"
  | "joinLinks"
  | "receivedInvites"
  | "sentInvites"
  | "myLinks"
  | "profile"
  | "status"
  | "privacy"
  | "notifications"
  | "recovery"
  | "confirm";

export interface UploadItem {
  uid: string;
  name: string;
  size: number;
  type: string;
  progress: number;
  done: boolean;
  error?: boolean;
}
