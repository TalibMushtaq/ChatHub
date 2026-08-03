import crypto from "node:crypto";

/**
 * Factory for creating chat room objects in tests.
 */
export function createChatRoom(
  partial?: Partial<ReturnType<typeof createChatRoom>>,
) {
  const id = partial?.id ?? crypto.randomUUID();
  const defaults = {
    id,
    name: `Room ${id.slice(0, 8)}`,
    description: "A test room",
    createdBy: crypto.randomUUID(),
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    lastMessageAt: null as Date | null,
  };

  return { ...defaults, ...partial };
}

/**
 * Factory for chat room membership records.
 */
export function createChatRoomMember(
  partial?: Partial<ReturnType<typeof createChatRoomMember>>,
) {
  const defaults = {
    id: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    chatRoomId: crypto.randomUUID(),
    role: "MEMBER" as "OWNER" | "ADMIN" | "MEMBER",
    joinedAt: new Date("2024-01-01T00:00:00Z"),
  };

  return { ...defaults, ...partial };
}

/**
 * Factory for direct chat records.
 */
export function createDirectChat(
  partial?: Partial<ReturnType<typeof createDirectChat>>,
) {
  const id = partial?.id ?? crypto.randomUUID();
  const defaults = {
    id,
    user1Id: crypto.randomUUID(),
    user2Id: crypto.randomUUID(),
    createdAt: new Date("2024-01-01T00:00:00Z"),
    lastMessageAt: null as Date | null,
  };

  return { ...defaults, ...partial };
}

/**
 * Factory for message records.
 */
export function createMessage(
  partial?: Partial<ReturnType<typeof createMessage>>,
) {
  const id = partial?.id ?? crypto.randomUUID();
  const defaults = {
    id,
    content: "Hello, world!",
    senderId: crypto.randomUUID(),
    directChatId: null as string | null,
    chatRoomId: null as string | null,
    messageType: "TEXT" as "TEXT" | "FILE",
    fileUrl: null as string | null,
    fileName: null as string | null,
    fileSize: null as number | null,
    isDeleted: false,
    editedAt: null as Date | null,
    deletedAt: null as Date | null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
  };

  return { ...defaults, ...partial };
}

/**
 * Factory for room invitation records.
 */
export function createRoomInvitation(
  partial?: Partial<ReturnType<typeof createRoomInvitation>>,
) {
  const defaults = {
    id: crypto.randomUUID(),
    roomId: crypto.randomUUID(),
    invitedUserId: crypto.randomUUID(),
    invitedById: crypto.randomUUID(),
    status: "PENDING" as "PENDING" | "ACCEPTED" | "REJECTED",
    createdAt: new Date("2024-01-01T00:00:00Z"),
  };

  return { ...defaults, ...partial };
}

/**
 * Factory for room join request records.
 */
export function createJoinRequest(
  partial?: Partial<ReturnType<typeof createJoinRequest>>,
) {
  const defaults = {
    id: crypto.randomUUID(),
    roomId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    status: "PENDING" as "PENDING" | "APPROVED" | "REJECTED",
    reviewedById: null as string | null,
    reviewedAt: null as Date | null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
  };

  return { ...defaults, ...partial };
}

/**
 * Factory for room join link records.
 */
export function createJoinLink(
  partial?: Partial<ReturnType<typeof createJoinLink>>,
) {
  const id = partial?.id ?? crypto.randomUUID();
  const defaults = {
    id,
    token: `hashed-${crypto.randomBytes(12).toString("hex")}`,
    roomId: crypto.randomUUID(),
    createdById: crypto.randomUUID(),
    maxUses: null as number | null,
    usedCount: 0,
    expiresAt: null as Date | null,
    isActive: true,
    createdAt: new Date("2024-01-01T00:00:00Z"),
  };

  return { ...defaults, ...partial };
}

/**
 * Factory for recovery code rows (database representation).
 */
export function createRecoveryCodeRow(
  partial?: Partial<ReturnType<typeof createRecoveryCodeRow>>,
) {
  const defaults = {
    id: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    codeId: "ABCD12",
    hash: `$argon2id$v=19$m=65536,t=3,p=4$${"A".repeat(22)}$${"B".repeat(43)}`,
    used: false,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    usedAt: null as Date | null,
  };

  return { ...defaults, ...partial };
}
