import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  emitDmCallConnected,
  emitDmCallParticipantJoined,
  emitDmCallParticipantLeft,
  registerDirectChat,
} from "../../../src/sockets/direct-chat";
import { assertDirectChatAccess } from "../../../src/middleware/socketAccess";
import { ApiError } from "../../../src/lib/ApiError";

vi.mock("../../../src/middleware/socketAccess", () => ({
  assertRoomAccess: vi.fn().mockResolvedValue(undefined),
  assertDirectChatAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/services/direct-chat/call", () => ({
  handleLiveKitConnected: vi.fn().mockResolvedValue({ connected: false }),
  handleLiveKitDisconnected: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../db/prisma", () => ({
  prisma: {
    callSession: {
      findUnique: vi.fn(),
    },
  },
}));

const { handleLiveKitConnected, handleLiveKitDisconnected } = vi.mocked(
  await import("../../../src/services/direct-chat/call"),
);
const { prisma } = vi.mocked(await import("../../../db/prisma"));

function createIo() {
  const emit = vi.fn();
  const io = { to: vi.fn().mockReturnValue({ emit }) } as any;
  return { io, emit };
}

function createSocketWithHandlers(
  userId = "u1",
  user: Record<string, unknown> = {},
) {
  const handlers: Record<string, (payload: any) => Promise<void> | void> = {};
  const broadcastEmit = vi.fn();
  const socket = {
    id: "socket-1",
    data: {
      user: { id: userId, username: "user1", displayName: "User 1", ...user },
    },
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn(),
    broadcast: { to: vi.fn().mockReturnValue({ emit: broadcastEmit }) },
    on: vi.fn((event: string, handler: (payload: any) => Promise<void>) => {
      handlers[event] = handler;
    }),
  } as any;

  registerDirectChat({} as any, socket);

  return { socket, handlers, broadcastEmit };
}

describe("DM call emit helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emitDmCallConnected sends dmCall:connected to the room", () => {
    const { io, emit } = createIo();
    emitDmCallConnected(io, "directChat:dc1", {
      directChatId: "dc1",
      sessionId: "sess1",
      connectedAt: new Date(),
    });
    expect(io.to).toHaveBeenCalledWith("directChat:dc1");
    expect(emit).toHaveBeenCalledWith("dmCall:connected", expect.anything());
  });

  it("emitDmCallParticipantJoined sends dmCall:participant.joined to the room", () => {
    const { io, emit } = createIo();
    emitDmCallParticipantJoined(io, "directChat:dc1", {
      directChatId: "dc1",
      sessionId: "sess1",
      userId: "u1",
      user: { id: "u1", username: "u1", displayName: null, avatar: null },
    });
    expect(emit).toHaveBeenCalledWith(
      "dmCall:participant.joined",
      expect.anything(),
    );
  });

  it("emitDmCallParticipantLeft sends dmCall:participant.left to the room", () => {
    const { io, emit } = createIo();
    emitDmCallParticipantLeft(io, "directChat:dc1", {
      directChatId: "dc1",
      sessionId: "sess1",
      userId: "u1",
    });
    expect(emit).toHaveBeenCalledWith(
      "dmCall:participant.left",
      expect.anything(),
    );
  });
});

describe("dmCall:livekitConnected handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertDirectChatAccess).mockResolvedValue(undefined as any);
  });

  it("emits participant.joined and calls handleLiveKitConnected", async () => {
    vi.mocked(handleLiveKitConnected).mockResolvedValue({ connected: false });
    vi.mocked(prisma.callSession.findUnique).mockResolvedValue({
      directChatId: "dc1",
    } as any);
    const { io, emit } = createIo();
    const { socket, handlers } = createSocketWithHandlers();

    registerDirectChat(io, socket);

    await handlers["dmCall:livekitConnected"]!({ sessionId: "sess1" });

    expect(handleLiveKitConnected).toHaveBeenCalledWith("u1", "sess1");
    expect(emit).toHaveBeenCalledWith(
      "dmCall:participant.joined",
      expect.objectContaining({ sessionId: "sess1" }),
    );
  });

  it("emits dmCall:connected when both participants are connected", async () => {
    vi.mocked(handleLiveKitConnected).mockResolvedValue({ connected: true });
    vi.mocked(prisma.callSession.findUnique)
      .mockResolvedValueOnce({ directChatId: "dc1" } as any)
      .mockResolvedValueOnce({ connectedAt: new Date() } as any);
    const { io, emit } = createIo();
    const { socket, handlers } = createSocketWithHandlers();

    registerDirectChat(io, socket);

    await handlers["dmCall:livekitConnected"]!({ sessionId: "sess1" });

    expect(emit).toHaveBeenCalledWith(
      "dmCall:connected",
      expect.objectContaining({ sessionId: "sess1" }),
    );
  });

  it("validates directChat access before broadcasting", async () => {
    vi.mocked(handleLiveKitConnected).mockResolvedValue({ connected: false });
    vi.mocked(prisma.callSession.findUnique).mockResolvedValue({
      directChatId: "dc1",
    } as any);
    const { io } = createIo();
    const { socket, handlers } = createSocketWithHandlers();

    registerDirectChat(io, socket);

    await handlers["dmCall:livekitConnected"]!({ sessionId: "sess1" });

    expect(assertDirectChatAccess).toHaveBeenCalledWith("u1", "dc1");
  });

  it("emits dmCall:error on access denial", async () => {
    vi.mocked(handleLiveKitConnected).mockResolvedValue({ connected: false });
    vi.mocked(prisma.callSession.findUnique).mockResolvedValue({
      directChatId: "dc1",
    } as any);
    vi.mocked(assertDirectChatAccess).mockRejectedValueOnce(
      new ApiError("No access", 403, "DIRECT_CHAT_ACCESS_DENIED"),
    );
    const { io } = createIo();
    const { socket, handlers } = createSocketWithHandlers();

    registerDirectChat(io, socket);

    await handlers["dmCall:livekitConnected"]!({ sessionId: "sess1" });

    expect(socket.emit).toHaveBeenCalledWith("dmCall:error", {
      code: "DIRECT_CHAT_ACCESS_DENIED",
      message: "No access",
    });
  });

  it("emits dmCall:error with generic message for unexpected errors", async () => {
    vi.mocked(handleLiveKitConnected).mockRejectedValue(new Error("db down"));
    const { io } = createIo();
    const { socket, handlers } = createSocketWithHandlers();

    registerDirectChat(io, socket);

    await handlers["dmCall:livekitConnected"]!({ sessionId: "sess1" });

    expect(socket.emit).toHaveBeenCalledWith("dmCall:error", {
      code: "LIVEKIT_CONNECTED_FAILED",
      message: "db down",
    });
  });

  it("silently ignores missing sessionId", async () => {
    const { io, emit } = createIo();
    const { handlers } = createSocketWithHandlers();
    registerDirectChat(io, createSocketWithHandlers().socket);

    // @ts-expect-error testing missing sessionId
    await handlers["dmCall:livekitConnected"]!({});

    expect(handleLiveKitConnected).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});

describe("dmCall:livekitDisconnected handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertDirectChatAccess).mockResolvedValue(undefined as any);
  });

  it("emits participant.left and calls handleLiveKitDisconnected", async () => {
    vi.mocked(prisma.callSession.findUnique).mockResolvedValue({
      directChatId: "dc1",
    } as any);
    const { io, emit } = createIo();
    const { socket, handlers } = createSocketWithHandlers();

    registerDirectChat(io, socket);

    await handlers["dmCall:livekitDisconnected"]!({ sessionId: "sess1" });

    expect(handleLiveKitDisconnected).toHaveBeenCalledWith("u1", "sess1");
    expect(emit).toHaveBeenCalledWith(
      "dmCall:participant.left",
      expect.objectContaining({ sessionId: "sess1", userId: "u1" }),
    );
  });

  it("validates directChat access before broadcasting", async () => {
    vi.mocked(prisma.callSession.findUnique).mockResolvedValue({
      directChatId: "dc1",
    } as any);
    const { io } = createIo();
    const { socket, handlers } = createSocketWithHandlers();

    registerDirectChat(io, socket);

    await handlers["dmCall:livekitDisconnected"]!({ sessionId: "sess1" });

    expect(assertDirectChatAccess).toHaveBeenCalledWith("u1", "dc1");
  });

  it("emits dmCall:error on failure", async () => {
    vi.mocked(handleLiveKitDisconnected).mockRejectedValue(
      new Error("redis down"),
    );
    vi.mocked(prisma.callSession.findUnique).mockResolvedValue({
      directChatId: "dc1",
    } as any);
    const { io } = createIo();
    const { socket, handlers } = createSocketWithHandlers();

    registerDirectChat(io, socket);

    await handlers["dmCall:livekitDisconnected"]!({ sessionId: "sess1" });

    expect(socket.emit).toHaveBeenCalledWith("dmCall:error", {
      code: "LIVEKIT_DISCONNECTED_FAILED",
      message: "redis down",
    });
  });
});

describe("dmCall:dismiss handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertDirectChatAccess).mockResolvedValue(undefined as any);
  });

  it("relays dismiss to the sender's user room for multi-device sync", async () => {
    vi.mocked(prisma.callSession.findUnique).mockResolvedValue({
      directChatId: "dc1",
    } as any);
    const { io, emit } = createIo();
    const { socket, handlers } = createSocketWithHandlers();

    registerDirectChat(io, socket);

    await handlers["dmCall:dismiss"]!({
      sessionId: "sess1",
      reason: "accepted",
    });

    expect(io.to).toHaveBeenCalledWith("user:u1");
    expect(emit).toHaveBeenCalledWith("dmCall:dismiss", {
      directChatId: "dc1",
      sessionId: "sess1",
      reason: "accepted",
    });
  });

  it("validates access before relaying", async () => {
    vi.mocked(prisma.callSession.findUnique).mockResolvedValue({
      directChatId: "dc1",
    } as any);
    const { io } = createIo();
    const { socket, handlers } = createSocketWithHandlers();

    registerDirectChat(io, socket);

    await handlers["dmCall:dismiss"]!({
      sessionId: "sess1",
      reason: "declined",
    });

    expect(assertDirectChatAccess).toHaveBeenCalledWith("u1", "dc1");
  });

  it("emits dmCall:error on access denial", async () => {
    vi.mocked(prisma.callSession.findUnique).mockResolvedValue({
      directChatId: "dc1",
    } as any);
    vi.mocked(assertDirectChatAccess).mockRejectedValueOnce(
      new ApiError("No access", 403, "DIRECT_CHAT_ACCESS_DENIED"),
    );
    const { io } = createIo();
    const { socket, handlers } = createSocketWithHandlers();

    registerDirectChat(io, socket);

    await handlers["dmCall:dismiss"]!({
      sessionId: "sess1",
      reason: "accepted",
    });

    expect(socket.emit).toHaveBeenCalledWith("dmCall:error", {
      code: "DIRECT_CHAT_ACCESS_DENIED",
      message: "No access",
    });
  });

  it("ignores invalid reason", async () => {
    const { io, emit } = createIo();
    const { socket, handlers } = createSocketWithHandlers();

    registerDirectChat(io, socket);

    await handlers["dmCall:dismiss"]!({
      sessionId: "sess1",
      reason: "invalid",
    });

    expect(emit).not.toHaveBeenCalled();
  });

  it("ignores missing sessionId", async () => {
    const { io, emit } = createIo();
    const { handlers } = createSocketWithHandlers();

    registerDirectChat(io, createSocketWithHandlers().socket);

    // @ts-expect-error testing missing sessionId
    await handlers["dmCall:dismiss"]!({ reason: "accepted" });

    expect(emit).not.toHaveBeenCalled();
  });
});
