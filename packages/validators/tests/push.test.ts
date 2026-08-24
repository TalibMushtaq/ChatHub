import { describe, it, expect } from "vitest";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "../src/push";

// ---------------------------------------------------------------------------
// pushSubscribeSchema
// ---------------------------------------------------------------------------
describe("pushSubscribeSchema", () => {
  it("accepts valid subscription", () => {
    const result = pushSubscribeSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      keys: {
        p256dh: "base64key123",
        auth: "authkey456",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing endpoint", () => {
    const result = pushSubscribeSchema.safeParse({
      keys: { p256dh: "key", auth: "auth" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid endpoint URL", () => {
    const result = pushSubscribeSchema.safeParse({
      endpoint: "not-a-url",
      keys: { p256dh: "key", auth: "auth" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing keys", () => {
    const result = pushSubscribeSchema.safeParse({
      endpoint: "https://example.com/push",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing p256dh", () => {
    const result = pushSubscribeSchema.safeParse({
      endpoint: "https://example.com/push",
      keys: { auth: "auth" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing auth", () => {
    const result = pushSubscribeSchema.safeParse({
      endpoint: "https://example.com/push",
      keys: { p256dh: "key" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty p256dh", () => {
    const result = pushSubscribeSchema.safeParse({
      endpoint: "https://example.com/push",
      keys: { p256dh: "", auth: "auth" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty auth", () => {
    const result = pushSubscribeSchema.safeParse({
      endpoint: "https://example.com/push",
      keys: { p256dh: "key", auth: "" },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pushUnsubscribeSchema
// ---------------------------------------------------------------------------
describe("pushUnsubscribeSchema", () => {
  it("accepts valid endpoint", () => {
    const result = pushUnsubscribeSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing endpoint", () => {
    const result = pushUnsubscribeSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid endpoint URL", () => {
    const result = pushUnsubscribeSchema.safeParse({
      endpoint: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});
