import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerRoomChat } from "../../../../src/routes/room/roomChat";
import { prismaMock, resetPrismaMock, createMockTransaction } from "../../mocks/prisma";

// Mock socketAccess
vi.mock("../../../src/middleware/socketAccess", () => ({
  assertRoomAccess: vi.fn().mockResolvedValue(undefined),
  assertDirectChatAccess: vi.fn().mockResolvedValue(undefined),
}));

// Mock idempotency
vi.mock("../../../src/services/idempotency", () => ({
  checkIdempotency: vi.fn().mockResolvedValue(null),
  storeIdempotency: vi.fn().mockResolvedValue(undefined),
}));

describe("registerRoomChat with attachments", () => {
  const mockIo = {
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
  } as any;

  function createSocketWithHandlers(userId: string) {
    const handlers: Record<string, Function> = {};
    const socket = {
      id: "socket-1",
      data: {
        user: { id: userId, username: "user1" },
        rooms: new Set<string>(["room-1"]),
      },
      request: { session: {} },
      join: vi.fn(),
      leave: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
      on: vi.fn().mockImplementation((event: string, handler: Function) => {
        handlers[event] = handler;
      }),
    } as any;

    registerRoomChat(mockIo, socket);

    return { socket, handlers };
  }

  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    process.env.AWS_REGION = "us-east-1";
    process.env.AWS_S3_BUCKET_NAME = "test-bucket";
  });

  it("should broadcast a TEXT message via socket", async () => {
    const { handlers } = createSocketWithHandlers("u1");

    prismaMock.$transaction.mockResolvedValue({
      id: "msg-1",
      content: "Hello room!",
      senderId: "u1",
      chatRoomId: "room-1",
      messageType: "TEXT",
      createdAt: new Date(),
      attachments: [],
    } as any);

    const callback = vi.fn();
    await handlers["chatroom:message"]({
      payload: {
        chatRoomId: "room-1",
        content: "Hello room!",
        messageType: "TEXT",
        idempotencyKey: "test-key-123",
      },
      callback,
    });

    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true }),
    );
  });

  it("should reject SYSTEM message from client", async () => {
    const { handlers } = createSocketWithHandlers("u1");

    const callback = vi.fn();
    await handlers["chatroom:message"]({
      payload: {
        chatRoomId: "room-1",
        content: "System update",
        messageType: "SYSTEM",
      },
      callback,
    });

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false }),
    );
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });
});
