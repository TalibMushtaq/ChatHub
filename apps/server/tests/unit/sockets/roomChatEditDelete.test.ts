import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerRoomChat } from "../../../../src/routes/room/roomChat";
import { prismaMock, resetPrismaMock } from "../../mocks/prisma";

vi.mock("../../../src/middleware/socketAccess", () => ({
  assertRoomAccess: vi.fn().mockResolvedValue(undefined),
  assertDirectChatAccess: vi.fn().mockResolvedValue(undefined),
}));

describe("registerRoomChat - edit and delete", () => {
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
  });

  describe("chatroom:message:edit", () => {
    it("should edit a message and broadcast chatroom:message:edited", async () => {
      const { handlers } = createSocketWithHandlers("u1");

      prismaMock.message.findFirst.mockResolvedValue({
        id: "msg-1",
        senderId: "u1",
        chatRoomId: "room-1",
        isDeleted: false,
        createdAt: new Date(Date.now() - 60_000), // 1 min ago
      } as any);

      prismaMock.message.update.mockResolvedValue({
        id: "msg-1",
        content: "updated content",
        editedAt: new Date(),
        chatRoomId: "room-1",
      } as any);

      const callback = vi.fn();
      await handlers["chatroom:message:edit"](
        {
          chatRoomId: "room-1",
          messageId: "msg-1",
          content: "updated content",
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true }),
      );
      expect(mockIo.to).toHaveBeenCalledWith("room:room-1");
    });

    it("should reject edit from non-sender", async () => {
      const { handlers } = createSocketWithHandlers("u2");

      prismaMock.message.findFirst.mockResolvedValue({
        id: "msg-1",
        senderId: "u1",
        chatRoomId: "room-1",
        isDeleted: false,
        createdAt: new Date(Date.now() - 60_000),
      } as any);

      const callback = vi.fn();
      await handlers["chatroom:message:edit"](
        {
          chatRoomId: "room-1",
          messageId: "msg-1",
          content: "hacked",
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false, code: "FORBIDDEN" }),
      );
    });

    it("should reject edit after 5-minute window", async () => {
      const { handlers } = createSocketWithHandlers("u1");

      prismaMock.message.findFirst.mockResolvedValue({
        id: "msg-1",
        senderId: "u1",
        chatRoomId: "room-1",
        isDeleted: false,
        createdAt: new Date(Date.now() - 10 * 60_000), // 10 min ago
      } as any);

      const callback = vi.fn();
      await handlers["chatroom:message:edit"](
        {
          chatRoomId: "room-1",
          messageId: "msg-1",
          content: "too late",
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false, code: "EDIT_WINDOW_EXPIRED" }),
      );
    });

    it("should reject edit of deleted message", async () => {
      const { handlers } = createSocketWithHandlers("u1");

      prismaMock.message.findFirst.mockResolvedValue({
        id: "msg-1",
        senderId: "u1",
        chatRoomId: "room-1",
        isDeleted: true,
        createdAt: new Date(Date.now() - 60_000),
      } as any);

      const callback = vi.fn();
      await handlers["chatroom:message:edit"](
        {
          chatRoomId: "room-1",
          messageId: "msg-1",
          content: "nope",
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false, code: "MESSAGE_NOT_FOUND" }),
      );
    });

    it("should reject edit of a message that belongs to another conversation", async () => {
      const { handlers } = createSocketWithHandlers("u1");

      // The service scopes the lookup to the authorized room, so a message
      // stored against a different room (or a DM, where chatRoomId is null)
      // must not be found.
      prismaMock.message.findFirst.mockImplementation((async (args: any) =>
        args?.where?.chatRoomId === "room-1"
          ? null
          : {
              id: "msg-1",
              senderId: "u1",
              chatRoomId: null,
              isDeleted: false,
              createdAt: new Date(Date.now() - 60_000),
            }) as any);

      const callback = vi.fn();
      await handlers["chatroom:message:edit"](
        {
          chatRoomId: "room-1",
          messageId: "msg-1",
          content: "cross-room edit",
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false, code: "MESSAGE_NOT_FOUND" }),
      );
      expect(prismaMock.message.update).not.toHaveBeenCalled();
      expect(mockIo.to).not.toHaveBeenCalled();
    });

    it("should scope the edit lookup to the authorized room", async () => {
      const { handlers } = createSocketWithHandlers("u1");

      prismaMock.message.findFirst.mockResolvedValue({
        id: "msg-1",
        senderId: "u1",
        chatRoomId: "room-1",
        isDeleted: false,
        createdAt: new Date(Date.now() - 60_000),
      } as any);
      prismaMock.message.update.mockResolvedValue({
        id: "msg-1",
        content: "updated",
        editedAt: new Date(),
        chatRoomId: "room-1",
      } as any);

      await handlers["chatroom:message:edit"](
        {
          chatRoomId: "room-1",
          messageId: "msg-1",
          content: "updated",
        },
        vi.fn(),
      );

      expect(prismaMock.message.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "msg-1", chatRoomId: "room-1" },
        }),
      );
    });

    it("should reject edit with invalid payload", async () => {
      const { handlers } = createSocketWithHandlers("u1");

      const callback = vi.fn();
      await handlers["chatroom:message:edit"](
        {
          chatRoomId: "room-1",
          // missing messageId
          content: "test",
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false }),
      );
    });
  });

  describe("chatroom:message:delete", () => {
    it("should delete a message and broadcast chatroom:message:deleted", async () => {
      const { handlers } = createSocketWithHandlers("u1");

      prismaMock.message.findFirst.mockResolvedValue({
        id: "msg-1",
        senderId: "u1",
        chatRoomId: "room-1",
        isDeleted: false,
        createdAt: new Date(Date.now() - 60_000),
      } as any);

      prismaMock.message.update.mockResolvedValue({
        id: "msg-1",
        chatRoomId: "room-1",
        deletedAt: new Date(),
      } as any);

      const callback = vi.fn();
      await handlers["chatroom:message:delete"](
        {
          chatRoomId: "room-1",
          messageId: "msg-1",
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true }),
      );
      expect(mockIo.to).toHaveBeenCalledWith("room:room-1");
    });

    it("should reject delete from non-sender", async () => {
      const { handlers } = createSocketWithHandlers("u2");

      prismaMock.message.findFirst.mockResolvedValue({
        id: "msg-1",
        senderId: "u1",
        chatRoomId: "room-1",
        isDeleted: false,
        createdAt: new Date(Date.now() - 60_000),
      } as any);

      const callback = vi.fn();
      await handlers["chatroom:message:delete"](
        {
          chatRoomId: "room-1",
          messageId: "msg-1",
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false, code: "FORBIDDEN" }),
      );
    });

    it("should reject delete after 30-minute window", async () => {
      const { handlers } = createSocketWithHandlers("u1");

      prismaMock.message.findFirst.mockResolvedValue({
        id: "msg-1",
        senderId: "u1",
        chatRoomId: "room-1",
        isDeleted: false,
        createdAt: new Date(Date.now() - 31 * 60_000), // 31 min ago
      } as any);

      const callback = vi.fn();
      await handlers["chatroom:message:delete"](
        {
          chatRoomId: "room-1",
          messageId: "msg-1",
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false, code: "DELETE_WINDOW_EXPIRED" }),
      );
    });

    it("should reject delete of already-deleted message", async () => {
      const { handlers } = createSocketWithHandlers("u1");

      prismaMock.message.findFirst.mockResolvedValue({
        id: "msg-1",
        senderId: "u1",
        chatRoomId: "room-1",
        isDeleted: true,
        createdAt: new Date(Date.now() - 60_000),
      } as any);

      const callback = vi.fn();
      await handlers["chatroom:message:delete"](
        {
          chatRoomId: "room-1",
          messageId: "msg-1",
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false, code: "ALREADY_DELETED" }),
      );
    });

    it("should reject delete of a message that belongs to another conversation", async () => {
      const { handlers } = createSocketWithHandlers("u1");

      prismaMock.message.findFirst.mockImplementation((async (args: any) =>
        args?.where?.chatRoomId === "room-1"
          ? null
          : {
              id: "msg-1",
              senderId: "u1",
              chatRoomId: null,
              isDeleted: false,
              createdAt: new Date(Date.now() - 60_000),
            }) as any);

      const callback = vi.fn();
      await handlers["chatroom:message:delete"](
        {
          chatRoomId: "room-1",
          messageId: "msg-1",
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false, code: "MESSAGE_NOT_FOUND" }),
      );
      expect(prismaMock.message.update).not.toHaveBeenCalled();
      expect(mockIo.to).not.toHaveBeenCalled();
    });

    it("should scope the delete lookup to the authorized room", async () => {
      const { handlers } = createSocketWithHandlers("u1");

      prismaMock.message.findFirst.mockResolvedValue({
        id: "msg-1",
        senderId: "u1",
        chatRoomId: "room-1",
        isDeleted: false,
        createdAt: new Date(Date.now() - 60_000),
      } as any);
      prismaMock.message.update.mockResolvedValue({
        id: "msg-1",
        chatRoomId: "room-1",
        deletedAt: new Date(),
      } as any);

      await handlers["chatroom:message:delete"](
        { chatRoomId: "room-1", messageId: "msg-1" },
        vi.fn(),
      );

      expect(prismaMock.message.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "msg-1", chatRoomId: "room-1" },
        }),
      );
    });

    it("should reject delete with invalid payload", async () => {
      const { handlers } = createSocketWithHandlers("u1");

      const callback = vi.fn();
      await handlers["chatroom:message:delete"](
        {
          chatRoomId: "room-1",
          // missing messageId
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false }),
      );
    });
  });
});
