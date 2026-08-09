import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getDirectChatRoom,
  emitMessageCreated,
  emitMessageEdited,
  emitMessageDeleted,
  emitInboxUpdated,
  emitDirectChatRead,
  emitChatRoomRead,
  registerDirectChat,
} from "../../../src/sockets/direct-chat";
import { assertDirectChatAccess } from "../../../src/middleware/socketAccess";
import { ApiError } from "../../../src/lib/ApiError";

vi.mock("../../../src/middleware/socketAccess", () => ({
  assertRoomAccess: vi.fn().mockResolvedValue(undefined),
  assertDirectChatAccess: vi.fn().mockResolvedValue(undefined),
}));

function createIo() {
  const emit = vi.fn();
  const io = { to: vi.fn().mockReturnValue({ emit }) } as any;
  return { io, emit };
}

function createSocketWithHandlers(userId = "u1") {
  const handlers: Record<string, (payload: any) => Promise<void> | void> = {};
  const socket = {
    id: "socket-1",
    data: { user: { id: userId, username: "user1" } },
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn(),
    on: vi.fn((event: string, handler: (payload: any) => Promise<void>) => {
      handlers[event] = handler;
    }),
  } as any;

  registerDirectChat({} as any, socket);

  return { socket, handlers };
}

describe("direct-chat socket helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should namespace the direct chat room by id", () => {
    expect(getDirectChatRoom("dc1")).toBe("directChat:dc1");
  });

  it.each([
    ["message:new", emitMessageCreated],
    ["message:edited", emitMessageEdited],
    ["message:deleted", emitMessageDeleted],
    ["inbox:update", emitInboxUpdated],
    ["directChat:read", emitDirectChatRead],
    ["chatroom:read", emitChatRoomRead],
  ])("should emit %s to the target room", (event, emitter) => {
    const { io, emit } = createIo();
    const payload = { id: "x" } as any;

    (emitter as (io: any, room: string, payload: any) => void)(
      io,
      "directChat:dc1",
      payload,
    );

    expect(io.to).toHaveBeenCalledWith("directChat:dc1");
    expect(emit).toHaveBeenCalledWith(event, payload);
  });
});

describe("registerDirectChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertDirectChatAccess).mockResolvedValue(undefined as any);
  });

  it("should join the room and acknowledge the client", async () => {
    const { socket, handlers } = createSocketWithHandlers();

    await handlers["directChat:join"]!({ directChatId: "dc1" });

    expect(assertDirectChatAccess).toHaveBeenCalledWith("u1", "dc1");
    expect(socket.join).toHaveBeenCalledWith("directChat:dc1");
    expect(socket.emit).toHaveBeenCalledWith("directChat:joined", {
      directChatId: "dc1",
    });
  });

  it("should surface the ApiError code when joining is not allowed", async () => {
    vi.mocked(assertDirectChatAccess).mockRejectedValueOnce(
      new ApiError("Not a participant", 403, "DIRECT_CHAT_ACCESS_DENIED"),
    );
    const { socket, handlers } = createSocketWithHandlers();

    await handlers["directChat:join"]!({ directChatId: "dc1" });

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith("directChat:error", {
      code: "DIRECT_CHAT_ACCESS_DENIED",
      message: "Not a participant",
    });
  });

  it("should fall back to JOIN_FAILED for errors without a code", async () => {
    vi.mocked(assertDirectChatAccess).mockRejectedValueOnce(
      new Error("db down"),
    );
    const { socket, handlers } = createSocketWithHandlers();

    await handlers["directChat:join"]!({ directChatId: "dc1" });

    expect(socket.emit).toHaveBeenCalledWith("directChat:error", {
      code: "JOIN_FAILED",
      message: "db down",
    });
  });

  it("should fall back to a generic message when a non-Error is thrown on join", async () => {
    vi.mocked(assertDirectChatAccess).mockRejectedValueOnce("boom" as any);
    const { socket, handlers } = createSocketWithHandlers();

    await handlers["directChat:join"]!({ directChatId: "dc1" });

    expect(socket.emit).toHaveBeenCalledWith("directChat:error", {
      code: "JOIN_FAILED",
      message: "Failed to join chat",
    });
  });

  it("should leave the room and acknowledge the client", async () => {
    const { socket, handlers } = createSocketWithHandlers();

    await handlers["directChat:leave"]!({ directChatId: "dc1" });

    expect(socket.leave).toHaveBeenCalledWith("directChat:dc1");
    expect(socket.emit).toHaveBeenCalledWith("directChat:left", {
      directChatId: "dc1",
    });
  });

  it("should surface the ApiError code when leaving is not allowed", async () => {
    vi.mocked(assertDirectChatAccess).mockRejectedValueOnce(
      new ApiError("Not a participant", 403, "DIRECT_CHAT_ACCESS_DENIED"),
    );
    const { socket, handlers } = createSocketWithHandlers();

    await handlers["directChat:leave"]!({ directChatId: "dc1" });

    expect(socket.leave).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith("directChat:error", {
      code: "DIRECT_CHAT_ACCESS_DENIED",
      message: "Not a participant",
    });
  });

  it("should fall back to LEAVE_FAILED for non-Error rejections", async () => {
    vi.mocked(assertDirectChatAccess).mockRejectedValueOnce("boom" as any);
    const { socket, handlers } = createSocketWithHandlers();

    await handlers["directChat:leave"]!({ directChatId: "dc1" });

    expect(socket.emit).toHaveBeenCalledWith("directChat:error", {
      code: "LEAVE_FAILED",
      message: "Failed to leave chat",
    });
  });
});
