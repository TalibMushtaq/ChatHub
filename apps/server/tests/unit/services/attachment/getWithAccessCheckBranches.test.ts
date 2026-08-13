import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAttachmentWithAccessCheck } from "../../../../src/services/attachment/getWithAccessCheck";
import { createMockS3Service, resetMockS3Service } from "../../../mocks/s3";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

describe("getAttachmentWithAccessCheck - branches", () => {
  const s3Service = createMockS3Service();

  beforeEach(() => {
    resetPrismaMock();
    resetMockS3Service(s3Service);
    vi.clearAllMocks();
  });

  it("should reject DM non-participant", async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({
      id: "att-1",
      s3Key: "attachments/dm/dc1/uuid.jpg",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
      width: null,
      height: null,
      thumbnailKey: null,
      status: "ATTACHED",
      uploaderId: "u2",
      Message: {
        chatRoomId: null,
        directChatId: "dc1",
      },
    } as any);

    prismaMock.directChat.findUnique.mockResolvedValue({
      id: "dc1",
      user1Id: "u2",
      user2Id: "u3",
    } as any);

    await expect(
      getAttachmentWithAccessCheck(s3Service, "att-1", "u1"),
    ).rejects.toThrow("You do not have access to this attachment");
  });

  it("should reject PENDING attachment for non-uploader", async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({
      id: "att-1",
      s3Key: "attachments/dm/dc1/uuid.jpg",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
      width: null,
      height: null,
      thumbnailKey: null,
      status: "PENDING",
      uploaderId: "u2",
      Message: null,
    } as any);

    await expect(
      getAttachmentWithAccessCheck(s3Service, "att-1", "u1"),
    ).rejects.toThrow("You do not have access to this attachment");
  });
});
