import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerRoomChat } from "../../../../src/routes/room/roomChat";
import {
  prismaMock,
  resetPrismaMock,
  createMockTransaction,
} from "../../mocks/prisma";

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
    const handlers: Record<string, (...args: unknown[]) => unknown> = {};
    const socket = {
      id: "socket-1",
      data: {
        user: { id: userId, username: "user1" },
        rooms: new Map<string, number>([["room-1", Date.now() + 60_000]]),
      },
      request: { session: {} },
      join: vi.fn(),
      leave: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
      on: vi
        .fn()
        .mockImplementation(
          (event: string, handler: (...args: unknown[]) => unknown) => {
            handlers[event] = handler;
          },
        ),
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

    // Room sockets resolve a missing channelId to the room's #general channel
    // before creating the message, so the resolver must find it.
    prismaMock.channel.findFirst.mockResolvedValue({ id: "ch-1" } as any);

    const callback = vi.fn();
    await handlers["chatroom:message"](
      {
        roomId: "room-1",
        content: "Hello room!",
        messageType: "TEXT",
        idempotencyKey: "test-key-123",
      },
      callback,
    );

    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true }),
    );
  });

  it("should broadcast a message with populated attachments", async () => {
    const { handlers } = createSocketWithHandlers("u1");

    const msg = {
      id: "msg-1",
      content: null,
      senderId: "u1",
      chatRoomId: "room-1",
      messageType: "IMAGE",
      createdAt: new Date(),
      attachments: [],
    };

    const msgWithAttachments = {
      ...msg,
      attachments: [
        {
          id: "att-1",
          filename: "photo.jpg",
          mimeType: "image/jpeg",
          size: 12345,
          width: null,
          height: null,
          thumbnailKey: null,
        },
      ],
    };

    // Execute the real transaction callback instead of mocking the return
    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.create.mockResolvedValue(msg as any);
    prismaMock.message.findUnique.mockResolvedValue(msgWithAttachments as any);
    prismaMock.attachment.findMany.mockResolvedValue([
      { id: "att-1", status: "PENDING", uploaderId: "u1" },
    ] as any);
    prismaMock.attachment.updateMany.mockResolvedValue({ count: 1 } as any);
    prismaMock.chatRoom.update.mockResolvedValue({ id: "room-1" } as any);
    prismaMock.channel.findFirst.mockResolvedValue({ id: "ch-1" } as any);

    const callback = vi.fn();
    await handlers["chatroom:message"](
      {
        roomId: "room-1",
        messageType: "IMAGE",
        attachmentIds: ["att-1"],
      },
      callback,
    );

    // The ack should carry the re-fetched message with populated attachments
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        message: expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({ id: "att-1" }),
          ]),
        }),
      }),
    );

    // The socket broadcast should also carry populated attachments
    expect(mockIo.to).toHaveBeenCalledWith("room:room-1");
    const emitCall = mockIo.to.mock.results[0]?.value.emit;
    if (emitCall) {
      const broadcastMsg = emitCall.mock.calls[0]?.[1];
      expect(broadcastMsg.attachments).toHaveLength(1);
    }
  });

  it("should reject SYSTEM message from client", async () => {
    const { handlers } = createSocketWithHandlers("u1");

    const callback = vi.fn();
    await handlers["chatroom:message"](
      {
        roomId: "room-1",
        content: "System update",
        messageType: "SYSTEM",
      },
      callback,
    );

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false }),
    );
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });
});
