import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMessages } from "../../../../src/services/room/getMessages";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";
import { createMessage } from "../../../factories/room";

describe("getMessages (room)", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should return messages without cursor (legacy)", async () => {
    const messages = [createMessage(), createMessage()];
    prismaMock.message.findMany.mockResolvedValue(messages as any);

    const result = await getMessages("r1", {});

    expect(result.messages).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
    expect(prismaMock.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { chatRoomId: "r1" },
        orderBy: { createdAt: "asc" },
        take: 50,
      }),
    );
  });

  it("should respect custom limit capped at MAX_PAGE_SIZE", async () => {
    prismaMock.message.findMany.mockResolvedValue([]);

    await getMessages("r1", { limit: 200 });

    expect(prismaMock.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });

  it("should paginate backwards with cursor", async () => {
    const messages = [createMessage(), createMessage()];
    prismaMock.message.findMany.mockResolvedValue(messages as any);

    const result = await getMessages("r1", {
      cursor: "m1",
      direction: "before",
      limit: 10,
    });

    expect(prismaMock.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { chatRoomId: "r1" },
        orderBy: { createdAt: "asc" },
        skip: 1,
        cursor: { id: "m1" },
        take: -10,
      }),
    );
    expect(result.nextCursor).toBe(messages[0]?.id ?? null);
  });

  it("should return nextCursor null when no messages are returned", async () => {
    prismaMock.message.findMany.mockResolvedValue([]);

    const result = await getMessages("r1", {
      cursor: "m1",
      direction: "before",
    });

    expect(result.nextCursor).toBeNull();
  });
});
