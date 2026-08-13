import { describe, it, expect, vi } from "vitest";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { testS3Connection } from "../../../src/lib/s3HealthCheck";
import { getOptionalS3Service } from "../../../src/lib/s3";
import type { S3Service } from "../../../src/services/S3Service";

vi.mock("../../../src/lib/s3", () => ({
  getOptionalS3Service: vi.fn(),
}));

describe("testS3Connection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when S3 is not configured", async () => {
    vi.mocked(getOptionalS3Service).mockReturnValue(null);
    await expect(testS3Connection()).resolves.toBe(false);
  });

  it("returns true when HeadBucket succeeds", async () => {
    const send = vi.fn().mockResolvedValue({});
    vi.mocked(getOptionalS3Service).mockReturnValue({
      getClient: () => ({ send }),
      getBucket: () => "test-bucket",
    } as unknown as S3Service);

    await expect(testS3Connection()).resolves.toBe(true);
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(expect.any(HeadBucketCommand));
  });

  it("returns false and logs when HeadBucket fails", async () => {
    const send = vi.fn().mockRejectedValue(new Error("AccessDenied"));
    vi.mocked(getOptionalS3Service).mockReturnValue({
      getClient: () => ({ send }),
      getBucket: () => "test-bucket",
    } as unknown as S3Service);

    await expect(testS3Connection()).resolves.toBe(false);
    expect(send).toHaveBeenCalledOnce();
  });
});
