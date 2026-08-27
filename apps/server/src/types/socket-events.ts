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

  // -----------------------------------------------------------------------
  // DM Voice / Video Call — client → server
  // -----------------------------------------------------------------------

  /** Client confirms it connected to the LiveKit room (after RoomEvent.Connected). */
  "dmCall:livekitConnected": (payload: { sessionId: string }) => void;

  /** Client lost its LiveKit connection (network drop, tab close, etc.). */
  "dmCall:livekitDisconnected": (payload: { sessionId: string }) => void;

  /** Client dismissed an incoming call UI on one device — relay to other devices. */
  "dmCall:dismiss": (payload: {
    sessionId: string;
    reason: "accepted" | "declined" | "cancelled" | "timeout";
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
    channelName: string;
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
      type: "TEXT" | "VOICE" | "ANNOUNCEMENT" | "FORUM";
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
      type: "TEXT" | "VOICE" | "ANNOUNCEMENT" | "FORUM";
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
  // Phase 7 — Voice channel call events (application-level only; LiveKit owns RTC state).
  "call.started": (payload: { channelId: string; sessionId: string }) => void;
  "call.ended": (payload: { channelId: string; sessionId: string }) => void;
  "call.participant.joined": (payload: {
    channelId: string;
    userId: string;
    user: {
      id: string;
      username: string;
      displayName: string | null;
      avatar: string | null;
    };
  }) => void;
  "call.participant.left": (payload: {
    channelId: string;
    userId: string;
  }) => void;
  "call.participant.kicked": (payload: {
    channelId: string;
    userId: string;
    by: string;
  }) => void;
  "call.participant.muted": (payload: {
    channelId: string;
    userId: string;
    by: string;
  }) => void;

  // -----------------------------------------------------------------------
  // DM Voice / Video Call events
  // -----------------------------------------------------------------------

  /** Callee received an incoming call invite. */
  "dmCall:invited": (payload: {
    directChatId: string;
    sessionId: string;
    callType: "VOICE" | "VIDEO";
    caller: {
      id: string;
      username: string;
      displayName: string | null;
      avatar: string | null;
    };
  }) => void;

  /** Callee accepted the call (application-level; both still need to join LiveKit). */
  "dmCall:accepted": (payload: {
    directChatId: string;
    sessionId: string;
  }) => void;

  /** Callee declined the call. */
  "dmCall:declined": (payload: {
    directChatId: string;
    sessionId: string;
  }) => void;

  /** Caller cancelled the call. */
  "dmCall:cancelled": (payload: {
    directChatId: string;
    sessionId: string;
  }) => void;

  /** Both participants connected to LiveKit — call is now ACTIVE. */
  "dmCall:connected": (payload: {
    directChatId: string;
    sessionId: string;
    connectedAt: Date;
  }) => void;

  /** The call ended (any outcome). */
  "dmCall:ended": (payload: {
    directChatId: string;
    sessionId: string;
    outcome: string;
  }) => void;

  /** A participant joined the LiveKit room. */
  "dmCall:participant.joined": (payload: {
    directChatId: string;
    sessionId: string;
    userId: string;
    user: {
      id: string;
      username: string;
      displayName: string | null;
      avatar: string | null;
    };
  }) => void;

  /** A participant left the LiveKit room. */
  "dmCall:participant.left": (payload: {
    directChatId: string;
    sessionId: string;
    userId: string;
  }) => void;

  /** Per-user multi-device sync: dismiss incoming call UI. */
  "dmCall:dismiss": (payload: {
    directChatId: string;
    sessionId: string;
    reason: "accepted" | "declined" | "cancelled" | "timeout";
  }) => void;

  /** DM call handler error — sent back to the socket that triggered it. */
  "dmCall:error": (payload: { code: string; message: string }) => void;
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
