import { describe, it, expect, vi, beforeEach } from "vitest";
import webpush from "web-push";
import { pushFriendRequestEvent } from "../../../../src/services/push/push";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

vi.mock("web-push", () => ({
  default: { sendNotification: vi.fn(), setVapidDetails: vi.fn() },
}));

vi.mock("../../../../src/lib/webPush", () => ({
  isWebPushConfigured: vi.fn(() => true),
  getVapidPublicKey: vi.fn(() => "pubkey"),
}));

import { isWebPushConfigured } from "../../../../src/lib/webPush";

describe("pushFriendRequestEvent", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    vi.mocked(isWebPushConfigured).mockReturnValue(true);
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as never);
  });

  it("sends to the recipient's subscriptions with a friend-request payload", async () => {
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { endpoint: "https://push.example/sub1", p256dh: "a", auth: "b" },
    ] as any);

    await pushFriendRequestEvent({
      event: "new",
      requestId: "fr1",
      fromId: "u1",
      fromName: "Alice",
      toUserId: "u2",
    });

    expect(prismaMock.pushSubscription.findMany).toHaveBeenCalledWith({
      where: { userId: "u2" },
    });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const [, payload] = vi.mocked(webpush.sendNotification).mock.calls[0]!;
    expect(JSON.parse(payload as string)).toMatchObject({
      title: "Alice",
      body: "sent you a friend request",
      tag: "chathubby:friend-request:fr1",
      data: {
        kind: "friend-request",
        event: "new",
        requestId: "fr1",
        fromId: "u1",
        fromName: "Alice",
      },
    });
  });

  it("does nothing when the recipient has no subscriptions", async () => {
    prismaMock.pushSubscription.findMany.mockResolvedValue([] as any);

    await pushFriendRequestEvent({
      event: "accepted",
      requestId: "fr1",
      fromId: "u2",
      fromName: "Bob",
      toUserId: "u1",
    });

    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("does nothing when Web Push is not configured", async () => {
    vi.mocked(isWebPushConfigured).mockReturnValue(false);

    await pushFriendRequestEvent({
      event: "new",
      requestId: "fr1",
      fromId: "u1",
      fromName: "Alice",
      toUserId: "u2",
    });

    expect(prismaMock.pushSubscription.findMany).not.toHaveBeenCalled();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("prunes dead subscriptions (404/410) without failing the rest", async () => {
    const err = new Error("gone");
    (err as { statusCode?: number }).statusCode = 410;
    vi.mocked(webpush.sendNotification).mockRejectedValue(err);
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { endpoint: "https://push.example/sub1", p256dh: "a", auth: "b" },
    ] as any);
    prismaMock.pushSubscription.deleteMany.mockResolvedValue({
      count: 1,
    } as any);

    await pushFriendRequestEvent({
      event: "new",
      requestId: "fr1",
      fromId: "u1",
      fromName: "Alice",
      toUserId: "u2",
    });

    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: "https://push.example/sub1" },
    });
  });
});
