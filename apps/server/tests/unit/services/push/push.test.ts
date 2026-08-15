import { describe, it, expect, vi, beforeEach } from "vitest";
import webpush from "web-push";
import {
  pushNewMessage,
  upsertPushSubscription,
  deletePushSubscription,
} from "../../../../src/services/push/push";
import {
  prismaMock,
  resetPrismaMock,
} from "../../../mocks/prisma";

vi.mock("web-push", () => ({
  default: { sendNotification: vi.fn(), setVapidDetails: vi.fn() },
}));

vi.mock("../../../../src/lib/webPush", () => ({
  isWebPushConfigured: vi.fn(() => true),
  getVapidPublicKey: vi.fn(() => "pubkey"),
}));

import { isWebPushConfigured } from "../../../../src/lib/webPush";

describe("pushNewMessage", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    vi.mocked(isWebPushConfigured).mockReturnValue(true);
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as never);
  });

  it("skips SYSTEM messages", async () => {
    await pushNewMessage({
      kind: "room",
      conversationId: "r1",
      messageId: "m1",
      senderId: "u1",
      senderName: "Server",
      messageType: "SYSTEM",
      content: "welcome",
    });

    expect(prismaMock.directChat.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.chatRoomMember.findMany).not.toHaveBeenCalled();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("notifies only the other DM participant, excluding the sender", async () => {
    prismaMock.directChat.findUnique.mockResolvedValue({
      user1Id: "u1",
      user2Id: "u2",
    } as any);
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { endpoint: "https://push.example/sub1", p256dh: "a", auth: "b" },
    ] as any);

    await pushNewMessage({
      kind: "dm",
      conversationId: "d1",
      messageId: "m1",
      senderId: "u1",
      senderName: "Alice",
      messageType: "TEXT",
      content: "hi",
    });

    expect(prismaMock.pushSubscription.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ["u2"] } },
    });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const [, payload] = vi.mocked(webpush.sendNotification).mock.calls[0]!;
    expect(JSON.parse(payload as string)).toMatchObject({
      title: "Alice",
      body: "hi",
      tag: "chathubby:m1",
      data: { kind: "dm", conversationId: "d1", messageId: "m1" },
    });
  });

  it("resolves room members excluding the sender and uses the room name", async () => {
    prismaMock.chatRoomMember.findMany.mockResolvedValue([
      { userId: "u2", ChatRoom: { name: "Games" } },
      { userId: "u3", ChatRoom: { name: "Games" } },
    ] as any);
    prismaMock.pushSubscription.findMany.mockResolvedValue([] as any);

    await pushNewMessage({
      kind: "room",
      conversationId: "r1",
      messageId: "m2",
      senderId: "u1",
      senderName: "Bob",
      messageType: "TEXT",
      content: "yo",
    });

    expect(prismaMock.pushSubscription.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ["u2", "u3"] } },
    });
  });

  it("prunes subscriptions that return 404/410", async () => {
    const err = new Error("gone");
    (err as { statusCode?: number }).statusCode = 410;
    vi.mocked(webpush.sendNotification).mockRejectedValue(err);
    prismaMock.directChat.findUnique.mockResolvedValue({
      user1Id: "u1",
      user2Id: "u2",
    } as any);
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { endpoint: "https://push.example/sub1", p256dh: "a", auth: "b" },
    ] as any);
    prismaMock.pushSubscription.deleteMany.mockResolvedValue({
      count: 1,
    } as any);

    await pushNewMessage({
      kind: "dm",
      conversationId: "d1",
      messageId: "m3",
      senderId: "u1",
      senderName: "Alice",
      messageType: "TEXT",
      content: "hi",
    });

    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: "https://push.example/sub1" },
    });
  });

  it("does nothing when Web Push is not configured", async () => {
    vi.mocked(isWebPushConfigured).mockReturnValue(false);

    await pushNewMessage({
      kind: "dm",
      conversationId: "d1",
      messageId: "m4",
      senderId: "u1",
      senderName: "Alice",
      messageType: "TEXT",
      content: "hi",
    });

    expect(prismaMock.directChat.findUnique).not.toHaveBeenCalled();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});

describe("upsertPushSubscription", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("creates or refreshes the subscription keyed by endpoint", async () => {
    prismaMock.pushSubscription.upsert.mockResolvedValue({} as any);

    await upsertPushSubscription("u1", "https://push.example/sub1", {
      p256dh: "a",
      auth: "b",
    });

    expect(prismaMock.pushSubscription.upsert).toHaveBeenCalledWith({
      where: { endpoint: "https://push.example/sub1" },
      create: {
        userId: "u1",
        endpoint: "https://push.example/sub1",
        p256dh: "a",
        auth: "b",
      },
      update: { userId: "u1", p256dh: "a", auth: "b" },
    });
  });
});

describe("deletePushSubscription", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("deletes only the caller's subscription for an endpoint", async () => {
    prismaMock.pushSubscription.deleteMany.mockResolvedValue({
      count: 1,
    } as any);

    await deletePushSubscription("u1", "https://push.example/sub1");

    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", endpoint: "https://push.example/sub1" },
    });
  });
});
