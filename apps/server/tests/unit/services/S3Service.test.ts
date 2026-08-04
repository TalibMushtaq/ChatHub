import { describe, it, expect, vi, beforeEach } from "vitest";
import { S3Service } from "../../../../src/services/S3Service";
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

vi.mock("@aws-sdk/client-s3");
vi.mock("@aws-sdk/s3-request-presigner");

describe("S3Service", () => {
  const mockConfig = {
    region: "us-east-1",
    bucket: "test-bucket",
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
  };

  let s3Service: S3Service;

  beforeEach(() => {
    vi.clearAllMocks();
    s3Service = new S3Service(mockConfig);
  });

  it("should generate a presigned PUT URL", async () => {
    vi.mocked(getSignedUrl).mockResolvedValueOnce(
      "https://s3.mock/presigned-put",
    );

    const url = await s3Service.generatePresignedPutUrl(
      "test/key.jpg",
      "image/jpeg",
      300,
    );

    expect(url).toBe("https://s3.mock/presigned-put");
    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: "test-bucket",
      Key: "test/key.jpg",
      ContentType: "image/jpeg",
    });
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(PutObjectCommand),
      { expiresIn: 300 },
    );
  });

  it("should generate a presigned GET URL", async () => {
    vi.mocked(getSignedUrl).mockResolvedValueOnce(
      "https://s3.mock/presigned-get",
    );

    const url = await s3Service.generatePresignedGetUrl("test/key.jpg", 300);

    expect(url).toBe("https://s3.mock/presigned-get");
    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: "test-bucket",
      Key: "test/key.jpg",
    });
  });

  it("should return true when headObject finds the object", async () => {
    const mockSend = vi.fn().mockResolvedValueOnce({});
    (s3Service as any).client.send = mockSend;

    const exists = await s3Service.headObject("test/key.jpg");

    expect(exists).toBe(true);
    expect(HeadObjectCommand).toHaveBeenCalledWith({
      Bucket: "test-bucket",
      Key: "test/key.jpg",
    });
  });

  it("should return false when headObject does not find the object", async () => {
    const notFoundError = new Error("NotFound");
    (notFoundError as any).name = "NotFound";
    const mockSend = vi.fn().mockRejectedValueOnce(notFoundError);
    (s3Service as any).client.send = mockSend;

    const exists = await s3Service.headObject("test/key.jpg");

    expect(exists).toBe(false);
  });

  it("should delete an object", async () => {
    const mockSend = vi.fn().mockResolvedValueOnce({});
    (s3Service as any).client.send = mockSend;

    await s3Service.deleteObject("test/key.jpg");

    expect(DeleteObjectCommand).toHaveBeenCalledWith({
      Bucket: "test-bucket",
      Key: "test/key.jpg",
    });
  });
});
