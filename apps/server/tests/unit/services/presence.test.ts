import { describe, it, expect, vi, beforeEach } from "vitest";
import { redis } from "../../../src/lib/redis";
import {
  trackConnection,
  removeConnection,
  setIdle,
  getPresence,
  getAllUserIdsWithConnections,
  setUserStatus,
  syncPrivacyFlags,
  PRESENCE_TTL_S,
} from "../../../src/services/presence";

// Every redis command is a vi.fn (see tests/setup.ts), so tests drive the
// mock's return values and assert the command sequences presence issues.

const PROFILE = {
  status: "AVAILABLE",
  customStatus: null,
  showOnlineStatus: true,
  showTypingStatus: true,
};

const CONN_KEY = "presence:connections:u1";
const STATUS_KEY = "presence:status:u1";

function mockBlob(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    presence: "online",
    lastActiveAt: 1_700_000_000_000,
    ...PROFILE,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("trackConnection", () => {
  it("adds the socket to the user's connection set and writes an online blob", async () => {
    vi.mocked(redis.get).mockResolvedValue(null as never);

    await trackConnection("u1", "sock-1", PROFILE);

    expect(redis.sAdd).toHaveBeenCalledWith(CONN_KEY, "sock-1");
    expect(redis.expire).toHaveBeenCalledWith(CONN_KEY, PRESENCE_TTL_S);
    expect(redis.set).toHaveBeenCalledTimes(1);
    const [key, raw, opts] = vi.mocked(redis.set).mock.calls[0]!;
    expect(key).toBe(STATUS_KEY);
    expect(opts).toEqual({ EX: PRESENCE_TTL_S });
    const blob = JSON.parse(raw as string);
    expect(blob.presence).toBe("online");
    expect(blob.status).toBe("AVAILABLE");
    expect(blob.showOnlineStatus).toBe(true);
    expect(blob.lastActiveAt).toBeGreaterThan(0);
  });

  it("reuses an existing blob but refreshes presence and lastActiveAt", async () => {
    vi.mocked(redis.get).mockResolvedValue(
      mockBlob({
        presence: "idle",
        lastActiveAt: 100,
        status: "DND",
        showOnlineStatus: false,
      }) as never,
    );

    const state = await trackConnection("u1", "sock-2", PROFILE);

    // Manual status and privacy flags from the existing blob are preserved —
    // the connect-time profile never clobbers them.
    expect(state.status).toBe("DND");
    expect(state.showOnlineStatus).toBe(false);
    expect(state.presence).toBe("online");
    expect(state.lastActiveAt).toBeGreaterThan(100);
  });
});

describe("removeConnection", () => {
  it("does not mark the user offline while other tabs are connected", async () => {
    vi.mocked(redis.sMembers).mockResolvedValue(["sock-2"] as never);

    const wentOffline = await removeConnection("u1", "sock-1");

    expect(wentOffline).toBe(false);
    expect(redis.del).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("deletes the connection key and marks the blob offline on last tab", async () => {
    vi.mocked(redis.sMembers).mockResolvedValue([] as never);
    vi.mocked(redis.get).mockResolvedValue(mockBlob() as never);

    const wentOffline = await removeConnection("u1", "sock-1");

    expect(wentOffline).toBe(true);
    expect(redis.del).toHaveBeenCalledWith(CONN_KEY);
    const [, raw] = vi.mocked(redis.set).mock.calls[0]!;
    const blob = JSON.parse(raw as string);
    expect(blob.presence).toBe("offline");
  });

  it("returns offline even when there is no blob yet", async () => {
    vi.mocked(redis.sMembers).mockResolvedValue([] as never);
    vi.mocked(redis.get).mockResolvedValue(null as never);

    const wentOffline = await removeConnection("u1", "sock-1");

    expect(wentOffline).toBe(true);
    expect(redis.del).toHaveBeenCalledWith(CONN_KEY);
    expect(redis.set).not.toHaveBeenCalled();
  });
});

describe("setIdle", () => {
  it("flips an online user to idle", async () => {
    vi.mocked(redis.get).mockResolvedValue(mockBlob() as never);

    const state = await setIdle("u1");

    expect(state?.presence).toBe("idle");
    const [, raw] = vi.mocked(redis.set).mock.calls[0]!;
    expect(JSON.parse(raw as string).presence).toBe("idle");
  });

  it("is a no-op for absent, offline, and already-idle users", async () => {
    vi.mocked(redis.get).mockResolvedValue(null as never);
    expect(await setIdle("u1")).toBeNull();

    vi.mocked(redis.get).mockResolvedValue(
      mockBlob({ presence: "offline" }) as never,
    );
    expect(await setIdle("u1")).toBeNull();

    vi.mocked(redis.set).mockClear();
    vi.mocked(redis.get).mockResolvedValue(
      mockBlob({ presence: "idle" }) as never,
    );
    const state = await setIdle("u1");
    expect(state?.presence).toBe("idle");
    // Already idle -> no write.
    expect(redis.set).not.toHaveBeenCalled();
  });
});

describe("getPresence", () => {
  it("returns the parsed blob or null when absent/corrupt", async () => {
    vi.mocked(redis.get).mockResolvedValue(mockBlob() as never);
    const state = await getPresence("u1");
    expect(state?.presence).toBe("online");

    vi.mocked(redis.get).mockResolvedValue(null as never);
    expect(await getPresence("u1")).toBeNull();

    vi.mocked(redis.get).mockResolvedValue("{not json" as never);
    expect(await getPresence("u1")).toBeNull();
  });
});

describe("getAllUserIdsWithConnections", () => {
  it("strips the prefix from presence keys", async () => {
    vi.mocked(redis.keys).mockResolvedValue([
      "presence:connections:u1",
      "presence:connections:u2",
    ] as never);

    const ids = await getAllUserIdsWithConnections();
    expect(ids).toEqual(["u1", "u2"]);
  });
});

describe("setUserStatus", () => {
  it("updates status and customStatus in the blob", async () => {
    vi.mocked(redis.get).mockResolvedValue(mockBlob() as never);

    const state = await setUserStatus("u1", "DND", "In a meeting");

    expect(state?.status).toBe("DND");
    expect(state?.customStatus).toBe("In a meeting");
    const [, raw] = vi.mocked(redis.set).mock.calls[0]!;
    const blob = JSON.parse(raw as string);
    expect(blob.status).toBe("DND");
    expect(blob.customStatus).toBe("In a meeting");
    // presence/lastActiveAt untouched
    expect(blob.presence).toBe("online");
  });

  it("is a no-op when the user has no blob (offline)", async () => {
    vi.mocked(redis.get).mockResolvedValue(null as never);
    expect(await setUserStatus("u1", "BUSY", null)).toBeNull();
    expect(redis.set).not.toHaveBeenCalled();
  });
});

describe("syncPrivacyFlags", () => {
  it("updates only the privacy flags in the blob", async () => {
    vi.mocked(redis.get).mockResolvedValue(mockBlob() as never);

    const state = await syncPrivacyFlags("u1", {
      showOnlineStatus: false,
      showTypingStatus: false,
    });

    expect(state?.showOnlineStatus).toBe(false);
    expect(state?.showTypingStatus).toBe(false);
    const [, raw] = vi.mocked(redis.set).mock.calls[0]!;
    const blob = JSON.parse(raw as string);
    expect(blob.showOnlineStatus).toBe(false);
    expect(blob.showTypingStatus).toBe(false);
    expect(blob.status).toBe("AVAILABLE");
  });

  it("is a no-op when the user has no blob (offline)", async () => {
    vi.mocked(redis.get).mockResolvedValue(null as never);
    expect(
      await syncPrivacyFlags("u1", {
        showOnlineStatus: false,
        showTypingStatus: true,
      }),
    ).toBeNull();
    expect(redis.set).not.toHaveBeenCalled();
  });
});
