import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { redis } from "../../../src/lib/redis";
import { prismaMock } from "../../mocks/prisma";
import {
  publicPresencePayload,
  toOwnPresencePayload,
  broadcastPresenceChanged,
  broadcastPresenceHidden,
  emitPresenceSnapshot,
  registerPresence,
  sweepIdleUsers,
  startPresenceSweeper,
} from "../../../src/sockets/presence";

const VISIBLE_BLOB = {
  presence: "online",
  status: "BUSY",
  customStatus: "Deep focus",
  lastActiveAt: 1_700_000_000_000,
  showOnlineStatus: true,
  showTypingStatus: true,
};

const INVISIBLE_BLOB = {
  presence: "online",
  status: "INVISIBLE",
  customStatus: "stealth",
  lastActiveAt: 1_700_000_000_000,
  showOnlineStatus: true,
  showTypingStatus: true,
};

const HIDDEN_BLOB = {
  ...VISIBLE_BLOB,
  showOnlineStatus: false,
};

function createIo() {
  const ownEmit = vi.fn();
  const othersEmit = vi.fn();
  const io = {
    to: vi.fn().mockReturnValue({ emit: ownEmit }),
    except: vi.fn().mockReturnValue({ emit: othersEmit }),
  } as any;
  return { io, ownEmit, othersEmit };
}

function createSocket(
  user: Record<string, unknown> = {
    id: "u1",
    username: "user1",
    status: "AVAILABLE",
    customStatus: null,
    showOnlineStatus: true,
    showTypingStatus: true,
  },
) {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {};
  const socket = {
    id: "sock-1",
    data: { user },
    emit: vi.fn(),
    on: vi
      .fn()
      .mockImplementation((event: string, handler: (...args: unknown[]) => unknown) => {
        handlers[event] = handler;
      }),
  } as any;
  return { socket, handlers };
}

function mockBlob(blob: Record<string, unknown>) {
  return JSON.stringify(blob) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(redis.keys).mockResolvedValue([] as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("publicPresencePayload", () => {
  it("returns the real presence for a visible user", () => {
    expect(publicPresencePayload("u1", VISIBLE_BLOB)).toEqual({
      userId: "u1",
      presence: "online",
      status: "BUSY",
      customStatus: "Deep focus",
    });
  });

  it("forces INVISIBLE users to appear offline with no status", () => {
    expect(publicPresencePayload("u1", INVISIBLE_BLOB)).toEqual({
      userId: "u1",
      presence: "offline",
      status: null,
      customStatus: null,
    });
  });

  it("returns null when the user hides online presence entirely", () => {
    expect(publicPresencePayload("u1", HIDDEN_BLOB)).toBeNull();
  });
});

describe("toOwnPresencePayload", () => {
  it("always returns real values, even for INVISIBLE users", () => {
    expect(toOwnPresencePayload("u1", INVISIBLE_BLOB)).toEqual({
      userId: "u1",
      presence: "online",
      status: "INVISIBLE",
      customStatus: "stealth",
    });
  });
});

describe("broadcastPresenceChanged", () => {
  it("emits real presence to the own room and gated presence to others", async () => {
    vi.mocked(redis.get).mockResolvedValue(mockBlob(VISIBLE_BLOB));
    const { io, ownEmit, othersEmit } = createIo();

    await broadcastPresenceChanged(io, "u1");

    expect(io.to).toHaveBeenCalledWith("user:u1");
    expect(ownEmit).toHaveBeenCalledWith("presence:changed", {
      userId: "u1",
      presence: "online",
      status: "BUSY",
      customStatus: "Deep focus",
    });
    expect(io.except).toHaveBeenCalledWith("user:u1");
    expect(othersEmit).toHaveBeenCalledWith("presence:changed", {
      userId: "u1",
      presence: "online",
      status: "BUSY",
      customStatus: "Deep focus",
    });
  });

  it("sends real presence to the own room but 'offline' to others for INVISIBLE", async () => {
    vi.mocked(redis.get).mockResolvedValue(mockBlob(INVISIBLE_BLOB));
    const { io, ownEmit, othersEmit } = createIo();

    await broadcastPresenceChanged(io, "u1");

    expect(ownEmit).toHaveBeenCalledWith("presence:changed", {
      userId: "u1",
      presence: "online",
      status: "INVISIBLE",
      customStatus: "stealth",
    });
    expect(othersEmit).toHaveBeenCalledWith("presence:changed", {
      userId: "u1",
      presence: "offline",
      status: null,
      customStatus: null,
    });
  });

  it("does not broadcast to others when online presence is hidden", async () => {
    vi.mocked(redis.get).mockResolvedValue(mockBlob(HIDDEN_BLOB));
    const { io, ownEmit } = createIo();

    await broadcastPresenceChanged(io, "u1");

    expect(ownEmit).toHaveBeenCalledTimes(1);
    expect(io.except).not.toHaveBeenCalled();
  });

  it("is a silent no-op when there is no presence blob", async () => {
    vi.mocked(redis.get).mockResolvedValue(null as never);
    const { io, ownEmit } = createIo();

    await broadcastPresenceChanged(io, "u1");

    expect(io.to).not.toHaveBeenCalled();
    expect(ownEmit).not.toHaveBeenCalled();
  });
});

describe("broadcastPresenceHidden", () => {
  it("emits an offline payload to everyone except the user's own room", () => {
    const { io, othersEmit } = createIo();

    broadcastPresenceHidden(io, "u1");

    expect(io.except).toHaveBeenCalledWith("user:u1");
    expect(othersEmit).toHaveBeenCalledWith("presence:changed", {
      userId: "u1",
      presence: "offline",
      status: null,
      customStatus: null,
    });
  });
});

describe("emitPresenceSnapshot", () => {
  it("sends gated presence for every present user except the socket owner", async () => {
    vi.mocked(redis.keys).mockResolvedValue([
      "presence:connections:u1",
      "presence:connections:u2",
      "presence:connections:u3",
      "presence:connections:u4",
    ] as never);
    vi.mocked(redis.get).mockImplementation(
      async (key: string) =>
        (key.endsWith(":u1")
          ? mockBlob(VISIBLE_BLOB) // owner -> skipped
          : key.endsWith(":u2")
            ? mockBlob(INVISIBLE_BLOB)
            : key.endsWith(":u3")
              ? mockBlob(VISIBLE_BLOB)
              : key.endsWith(":u4")
                ? mockBlob(HIDDEN_BLOB) // hidden -> skipped
                : null) as never,
    );

    const { io } = createIo();
    const { socket } = createSocket({ ...createSocket().socket.data.user, id: "u1" });

    await emitPresenceSnapshot(io, socket);

    const emits = socket.emit.mock.calls;
    expect(emits).toHaveLength(2);
    expect(emits[0]).toEqual([
      "presence:changed",
      { userId: "u2", presence: "offline", status: null, customStatus: null },
    ]);
    expect(emits[1]).toEqual([
      "presence:changed",
      {
        userId: "u3",
        presence: "online",
        status: "BUSY",
        customStatus: "Deep focus",
      },
    ]);
  });
});

describe("registerPresence", () => {
  it("tracks the heartbeat as a connection and broadcasts the new presence", async () => {
    vi.mocked(redis.get).mockResolvedValue(mockBlob(VISIBLE_BLOB));
    const { io, ownEmit } = createIo();
    const { socket, handlers } = createSocket();

    registerPresence(io, socket);
    await handlers["presence:heartbeat"]!();

    expect(redis.sAdd).toHaveBeenCalledWith("presence:connections:u1", "sock-1");
    expect(ownEmit).toHaveBeenCalledWith("presence:changed", {
      userId: "u1",
      presence: "online",
      status: "BUSY",
      customStatus: "Deep focus",
    });
  });

  it("persists a valid presence:setStatus and keeps socket.data fresh", async () => {
    prismaMock.user.update.mockResolvedValue({
      id: "u1",
      status: "DND",
      customStatus: "In a meeting",
    } as any);
    // After the DB write, the blob reflects the new status.
    vi.mocked(redis.get).mockResolvedValue(
      mockBlob({ ...VISIBLE_BLOB, status: "DND", customStatus: "In a meeting" }),
    );

    const { io, ownEmit } = createIo();
    const { socket, handlers } = createSocket();

    registerPresence(io, socket);
    await handlers["presence:setStatus"]!({
      status: "DND",
      customStatus: "In a meeting",
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { status: "DND", customStatus: "In a meeting" },
      select: { id: true, status: true, customStatus: true },
    });
    expect(socket.data.user.status).toBe("DND");
    expect(socket.data.user.customStatus).toBe("In a meeting");
    expect(ownEmit).toHaveBeenCalledWith("presence:changed", {
      userId: "u1",
      presence: "online",
      status: "DND",
      customStatus: "In a meeting",
    });
  });

  it("ignores invalid or empty presence:setStatus payloads", async () => {
    const { io } = createIo();
    const { socket, handlers } = createSocket();

    registerPresence(io, socket);
    await handlers["presence:setStatus"]!({ status: "NOPE" });
    await handlers["presence:setStatus"]!({ foo: "bar" });
    await handlers["presence:setStatus"]!({});

    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("normalizes an empty custom status to null", async () => {
    prismaMock.user.update.mockResolvedValue({
      id: "u1",
      status: "AVAILABLE",
      customStatus: null,
    } as any);
    vi.mocked(redis.get).mockResolvedValue(mockBlob(VISIBLE_BLOB));

    const { io } = createIo();
    const { socket, handlers } = createSocket();

    registerPresence(io, socket);
    await handlers["presence:setStatus"]!({ customStatus: "  " });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { customStatus: null },
      select: { id: true, status: true, customStatus: true },
    });
  });
});

describe("sweepIdleUsers", () => {
  it("marks stale users idle and broadcasts, leaving fresh ones alone", async () => {
    const now = Date.now();

    // Stateful redis mock so the write performed by setIdle is what
    // broadcastPresenceChanged reads back (presence "idle").
    const store = new Map<string, string>();
    const blobFor = (overrides: Record<string, unknown>) =>
      mockBlob({ ...VISIBLE_BLOB, ...overrides });
    store.set("presence:status:stale", blobFor({ lastActiveAt: now - 10 * 60_000 }));
    store.set("presence:status:fresh", blobFor({ lastActiveAt: now - 10_000 }));
    store.set(
      "presence:status:offline",
      blobFor({ presence: "offline", lastActiveAt: now - 10 * 60_000 }),
    );

    vi.mocked(redis.keys).mockResolvedValue([
      "presence:connections:stale",
      "presence:connections:fresh",
      "presence:connections:offline",
    ] as never);
    vi.mocked(redis.get).mockImplementation(
      async (key: string) => (store.get(key as string) ?? null) as never,
    );
    vi.mocked(redis.set).mockImplementation(
      async (key: string, value: string) => {
        store.set(key as string, value as string);
        return "OK" as never;
      },
    );

    const { io, ownEmit, othersEmit } = createIo();

    await sweepIdleUsers(io);

    // stale -> blob flipped to idle, broadcast (own room real, others gated).
    expect(JSON.parse(store.get("presence:status:stale")!).presence).toBe("idle");
    expect(io.to).toHaveBeenCalledWith("user:stale");
    expect(ownEmit).toHaveBeenCalledWith(
      "presence:changed",
      expect.objectContaining({ userId: "stale", presence: "idle" }),
    );
    expect(othersEmit).toHaveBeenCalledWith(
      "presence:changed",
      expect.objectContaining({ userId: "stale", presence: "idle" }),
    );

    // fresh and offline -> untouched, no broadcast.
    expect(JSON.parse(store.get("presence:status:fresh")!).presence).toBe("online");
    expect(JSON.parse(store.get("presence:status:offline")!).presence).toBe("offline");
    expect(io.to).not.toHaveBeenCalledWith("user:fresh");
    expect(io.to).not.toHaveBeenCalledWith("user:offline");
  });
});

describe("startPresenceSweeper", () => {
  it("runs the idle sweep on its interval", () => {
    vi.useFakeTimers();
    const { io } = createIo();
    vi.mocked(redis.keys).mockResolvedValue([] as never);

    const timer = startPresenceSweeper(io);
    vi.advanceTimersByTime(60_000);

    expect(redis.keys).toHaveBeenCalledWith("presence:connections:*");

    clearInterval(timer);
    vi.useRealTimers();
  });
});
