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

/**
 * A user's public profile as returned by GET /api/search/users/:id. Feeds the
 * profile card; `status`/`customStatus` are intentionally absent (the live
 * presence map is the authoritative, privacy-gated source for those).
 */
export interface UserProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  bio: string | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  createdAt: string;
  /** How the current user relates to this user (server-derived). */
  relationship: Relationship;
  /**
   * Id of any PENDING friend request between the current user and this user
   * (either direction). Null unless relationship is REQUEST_SENT/REQUEST_RECEIVED.
   */
  friendRequestId: string | null;
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
  /** Voice-message duration in seconds (audio attachments only). */
  duration?: number | null;
  /** Precomputed amplitude samples (0..1) for the voice waveform. */
  waveformPeaks?: number[] | null;
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
  /** Room messages carry roomId + channelId instead of directChatId. */
  roomId?: string;
  channelId?: string;
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
    /** First attachment's duration (seconds) — present for voice messages. */
    attachments?: { duration?: number | null }[];
  } | null;
  unreadCount: number;
  createdAt: string;
}

export type RoomRole = "OWNER" | "ADMIN" | "MODERATOR" | "MEMBER";

/** Channel kind — VOICE is wired up in the calling phase. */
export type ChannelType = "TEXT" | "VOICE" | "ANNOUNCEMENT" | "FORUM";

export interface Channel {
  id: string;
  roomId: string;
  categoryId: string | null;
  name: string;
  topic: string | null;
  type: ChannelType;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  roomId: string;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  /** Present in the room-detail response: the category's own channels. */
  channels?: Channel[];
}

/** Room detail from GET /room/rooms/:roomId — profile + full structure. */
export interface RoomDetail {
  id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  categories: Category[];
  uncategorized: Channel[];
}

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
    /** First attachment's duration (seconds) — present for voice messages. */
    attachments?: { duration?: number | null }[];
  } | null;
  memberCount: number;
  unreadCount: number;
}

export interface RoomMember {
  memberId: string;
  role: RoomRole;
  joinedAt: string;
  user: MessageUser;
  /** Per-room display name (Phase 4), falls back to the global display name. */
  nickname?: string | null;
  /** While set (and in the future), the member is muted. */
  mutedUntil?: string | null;
}

/** A room ban record from GET /room/:roomId/bans (Phase 4 §8.3). */
export interface RoomBan {
  id: string;
  userId: string;
  reason: string | null;
  createdAt: string;
  bannedBy: MessageUser;
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
  | "roomSettings"
  | "createChannel"
  | "createCategory"
  | "editChannel"
  | "editCategory"
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
  | "confirm"
  | "userProfile"
  | "avatarViewer"
  | "memberAction"
  | "banList"
  | "nickname";

export interface UploadItem {
  uid: string;
  name: string;
  size: number;
  type: string;
  progress: number;
  done: boolean;
  error?: boolean;
}
