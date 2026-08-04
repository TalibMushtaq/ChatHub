import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAttachmentWithAccessCheck } from "../../../../src/services/attachment/getWithAccessCheck";
import { createMockS3Service, resetMockS3Service } from "../../../mocks/s3";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

describe("getAttachmentWithAccessCheck", () => {
  const s3Service = createMockS3Service();

  beforeEach(() => {
    resetPrismaMock();
    resetMockS3Service(s3Service);
    vi.clearAllMocks();
  });

  it("should allow DM participant to access attachment", async () => {
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
      uploaderId: "u1",
      Message: {
        chatRoomId: null,
        directChatId: "dc1",
      },
    } as any);

    prismaMock.directChat.findUnique.mockResolvedValue({
      id: "dc1",
      user1Id: "u1",
      user2Id: "u2",
    } as any);

    const result = await getAttachmentWithAccessCheck(s3Service, "att-1", "u1");

    expect(result.attachment.filename).toBe("photo.jpg");
    expect(result.downloadUrl).toBe("https://s3.mock/presigned-get");
  });

  it("should allow PENDING attachment uploader to access", async () => {
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
      uploaderId: "u1",
      Message: null,
    } as any);

    const result = await getAttachmentWithAccessCheck(s3Service, "att-1", "u1");

    expect(result.attachment.filename).toBe("photo.jpg");
  });
});
