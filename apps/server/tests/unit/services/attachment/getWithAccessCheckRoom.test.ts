import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAttachmentWithAccessCheck } from "../../../../src/services/attachment/getWithAccessCheck";
import { createMockS3Service, resetMockS3Service } from "../../../mocks/s3";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";
import { createChatRoomMember } from "../../../factories/room";

function createAttachmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "att-1",
    s3Key: "attachments/room/r1/uuid.jpg",
    filename: "photo.jpg",
    mimeType: "image/jpeg",
    size: 1024,
    width: null,
    height: null,
    thumbnailKey: null,
    status: "ATTACHED",
    uploaderId: "u1",
    Message: { chatRoomId: "r1", directChatId: null },
    ...overrides,
  } as any;
}

describe("getAttachmentWithAccessCheck - room and lookup branches", () => {
  const s3Service = createMockS3Service();

  beforeEach(() => {
    resetPrismaMock();
    resetMockS3Service(s3Service);
    vi.clearAllMocks();
  });

  it("should reject a missing attachment with 404", async () => {
    prismaMock.attachment.findUnique.mockResolvedValue(null);

    await expect(
      getAttachmentWithAccessCheck(s3Service, "missing", "u1"),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "ATTACHMENT_NOT_FOUND",
    });
  });

  it("should allow a room member to access a room attachment", async () => {
    prismaMock.attachment.findUnique.mockResolvedValue(createAttachmentRow());
    prismaMock.chatRoomMember.findUnique.mockResolvedValue(
      createChatRoomMember({ userId: "u1", chatRoomId: "r1" }) as any,
    );

    const result = await getAttachmentWithAccessCheck(s3Service, "att-1", "u1");

    expect(prismaMock.chatRoomMember.findUnique).toHaveBeenCalledWith({
      where: { userId_chatRoomId: { userId: "u1", chatRoomId: "r1" } },
    });
    expect(result.downloadUrl).toBe("https://s3.mock/presigned-get");
  });

  it("should reject a non-member of the room with 403", async () => {
    prismaMock.attachment.findUnique.mockResolvedValue(createAttachmentRow());
    prismaMock.chatRoomMember.findUnique.mockResolvedValue(null);

    await expect(
      getAttachmentWithAccessCheck(s3Service, "att-1", "u1"),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "ATTACHMENT_ACCESS_DENIED",
    });
    expect(s3Service.generatePresignedGetUrl).not.toHaveBeenCalled();
  });

  it("should reject when the referenced direct chat no longer exists", async () => {
    prismaMock.attachment.findUnique.mockResolvedValue(
      createAttachmentRow({
        Message: { chatRoomId: null, directChatId: "dc1" },
      }),
    );
    prismaMock.directChat.findUnique.mockResolvedValue(null);

    await expect(
      getAttachmentWithAccessCheck(s3Service, "att-1", "u1"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("should allow the second DM participant to access the attachment", async () => {
    prismaMock.attachment.findUnique.mockResolvedValue(
      createAttachmentRow({
        Message: { chatRoomId: null, directChatId: "dc1" },
      }),
    );
    prismaMock.directChat.findUnique.mockResolvedValue({
      id: "dc1",
      user1Id: "u9",
      user2Id: "u1",
    } as any);

    const result = await getAttachmentWithAccessCheck(s3Service, "att-1", "u1");

    expect(result.attachment.id).toBe("att-1");
  });

  it("should allow access to an ATTACHED attachment with no linked message", async () => {
    prismaMock.attachment.findUnique.mockResolvedValue(
      createAttachmentRow({ Message: null }),
    );

    const result = await getAttachmentWithAccessCheck(s3Service, "att-1", "u1");

    expect(prismaMock.chatRoomMember.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.directChat.findUnique).not.toHaveBeenCalled();
    expect(result.attachment.filename).toBe("photo.jpg");
  });
});
