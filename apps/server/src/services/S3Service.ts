import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createLogger } from "../lib/logger";

const log = createLogger("S3Service");

export interface S3Config {
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
}

/**
 * S3Service wraps AWS SDK v3 operations for the attachment architecture.
 *
 * Design decisions:
 * - Class-based DI (mirrors RecoveryCodeService / PasswordService pattern).
 * - Config is injected via constructor for testability.
 * - All methods are async and throw on failure.
 * - Presigned URLs are short-lived (configurable, default 5 min).
 * - Object keys are never validated here; AttachmentService owns key structure.
 */
export class S3Service {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
      region: config.region,
    };

    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
      clientConfig.forcePathStyle = true;
    }

    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }

    this.client = new S3Client(clientConfig);
  }

  /**
   * Expose the underlying S3 client so health checks can run bucket-level
   * commands (HeadBucket) without reaching into private fields.
   */
  getClient(): S3Client {
    return this.client;
  }

  /** Expose the bucket name for health checks and diagnostics. */
  getBucket(): string {
    return this.bucket;
  }

  /**
   * Generate a presigned PUT URL for direct client upload.
   *
   * Constrains Content-Type to the validated MIME type.
   * Does not constrain Content-Length (S3 presigned PUT does not enforce it
   * reliably); size enforcement happens at the presign validation layer.
   */
  async generatePresignedPutUrl(
    key: string,
    contentType: string,
    expiresIn = 300,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Generate a short-lived presigned GET URL for downloading an object.
   */
  async generatePresignedGetUrl(key: string, expiresIn = 300): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Verify that an object exists in S3.
   *
   * Returns true if HeadObject succeeds, false if the object is missing.
   * Throws on unexpected errors (network, permissions, etc.).
   */
  async headObject(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (err: unknown) {
      // S3 SDK errors expose a `name` and optional `$metadata` with the HTTP
      // status; missing objects surface as "NotFound" or a 404.
      const e = err as {
        name?: string;
        message?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (e.name === "NotFound" || e.$metadata?.httpStatusCode === 404) {
        return false;
      }
      log.error("S3 HeadObject failed", {
        key,
        error: e.message ?? String(err),
      });
      throw err;
    }
  }

  /**
   * Delete an object from S3.
   *
   * Throws on failure so the caller can decide whether to retry or mark
   * the attachment for async cleanup.
   */
  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  /**
   * List all object keys under a given prefix.
   *
   * Paginates automatically and returns all keys. Use a specific prefix
   * like "defaults/user/" to enumerate available default avatars.
   */
  async listObjects(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });
      const response = await this.client.send(command);
      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) keys.push(obj.Key);
        }
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return keys;
  }
}

/**
 * Build S3Config from environment variables.
 *
 * Returns null if required vars are missing, allowing graceful degradation.
 */
export function buildS3ConfigFromEnv(): S3Config | null {
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET_NAME;

  if (!region || !bucket) {
    log.warn("Missing required S3 env vars (AWS_REGION, AWS_S3_BUCKET_NAME)");
    return null;
  }

  return {
    region,
    bucket,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.AWS_S3_ENDPOINT || undefined,
  };
}
