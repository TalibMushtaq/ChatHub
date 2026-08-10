import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  S3Service,
  buildS3ConfigFromEnv,
} from "../../../src/services/S3Service";
import { S3Client } from "@aws-sdk/client-s3";

vi.mock("@aws-sdk/client-s3");
vi.mock("@aws-sdk/s3-request-presigner");

describe("S3Service - configuration branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should enable path-style addressing when a custom endpoint is configured", () => {
    new S3Service({
      region: "us-east-1",
      bucket: "test-bucket",
      endpoint: "http://localhost:9000",
    });

    expect(S3Client).toHaveBeenCalledWith({
      region: "us-east-1",
      endpoint: "http://localhost:9000",
      forcePathStyle: true,
    });
  });

  it("should omit credentials when only one of the key pair is provided", () => {
    new S3Service({
      region: "us-east-1",
      bucket: "test-bucket",
      accessKeyId: "only-key",
    });

    expect(S3Client).toHaveBeenCalledWith({ region: "us-east-1" });
  });
});

describe("S3Service.headObject - error branches", () => {
  let s3Service: S3Service;

  beforeEach(() => {
    vi.clearAllMocks();
    s3Service = new S3Service({ region: "us-east-1", bucket: "test-bucket" });
  });

  it("should return false when the error carries a 404 status code", async () => {
    const err = Object.assign(new Error("Missing"), {
      name: "SomeOtherError",
      $metadata: { httpStatusCode: 404 },
    });
    (s3Service as any).client.send = vi.fn().mockRejectedValueOnce(err);

    await expect(s3Service.headObject("test/key.jpg")).resolves.toBe(false);
  });

  it("should rethrow unexpected errors", async () => {
    const err = Object.assign(new Error("AccessDenied"), {
      name: "AccessDenied",
      $metadata: { httpStatusCode: 403 },
    });
    (s3Service as any).client.send = vi.fn().mockRejectedValueOnce(err);

    await expect(s3Service.headObject("test/key.jpg")).rejects.toThrow(
      "AccessDenied",
    );
  });
});

describe("buildS3ConfigFromEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.AWS_REGION;
    delete process.env.AWS_S3_BUCKET_NAME;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_S3_ENDPOINT;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("should return null when the region is missing", () => {
    process.env.AWS_S3_BUCKET_NAME = "bucket";

    expect(buildS3ConfigFromEnv()).toBeNull();
  });

  it("should return null when the bucket is missing", () => {
    process.env.AWS_REGION = "us-east-1";

    expect(buildS3ConfigFromEnv()).toBeNull();
  });

  it("should build a config from the environment", () => {
    process.env.AWS_REGION = "eu-west-1";
    process.env.AWS_S3_BUCKET_NAME = "bucket";
    process.env.AWS_ACCESS_KEY_ID = "key";
    process.env.AWS_SECRET_ACCESS_KEY = "secret";
    process.env.AWS_S3_ENDPOINT = "http://localhost:9000";

    expect(buildS3ConfigFromEnv()).toEqual({
      region: "eu-west-1",
      bucket: "bucket",
      accessKeyId: "key",
      secretAccessKey: "secret",
      endpoint: "http://localhost:9000",
    });
  });

  it("should normalize an empty endpoint to undefined", () => {
    process.env.AWS_REGION = "eu-west-1";
    process.env.AWS_S3_BUCKET_NAME = "bucket";
    process.env.AWS_S3_ENDPOINT = "";

    expect(buildS3ConfigFromEnv()?.endpoint).toBeUndefined();
  });
});
