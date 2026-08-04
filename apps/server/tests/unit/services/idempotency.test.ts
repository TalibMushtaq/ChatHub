import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkIdempotency,
  storeIdempotency,
} from "../../../src/services/idempotency";

// Mock Redis
const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();

vi.mock("../../../src/lib/redis", () => ({
  redis: {
    get: (...args: any[]) => mockRedisGet(...args),
    set: (...args: any[]) => mockRedisSet(...args),
  },
}));

describe("idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checkIdempotency should return messageId if key exists", async () => {
    mockRedisGet.mockResolvedValue("msg-123");

    const result = await checkIdempotency("user-1", "key-abc");

    expect(result).toBe("msg-123");
    expect(mockRedisGet).toHaveBeenCalledWith("idempotency:user-1:key-abc");
  });

  it("checkIdempotency should return null if key does not exist", async () => {
    mockRedisGet.mockResolvedValue(null);

    const result = await checkIdempotency("user-1", "key-xyz");

    expect(result).toBeNull();
  });

  it("storeIdempotency should set key with TTL", async () => {
    mockRedisSet.mockResolvedValue("OK");

    await storeIdempotency("user-1", "key-abc", "msg-123");

    expect(mockRedisSet).toHaveBeenCalledWith(
      "idempotency:user-1:key-abc",
      "msg-123",
      { EX: 86400 },
    );
  });
});
