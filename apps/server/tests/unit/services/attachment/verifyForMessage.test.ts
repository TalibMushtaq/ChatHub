import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyAttachmentsForMessage } from "../../../../src/services/attachment/verifyForMessage";
import { createMockS3Service, resetMockS3Service } from "../../../mocks/s3";

describe("verifyAttachmentsForMessage", () => {
  const s3Service = createMockS3Service();
  const tx = {
    attachment: {
      findMany: vi.fn(),
    },
  } as any;

  beforeEach(() => {
    resetMockS3Service(s3Service);
    vi.clearAllMocks();
  });

  it("should verify all attachments successfully", async () => {
    tx.attachment.findMany.mockResolvedValue([
      { id: "att-1", status: "PENDING", uploaderId: "u1", s3Key: "key-1" },
      { id: "att-2", status: "PENDING", uploaderId: "u1", s3Key: "key-2" },
    ]);

    const result = await verifyAttachmentsForMessage(
      tx,
      s3Service,
      ["att-1", "att-2"],
      "u1",
    );

    expect(result).toHaveLength(2);
    expect(s3Service.headObject).toHaveBeenCalledTimes(2);
  });

  it("should reject if attachment count mismatch", async () => {
    tx.attachment.findMany.mockResolvedValue([
      { id: "att-1", status: "PENDING", uploaderId: "u1", s3Key: "key-1" },
    ]);

    await expect(
      verifyAttachmentsForMessage(tx, s3Service, ["att-1", "att-2"], "u1"),
    ).rejects.toThrow("One or more attachments do not exist");
  });

  it("should reject if S3 object does not exist", async () => {
    tx.attachment.findMany.mockResolvedValue([
      { id: "att-1", status: "PENDING", uploaderId: "u1", s3Key: "key-1" },
    ]);
    s3Service.headObject.mockResolvedValue(false);

    await expect(
      verifyAttachmentsForMessage(tx, s3Service, ["att-1"], "u1"),
    ).rejects.toThrow("object not found in storage");
  });
});
