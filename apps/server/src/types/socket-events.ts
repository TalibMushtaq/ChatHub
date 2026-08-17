import type { SocketData } from "socket.io";
import type { FriendRequestStatus } from "@repo/validators";

export interface ClientToServerEvents {
  "directChat:join": (payload: { directChatId: string }) => void;
  "directChat:leave": (payload: { directChatId: string }) => void;
  "directChat:typing": (payload: {
    directChatId: string;
    isTyping: boolean;
  }) => void;
  "chatroom:typing": (payload: {
    chatRoomId: string;
    isTyping: boolean;
  }) => void;
  /** Tab liveness signal; the server treats absence as the idle signal. */
  "presence:heartbeat": () => void;
  /** Live update of the user's manual status / custom status. */
  "presence:setStatus": (payload: {
    status?: string;
    customStatus?: string | null;
  }) => void;
}

export interface ServerToClientEvents {
  "directChat:joined": (payload: { directChatId: string }) => void;
  "directChat:left": (payload: { directChatId: string }) => void;
  "directChat:error": (payload: { code: string; message: string }) => void;
  "message:new": (payload: MessagePayload) => void;
  "message:edited": (payload: MessageEditedPayload) => void;
  "message:deleted": (payload: MessageDeletedPayload) => void;
  "inbox:update": (payload: { directChatId: string }) => void;
  "directChat:read": (payload: {
    directChatId: string;
    unreadCount: number;
  }) => void;
  "chatroom:read": (payload: {
    chatRoomId: string;
    unreadCount: number;
  }) => void;
  "directChat:typing": (payload: {
    userId: string;
    username: string;
    directChatId: string;
    isTyping: boolean;
  }) => void;
  "chatroom:typing": (payload: {
    userId: string;
    username: string;
    chatRoomId: string;
    isTyping: boolean;
  }) => void;
  "directChat:readReceipt": (payload: {
    userId: string;
    directChatId: string;
    lastReadMessageId: string;
    lastReadMessageCreatedAt: Date;
  }) => void;
  "chatroom:readReceipt": (payload: {
    userId: string;
    chatRoomId: string;
    lastReadMessageId: string;
    lastReadMessageCreatedAt: Date;
  }) => void;
  "presence:changed": (payload: {
    userId: string;
    presence: "online" | "idle" | "offline";
    status: string | null;
    customStatus: string | null;
  }) => void;
  "friend-request:new": (payload: FriendRequestPayload) => void;
  "friend-request:accepted": (payload: FriendRequestAcceptedPayload) => void;
  "friend-request:declined": (payload: FriendRequestDeclinedPayload) => void;
  "friend-request:blocked": (payload: FriendRequestBlockedPayload) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InterServerEvents {
  // reserved for inter-server communication (e.g. broadcasting across nodes)
}

// Re-export the module-augmented SocketData so downstream files can import
// it from this module instead of remembering the augmentation lives in
// `types/socket.io.d.ts`.
export type { SocketData };

export type AttachmentPayload = {
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
};

export type MessagePayload = {
  id: string;
  content: string | null;
  senderId: string;
  directChatId: string;
  createdAt: Date;
  messageType: string;
  attachments: AttachmentPayload[];
  isDeleted: boolean;
  editedAt?: Date | null;
  deletedAt?: Date | null;
};

export type MessageEditedPayload = {
  messageId: string;
  directChatId: string;
  content: string | null;
  editedAt: Date | null;
};

export type MessageDeletedPayload = {
  messageId: string;
  directChatId: string;
  deletedAt: Date;
};

export type FriendUserPayload = {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
};

export type FriendRequestPayload = {
  id: string;
  status: FriendRequestStatus;
  createdAt: Date;
  sender: FriendUserPayload;
  recipient: FriendUserPayload;
};

// Sent to the request's sender once the recipient accepts: `friend` is the
// recipient's summary, so the sender can render the new friendship and clear
// their "request sent" chip. `requestId` lets a stale/cached card be removed.
export type FriendRequestAcceptedPayload = {
  requestId: string;
  friend: FriendUserPayload;
};

// Sent to the request's sender on decline; `userId` is the recipient who declined.
export type FriendRequestDeclinedPayload = {
  requestId: string;
  userId: string;
};

// Sent to the blocked user when someone blocks them, so their client can flip
// the relationship to BLOCKED and drop any pending request card from the blocker.
export type FriendRequestBlockedPayload = {
  blockedBy: FriendUserPayload;
};
