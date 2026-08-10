import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendMessage } from "../../../../src/services/direct-chat/sendMessage";
import {
  prismaMock,
  resetPrismaMock,
  createMockTransaction,
} from "../../../mocks/prisma";
import { createMockS3Service, resetMockS3Service } from "../../../mocks/s3";
import { createMessage } from "../../../factories/room";
import {
  checkIdempotency,
  storeIdempotency,
} from "../../../../src/services/idempotency";

vi.mock("../../../../src/services/idempotency", () => ({
  checkIdempotency: vi.fn().mockResolvedValue(null),
  storeIdempotency: vi.fn().mockResolvedValue(undefined),
}));

describe("sendMessage - idempotency branches", () => {
  const s3Service = createMockS3Service();

  beforeEach(() => {
    resetPrismaMock();
    resetMockS3Service(s3Service);
    vi.clearAllMocks();
  });

  it("should store the idempotency key after a successful send", async () => {
    const msg = createMessage({ id: "msg-1", directChatId: "dc1" });
    vi.mocked(checkIdempotency).mockResolvedValueOnce(null);
    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.create.mockResolvedValue(msg as any);
    prismaMock.directChat.update.mockResolvedValue({ id: "dc1" } as any);

    await sendMessage(
      "dc1",
      "u1",
      { content: "hi", messageType: "TEXT", idempotencyKey: "key-1" },
      s3Service,
    );

    expect(checkIdempotency).toHaveBeenCalledWith("u1", "key-1");
    expect(storeIdempotency).toHaveBeenCalledWith("u1", "key-1", "msg-1");
  });

  it("should not touch idempotency storage when no key is provided", async () => {
    const msg = createMessage({ id: "msg-2", directChatId: "dc1" });
    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.create.mockResolvedValue(msg as any);
    prismaMock.directChat.update.mockResolvedValue({ id: "dc1" } as any);

    await sendMessage(
      "dc1",
      "u1",
      { content: "hi", messageType: "TEXT" },
      s3Service,
    );

    expect(checkIdempotency).not.toHaveBeenCalled();
    expect(storeIdempotency).not.toHaveBeenCalled();
  });

  it("should re-send when the idempotency key points at a deleted message", async () => {
    const msg = createMessage({ id: "msg-3", directChatId: "dc1" });
    vi.mocked(checkIdempotency).mockResolvedValueOnce("msg-gone");
    prismaMock.message.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.create.mockResolvedValue(msg as any);
    prismaMock.directChat.update.mockResolvedValue({ id: "dc1" } as any);

    const result = await sendMessage(
      "dc1",
      "u1",
      { content: "hi", messageType: "TEXT", idempotencyKey: "key-3" },
      s3Service,
    );

    expect(result.id).toBe("msg-3");
    expect(storeIdempotency).toHaveBeenCalledWith("u1", "key-3", "msg-3");
  });
});
