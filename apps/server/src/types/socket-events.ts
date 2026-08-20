import type { SocketData } from "socket.io";
import type { FriendRequestStatus } from "@repo/validators";

export interface ClientToServerEvents {
  "directChat:join": (payload: { directChatId: string }) => void;
  "directChat:leave": (payload: { directChatId: string }) => void;
  "directChat:typing": (payload: {
    directChatId: string;
    isTyping: boolean;
  }) => void;
  "chatroom:join": (payload: { roomId: string }) => void;
  "chatroom:leave": (payload: { roomId: string }) => void;
  "chatroom:typing": (payload: { roomId: string; isTyping: boolean }) => void;
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
  "chatroom:joined": (payload: { roomId: string }) => void;
  "chatroom:left": (payload: { roomId: string }) => void;
  "chatroom:error": (payload: { code: string; message: string }) => void;
  "chatroom:message": (payload: MessagePayload) => void;
  "chatroom:message:edited": (payload: RoomMessageEditedPayload) => void;
  "chatroom:message:deleted": (payload: RoomMessageDeletedPayload) => void;
  "chatroom:read": (payload: { roomId: string; unreadCount: number }) => void;
  /** Per-channel read cursor moved (Phase 6 §10.1). */
  "channel:read": (payload: {
    roomId: string;
    channelId: string;
    unreadCount: number;
    mentionCount: number;
  }) => void;
  /** Another member advanced their read cursor in a channel. */
  "channel:readReceipt": (payload: {
    userId: string;
    roomId: string;
    channelId: string;
    lastReadMessageId: string;
    lastReadMessageCreatedAt: Date;
  }) => void;
  /** A message @-mentioned the recipient (Phase 6 §10.1/§10.2). */
  "mention:new": (payload: {
    messageId: string;
    roomId: string;
    channelId: string;
    senderId: string;
    senderName: string;
    content: string | null;
  }) => void;
  "channel:created": (payload: {
    roomId: string;
    channel: {
      id: string;
      roomId: string;
      categoryId: string | null;
      name: string;
      topic: string | null;
      type: string;
      position: number;
    };
  }) => void;
  "channel:updated": (payload: {
    roomId: string;
    channel: {
      id: string;
      roomId: string;
      categoryId: string | null;
      name: string;
      topic: string | null;
      type: string;
      position: number;
    };
  }) => void;
  "channel:deleted": (payload: { roomId: string; channelId: string }) => void;
  "channel:reordered": (payload: {
    roomId: string;
    items: { id: string; categoryId: string | null }[];
  }) => void;
  "category:created": (payload: {
    roomId: string;
    category: { id: string; roomId: string; name: string; position: number };
  }) => void;
  "category:updated": (payload: {
    roomId: string;
    category: { id: string; roomId: string; name: string; position: number };
  }) => void;
  "category:deleted": (payload: { roomId: string; categoryId: string }) => void;
  "category:reordered": (payload: {
    roomId: string;
    orderedIds: string[];
  }) => void;
  "room:updated": (payload: {
    roomId: string;
    room: {
      id: string;
      name: string;
      description: string | null;
      avatar: string | null;
    };
  }) => void;
  "chatroom:member:added": (payload: {
    roomId: string;
    member: RoomMemberPayload;
  }) => void;
  "chatroom:member:removed": (payload: {
    roomId: string;
    userId: string;
    reason: "left" | "kicked" | "banned";
  }) => void;
  "chatroom:member:roleChanged": (payload: {
    roomId: string;
    userId: string;
    role: string;
    member: RoomMemberPayload;
  }) => void;
  "chatroom:member:muted": (payload: {
    roomId: string;
    userId: string;
    mutedUntil: Date | null;
  }) => void;
  "chatroom:member:unmuted": (payload: {
    roomId: string;
    userId: string;
  }) => void;
  "chatroom:member:nicknameChanged": (payload: {
    roomId: string;
    userId: string;
    nickname: string | null;
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
    roomId: string;
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
    roomId: string;
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
  createdAt: Date;
  messageType: string;
  attachments: AttachmentPayload[];
  isDeleted: boolean;
  editedAt?: Date | null;
  deletedAt?: Date | null;
  /** Present on DM messages. */
  directChatId?: string | null;
  /** Present on room messages (normalized from the DB column chatRoomId). */
  roomId?: string | null;
  /** Present on room messages; pins the message into a channel. */
  channelId?: string | null;
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

export type RoomMessageEditedPayload = {
  messageId: string;
  roomId: string;
  content: string | null;
  editedAt: Date | null;
};

export type RoomMessageDeletedPayload = {
  messageId: string;
  roomId: string;
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

/** A room member summary broadcast on role/mute/nickname changes (Phase 4). */
export type RoomMemberPayload = {
  memberId: string;
  userId: string;
  role: string;
  joinedAt: Date;
  nickname: string | null;
  mutedUntil: Date | null;
  user: {
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
  };
};
