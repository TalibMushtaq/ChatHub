import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerRoomChat } from "../../../../src/routes/room/roomChat";
import { assertRoomAccess } from "../../../src/middleware/socketAccess";
import { ApiError } from "../../../src/lib/ApiError";

vi.mock("../../../src/middleware/socketAccess", () => ({
  assertRoomAccess: vi.fn().mockResolvedValue(undefined),
  assertDirectChatAccess: vi.fn().mockResolvedValue(undefined),
}));

describe("registerRoomChat - typing", () => {
  const mockIo = {
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
  } as any;

  function createSocketWithHandlers(
    userId: string,
    user: Record<string, unknown> = {},
  ) {
    const handlers: Record<string, (...args: unknown[]) => unknown> = {};
    const broadcastEmit = vi.fn();
    const socket = {
      id: "socket-1",
      data: {
        user: { id: userId, username: "user1", ...user },
        rooms: new Map<string, number>([["room-1", Date.now() + 60_000]]),
      },
      request: { session: {} },
      join: vi.fn(),
      leave: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
      broadcast: { to: vi.fn().mockReturnValue({ emit: broadcastEmit }) },
      on: vi
        .fn()
        .mockImplementation(
          (event: string, handler: (...args: unknown[]) => unknown) => {
            handlers[event] = handler;
          },
        ),
    } as any;

    registerRoomChat(mockIo, socket);

    return { socket, handlers, broadcastEmit };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertRoomAccess).mockResolvedValue(undefined as any);
  });

  it("should broadcast typing to the room, excluding the sender", async () => {
    const { socket, handlers, broadcastEmit } = createSocketWithHandlers("u1");

    await handlers["chatroom:typing"]!({
      chatRoomId: "room-1",
      isTyping: true,
    });

    expect(socket.broadcast.to).toHaveBeenCalledWith("room:room-1");
    expect(broadcastEmit).toHaveBeenCalledWith("chatroom:typing", {
      userId: "u1",
      username: "user1",
      chatRoomId: "room-1",
      isTyping: true,
    });
  });

  it("should always relay the stop event even when throttled", async () => {
    vi.useFakeTimers();
    const { handlers, broadcastEmit } = createSocketWithHandlers("u1");

    await handlers["chatroom:typing"]!({
      chatRoomId: "room-1",
      isTyping: true,
    });
    expect(broadcastEmit).toHaveBeenCalledTimes(1);

    // A second start within the window is dropped…
    await handlers["chatroom:typing"]!({
      chatRoomId: "room-1",
      isTyping: true,
    });
    expect(broadcastEmit).toHaveBeenCalledTimes(1);

    // …but the final stop is never throttled.
    await handlers["chatroom:typing"]!({
      chatRoomId: "room-1",
      isTyping: false,
    });
    expect(broadcastEmit).toHaveBeenCalledWith("chatroom:typing", {
      userId: "u1",
      username: "user1",
      chatRoomId: "room-1",
      isTyping: false,
    });
    expect(broadcastEmit).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("should surface access denial as an error", async () => {
    vi.mocked(assertRoomAccess).mockRejectedValueOnce(
      new ApiError("Not a member", 403, "FORBIDDEN"),
    );
    const { socket, handlers } = createSocketWithHandlers("u1");
    // Drop the cached membership so the handler actually hits the DB check.
    socket.data.rooms.delete("room-1");

    await handlers["chatroom:typing"]!({
      chatRoomId: "room-1",
      isTyping: true,
    });

    expect(socket.emit).toHaveBeenCalledWith("chatroom:error", {
      code: "FORBIDDEN",
      message: "Not a member",
    });
  });

  it("should ignore malformed payloads", async () => {
    const { handlers, broadcastEmit } = createSocketWithHandlers("u1");

    await handlers["chatroom:typing"]!({ chatRoomId: "room-1" });
    await handlers["chatroom:typing"]!({ isTyping: true });

    expect(broadcastEmit).not.toHaveBeenCalled();
  });

  it("should not emit typing for users who disabled typing visibility", async () => {
    const { handlers, broadcastEmit } = createSocketWithHandlers("u1", {
      showTypingStatus: false,
    });

    await handlers["chatroom:typing"]!({
      chatRoomId: "room-1",
      isTyping: true,
    });
    await handlers["chatroom:typing"]!({
      chatRoomId: "room-1",
      isTyping: false,
    });

    expect(broadcastEmit).not.toHaveBeenCalled();
  });
});
