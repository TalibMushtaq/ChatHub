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

// Mock idempotency service
vi.mock("../../../../src/services/idempotency", () => ({
  checkIdempotency: vi.fn().mockResolvedValue(null),
  storeIdempotency: vi.fn().mockResolvedValue(undefined),
}));

describe("sendMessage with attachments", () => {
  const s3Service = createMockS3Service();

  beforeEach(() => {
    resetPrismaMock();
    resetMockS3Service(s3Service);
    vi.clearAllMocks();
  });

  it("should create a TEXT message without attachments", async () => {
    const msg = createMessage({
      directChatId: "dc1",
      senderId: "u1",
      content: "hi",
      messageType: "TEXT",
    });

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.create.mockResolvedValue(msg as any);
    prismaMock.message.findUnique.mockResolvedValue(msg as any);
    prismaMock.directChat.update.mockResolvedValue({ id: "dc1" } as any);

    const result = await sendMessage(
      "dc1",
      "u1",
      {
        content: "hi",
        messageType: "TEXT",
      },
      s3Service,
    );

    expect(prismaMock.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: "hi",
          senderId: "u1",
          directChatId: "dc1",
          messageType: "TEXT",
        }),
      }),
    );
    expect(prismaMock.message.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: msg.id },
      }),
    );
    expect(prismaMock.directChat.update).toHaveBeenCalledWith({
      where: { id: "dc1" },
      data: { lastMessageAt: expect.any(Date) },
    });
    expect(result).toEqual(msg);
  });

  it("should create an IMAGE message with attachments", async () => {
    const msg = createMessage({
      directChatId: "dc1",
      senderId: "u1",
      content: null,
      messageType: "IMAGE",
    });

    const msgWithAttachments = {
      ...msg,
      attachments: [
        {
          id: "att-1",
          filename: "photo.jpg",
          mimeType: "image/jpeg",
          size: 12345,
          width: null,
          height: null,
          thumbnailKey: null,
        },
      ],
    };

    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.message.create.mockResolvedValue(msg as any);
    prismaMock.message.findUnique.mockResolvedValue(msgWithAttachments as any);
    prismaMock.attachment.findMany.mockResolvedValue([
      {
        id: "att-1",
        status: "PENDING",
        uploaderId: "u1",
        s3Key: "attachments/dm/dc1/uuid.jpg",
      },
    ] as any);
    prismaMock.attachment.updateMany.mockResolvedValue({ count: 1 } as any);
    prismaMock.directChat.update.mockResolvedValue({ id: "dc1" } as any);

    const result = await sendMessage(
      "dc1",
      "u1",
      {
        content: undefined,
        messageType: "IMAGE",
        attachmentIds: ["att-1"],
      },
      s3Service,
    );

    expect(prismaMock.attachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["att-1"] } },
      }),
    );
    expect(prismaMock.attachment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["att-1"] } },
        data: { status: "ATTACHED", messageId: msg.id },
      }),
    );
    expect(prismaMock.message.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: msg.id },
      }),
    );
    expect(result).toEqual(msgWithAttachments);
    expect(result.attachments).toHaveLength(1);
  });

  it("should reject attachment hijacking", async () => {
    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.attachment.findMany.mockResolvedValue([
      {
        id: "att-1",
        status: "PENDING",
        uploaderId: "u2", // different user
        s3Key: "attachments/dm/dc1/uuid.jpg",
      },
    ] as any);

    await expect(
      sendMessage(
        "dc1",
        "u1",
        {
          content: undefined,
          messageType: "IMAGE",
          attachmentIds: ["att-1"],
        },
        s3Service,
      ),
    ).rejects.toThrow("does not belong to you");
  });

  it("should reject already-attached attachments", async () => {
    prismaMock.$transaction.mockImplementation(
      createMockTransaction(prismaMock),
    );
    prismaMock.attachment.findMany.mockResolvedValue([
      {
        id: "att-1",
        status: "ATTACHED",
        uploaderId: "u1",
        s3Key: "attachments/dm/dc1/uuid.jpg",
      },
    ] as any);

    await expect(
      sendMessage(
        "dc1",
        "u1",
        {
          content: undefined,
          messageType: "IMAGE",
          attachmentIds: ["att-1"],
        },
        s3Service,
      ),
    ).rejects.toThrow("already been used");
  });

  it("should return existing message on idempotency hit", async () => {
    const existingMsg = createMessage({
      id: "msg-existing",
      directChatId: "dc1",
      senderId: "u1",
      content: "hello",
      messageType: "TEXT",
    });

    vi.mocked(checkIdempotency).mockResolvedValueOnce("msg-existing");
    prismaMock.message.findUnique.mockResolvedValue(existingMsg as any);

    const result = await sendMessage(
      "dc1",
      "u1",
      {
        content: "hello",
        messageType: "TEXT",
        idempotencyKey: "same-key",
      },
      s3Service,
    );

    expect(result.id).toBe("msg-existing");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(storeIdempotency).not.toHaveBeenCalled();
  });
});
