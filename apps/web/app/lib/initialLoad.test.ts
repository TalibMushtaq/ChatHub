import { describe, expect, it, vi } from "vitest";
import {
  loadInitialState,
  type InitialLoadApi,
  type InitialLoadCallbacks,
} from "./initialLoad";
import type {
  AppUser,
  DMInboxEntry,
  RoomInboxEntry,
} from "../../components/app/types";

const user: AppUser = {
  id: "u1",
  email: "ada@example.com",
  username: "ada",
  displayName: null,
  avatar: null,
  bio: null,
  gender: null,
  dateOfBirth: null,
  status: "AVAILABLE",
  customStatus: null,
  showOnlineStatus: true,
  showTypingStatus: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const dmItems: DMInboxEntry[] = [
  {
    directChatId: "dm1",
    otherUser: { id: "u2", username: "bob", displayName: null, avatar: null },
    lastMessage: {
      id: "m1",
      content: "hi",
      messageType: "text",
      createdAt: "2026-01-01T00:00:00.000Z",
      isDeleted: false,
    },
    unreadCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const roomItems: RoomInboxEntry[] = [
  {
    roomId: "r1",
    name: "General",
    description: null,
    createdBy: "u1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    myRole: "OWNER",
    lastMessage: {
      id: "m2",
      content: "yo",
      messageType: "text",
      createdAt: "2026-01-01T00:00:00.000Z",
      isDeleted: false,
    },
    memberCount: 1,
    unreadCount: 0,
  },
];

function callbacks(): {
  cb: InitialLoadCallbacks;
  calls: Record<string, unknown[]>;
} {
  const calls: Record<string, unknown[]> = {};
  const track =
    (name: string) =>
    (...args: unknown[]) => {
      calls[name] = args;
    };
  return {
    cb: {
      onUser: track("onUser"),
      onLists: track("onLists"),
      onUnauthorized: track("onUnauthorized"),
      onLoadError: track("onLoadError"),
      onListError: track("onListError"),
      onDone: track("onDone"),
    },
    calls,
  };
}

function api(overrides: Partial<InitialLoadApi> = {}): InitialLoadApi {
  return {
    getMe: vi.fn().mockResolvedValue(user),
    getDmInbox: vi.fn().mockResolvedValue({ items: dmItems, nextCursor: null }),
    getRooms: vi.fn().mockResolvedValue({ items: roomItems, nextCursor: null }),
    ...overrides,
  };
}

describe("loadInitialState", () => {
  it("surfaces the user, then loads both lists and signals done", async () => {
    const { cb, calls } = callbacks();

    await loadInitialState(api(), cb);

    expect(calls.onUser).toEqual([user]);
    expect(calls.onLists).toEqual([dmItems, roomItems]);
    expect(calls.onDone).toEqual([]);
    expect(calls.onUnauthorized).toBeUndefined();
    expect(calls.onLoadError).toBeUndefined();
    expect(calls.onListError).toBeUndefined();
  });

  it("redirects to auth when /auth/me returns 401, without touching the shell state", async () => {
    const { cb, calls } = callbacks();

    await loadInitialState(
      api({
        getMe: vi
          .fn()
          .mockRejectedValue({ isAxiosError: true, response: { status: 401 } }),
      }),
      cb,
    );

    expect(calls.onUnauthorized).toEqual([]);
    expect(calls.onUser).toBeUndefined();
    expect(calls.onLists).toBeUndefined();
    expect(calls.onDone).toBeUndefined();
    expect(calls.onListError).toBeUndefined();
    expect(calls.onLoadError).toBeUndefined();
  });

  it("reports an auth failure message when /auth/me errors with a server message", async () => {
    const { cb, calls } = callbacks();

    await loadInitialState(
      api({
        getMe: vi.fn().mockRejectedValue({
          isAxiosError: true,
          response: { status: 500, data: { error: "Something broke" } },
        }),
      }),
      cb,
    );

    expect(calls.onLoadError).toEqual(["Something broke"]);
    expect(calls.onUser).toBeUndefined();
    expect(calls.onDone).toBeUndefined();
  });

  it("falls back to a generic message on a non-axios /auth/me error", async () => {
    const { cb, calls } = callbacks();

    await loadInitialState(
      api({ getMe: vi.fn().mockRejectedValue("raw string") }),
      cb,
    );

    expect(calls.onLoadError).toEqual(["Couldn't reach the server"]);
    expect(calls.onUser).toBeUndefined();
    expect(calls.onDone).toBeUndefined();
  });

  it("still surfaces the user when the inbox fails, only reporting the list error", async () => {
    const { cb, calls } = callbacks();

    await loadInitialState(
      api({ getDmInbox: vi.fn().mockRejectedValue(new Error("boom")) }),
      cb,
    );

    expect(calls.onUser).toEqual([user]);
    expect(calls.onLists).toBeUndefined();
    expect(calls.onListError).toEqual(["Couldn't load your conversations"]);
    expect(calls.onDone).toEqual([]);
  });

  it("still surfaces the user when the rooms fail, only reporting the list error", async () => {
    const { cb, calls } = callbacks();

    await loadInitialState(
      api({ getRooms: vi.fn().mockRejectedValue(new Error("boom")) }),
      cb,
    );

    expect(calls.onUser).toEqual([user]);
    expect(calls.onLists).toBeUndefined();
    expect(calls.onListError).toEqual(["Couldn't load your conversations"]);
    expect(calls.onDone).toEqual([]);
  });
});
