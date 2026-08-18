import crypto from "node:crypto";

/** Explicit type for the chat room factory output to avoid circular self-reference (TS2502). */
type ChatRoomFactory = {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date | null;
};

/**
 * Factory for creating chat room objects in tests.
 */
export function createChatRoom(
  partial: Partial<ChatRoomFactory> = {},
): ChatRoomFactory {
  const id = partial.id ?? crypto.randomUUID();
  const defaults: ChatRoomFactory = {
    id,
    name: `Room ${id.slice(0, 8)}`,
    description: "A test room",
    createdBy: crypto.randomUUID(),
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    lastMessageAt: null,
  };

  return { ...defaults, ...partial };
}

/** Explicit type for the room member factory output. */
type ChatRoomMemberFactory = {
  id: string;
  userId: string;
  chatRoomId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  joinedAt: Date;
};

/**
 * Factory for chat room membership records.
 */
export function createChatRoomMember(
  partial: Partial<ChatRoomMemberFactory> = {},
): ChatRoomMemberFactory {
  const defaults: ChatRoomMemberFactory = {
    id: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    chatRoomId: crypto.randomUUID(),
    role: "MEMBER",
    joinedAt: new Date("2024-01-01T00:00:00Z"),
  };

  return { ...defaults, ...partial };
}

/** Explicit type for the channel factory output. */
type ChannelFactory = {
  id: string;
  roomId: string;
  categoryId: string | null;
  name: string;
  topic: string | null;
  type: "TEXT" | "VOICE" | "ANNOUNCEMENT" | "FORUM";
  position: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Factory for channel records. */
export function createChannel(
  partial: Partial<ChannelFactory> = {},
): ChannelFactory {
  const id = partial.id ?? crypto.randomUUID();
  const defaults: ChannelFactory = {
    id,
    roomId: crypto.randomUUID(),
    categoryId: null,
    name: `general-${id.slice(0, 4)}`,
    topic: null,
    type: "TEXT",
    position: 0,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
  };

  return { ...defaults, ...partial };
}

/** Explicit type for the category factory output. */
type CategoryFactory = {
  id: string;
  roomId: string;
  name: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Factory for category records. */
export function createCategory(
  partial: Partial<CategoryFactory> = {},
): CategoryFactory {
  const id = partial.id ?? crypto.randomUUID();
  const defaults: CategoryFactory = {
    id,
    roomId: crypto.randomUUID(),
    name: "GENERAL",
    position: 0,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
  };

  return { ...defaults, ...partial };
}

/** Explicit type for the direct chat factory output. */
type DirectChatFactory = {
  id: string;
  user1Id: string;
  user2Id: string;
  createdAt: Date;
  lastMessageAt: Date | null;
};

/**
 * Factory for direct chat records.
 */
export function createDirectChat(
  partial: Partial<DirectChatFactory> = {},
): DirectChatFactory {
  const id = partial.id ?? crypto.randomUUID();
  const defaults: DirectChatFactory = {
    id,
    user1Id: crypto.randomUUID(),
    user2Id: crypto.randomUUID(),
    createdAt: new Date("2024-01-01T00:00:00Z"),
    lastMessageAt: null,
  };

  return { ...defaults, ...partial };
}

/** Explicit type for the message factory output. */
type MessageFactory = {
  id: string;
  content: string;
  senderId: string;
  directChatId: string | null;
  chatRoomId: string | null;
  messageType:
    "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "VOICE" | "FILE" | "SYSTEM";
  isDeleted: boolean;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
};

/**
 * Factory for message records.
 */
export function createMessage(
  partial: Partial<MessageFactory> = {},
): MessageFactory {
  const id = partial.id ?? crypto.randomUUID();
  const defaults: MessageFactory = {
    id,
    content: "Hello, world!",
    senderId: crypto.randomUUID(),
    directChatId: null,
    chatRoomId: null,
    messageType: "TEXT",
    isDeleted: false,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
  };

  return { ...defaults, ...partial };
}

/** Explicit type for the room invitation factory output. */
type RoomInvitationFactory = {
  id: string;
  roomId: string;
  invitedUserId: string;
  invitedById: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  createdAt: Date;
};

/**
 * Factory for room invitation records.
 */
export function createRoomInvitation(
  partial: Partial<RoomInvitationFactory> = {},
): RoomInvitationFactory {
  const defaults: RoomInvitationFactory = {
    id: crypto.randomUUID(),
    roomId: crypto.randomUUID(),
    invitedUserId: crypto.randomUUID(),
    invitedById: crypto.randomUUID(),
    status: "PENDING",
    createdAt: new Date("2024-01-01T00:00:00Z"),
  };

  return { ...defaults, ...partial };
}

/** Explicit type for the join request factory output. */
type JoinRequestFactory = {
  id: string;
  roomId: string;
  userId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedById: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
};

/**
 * Factory for room join request records.
 */
export function createJoinRequest(
  partial: Partial<JoinRequestFactory> = {},
): JoinRequestFactory {
  const defaults: JoinRequestFactory = {
    id: crypto.randomUUID(),
    roomId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    status: "PENDING",
    reviewedById: null,
    reviewedAt: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
  };

  return { ...defaults, ...partial };
}

/** Explicit type for the join link factory output. */
type JoinLinkFactory = {
  id: string;
  token: string;
  roomId: string;
  createdById: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
};

/**
 * Factory for room join link records.
 */
export function createJoinLink(
  partial: Partial<JoinLinkFactory> = {},
): JoinLinkFactory {
  const id = partial.id ?? crypto.randomUUID();
  const defaults: JoinLinkFactory = {
    id,
    token: `hashed-${crypto.randomBytes(12).toString("hex")}`,
    roomId: crypto.randomUUID(),
    createdById: crypto.randomUUID(),
    maxUses: null,
    usedCount: 0,
    expiresAt: null,
    isActive: true,
    createdAt: new Date("2024-01-01T00:00:00Z"),
  };

  return { ...defaults, ...partial };
}

/** Explicit type for the recovery code row factory output. */
type RecoveryCodeRowFactory = {
  id: string;
  userId: string;
  codeId: string;
  hash: string;
  used: boolean;
  createdAt: Date;
  usedAt: Date | null;
};

/**
 * Factory for recovery code rows (database representation).
 */
export function createRecoveryCodeRow(
  partial: Partial<RecoveryCodeRowFactory> = {},
): RecoveryCodeRowFactory {
  const defaults: RecoveryCodeRowFactory = {
    id: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    codeId: "ABCD12",
    hash: `$argon2id$v=19$m=65536,t=3,p=4$${"A".repeat(22)}$${"B".repeat(43)}`,
    used: false,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    usedAt: null,
  };

  return { ...defaults, ...partial };
}
