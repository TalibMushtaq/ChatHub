/**
 * Destructive S3 storage reset utility.
 *
 * Deletes ONLY objects created by the application (attachments, thumbnails,
 * avatars) and NEVER touches the permanent `defaults/` assets. This is a
 * manual operator tool, never invoked by the application.
 *
 * Usage:
 *   RESET_S3=true pnpm reset:s3 [--dry-run]
 *   RESET_S3=true RESET_S3_PRODUCTION=true pnpm reset:s3   # in production
 *
 * The `defaults/` prefix is immutable — if any `defaults/...` key ever appears
 * in the deletion candidate list, the script aborts loudly instead of deleting.
 */
import "../src/lib/env";
import * as readline from "node:readline";
import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { S3Service, buildS3ConfigFromEnv } from "../src/services/S3Service";

/**
 * S3 object-key prefixes the application uses for user-generated content.
 *
 * Mirrors the runtime constants (src/constants/attachment.ts and avatar.ts) so
 * the reset stays in sync with what the application actually writes. Includes
 * `attachments/thumbnails/` even though nothing uploads there yet, because it
 * is an explicitly defined application-owned prefix.
 */
export const APP_PREFIXES = [
  "attachments/room/",
  "attachments/dm/",
  "attachments/voice/",
  "attachments/thumbnails/",
  "avatars/",
] as const;

/** Permanent seed assets that must never be deleted. */
export const PROTECTED_PREFIX = "defaults";

/** S3 DeleteObjects max keys per request. */
export const MAX_DELETE_BATCH = 1000;

/**
 * True for any key belonging to the protected `defaults/` tree.
 *
 * The check is deliberately explicit (`defaults` itself or `defaults/...`) so
 * that no prefix, typo, or future refactor can ever let seed data through.
 */
export function isProtectedKey(key: string): boolean {
  return key === PROTECTED_PREFIX || key.startsWith(`${PROTECTED_PREFIX}/`);
}

/**
 * Collect candidate keys by listing every application prefix.
 *
 * Deduplicates so an overlapping prefix can't double-delete or double-count.
 */
export async function collectApplicationKeys(
  listObjects: (prefix: string) => Promise<string[]>,
): Promise<string[]> {
  const keys = new Set<string>();
  for (const prefix of APP_PREFIXES) {
    for (const key of await listObjects(prefix)) {
      keys.add(key);
    }
  }
  return [...keys];
}

/** Candidate keys that hit the protected prefix — must abort if non-empty. */
export function findProtectedKeys(keys: string[]): string[] {
  return keys.filter(isProtectedKey);
}

/** Split keys into S3 batch-sized groups. */
export function chunkKeys(keys: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < keys.length; i += size) {
    chunks.push(keys.slice(i, i + size));
  }
  return chunks;
}

/** Require the operator to type "yes" before any deletion runs. */
async function confirmDestructiveOperation(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(
      'Type "yes" to permanently delete these objects (anything else aborts): ',
      (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "yes");
      },
    );
  });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // Safety gate 1: explicit opt-in env vars. Even dry-run requires the flags so
  // it is an exact rehearsal of the real run and can catch a missing flag early.
  if (process.env.RESET_S3 !== "true") {
    console.error(
      "ABORT: RESET_S3=true is required. This script only deletes application-owned objects " +
        `and refuses to touch ${PROTECTED_PREFIX}/.`,
    );
    process.exit(1);
  }

  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction && process.env.RESET_S3_PRODUCTION !== "true") {
    console.error(
      "ABORT: NODE_ENV=production additionally requires RESET_S3_PRODUCTION=true.",
    );
    process.exit(1);
  }

  // Safety gate 2: reuse the application's S3 config, never a second client.
  const config = buildS3ConfigFromEnv();
  if (!config) {
    console.error(
      "ABORT: S3 is not configured. Set AWS_REGION and AWS_S3_BUCKET_NAME (see .env.example).",
    );
    process.exit(1);
  }

  const s3 = new S3Service(config);

  console.log(
    `Environment: ${isProduction ? "production" : process.env.NODE_ENV ?? "development"}`,
  );
  console.log(`Bucket: ${config.bucket}`);
  console.log(`Protected prefix: ${PROTECTED_PREFIX}/`);
  console.log(`Application data prefixes: ${APP_PREFIXES.join(", ")}`);
  console.log("");
  console.log(
    "This operation will permanently delete application-generated S3 objects.",
  );
  console.log(`The ${PROTECTED_PREFIX}/ prefix will NOT be touched.`);
  if (dryRun) {
    console.log(
      "\nDRY RUN — discovering what would be deleted. Zero deletions will be performed.\n",
    );
  }

  // Discover: pagination is handled by S3Service.listObjects (ListObjectsV2).
  const keys = (await collectApplicationKeys((prefix) =>
    s3.listObjects(prefix),
  )).sort();

  // Safety gate 3: never allow a protected key into the deletion set. Fail
  // loudly instead of skipping silently, so a bug is impossible to miss.
  const protectedHits = findProtectedKeys(keys);
  if (protectedHits.length > 0) {
    console.error(
      "SAFETY VIOLATION — protected object(s) appeared in the deletion candidate list:",
    );
    for (const key of protectedHits) {
      console.error(`  REFUSED: ${key}`);
    }
    console.error(`ABORT: refusing to delete. ${PROTECTED_PREFIX}/ is immutable.`);
    process.exit(1);
  }

  console.log(`Discovered ${keys.length} application-owned object(s).`);

  if (dryRun) {
    for (const key of keys) {
      console.log(`  [dry-run] would delete: ${key}`);
    }
    console.log(
      `DRY RUN COMPLETE: ${keys.length} object(s) would be deleted. Zero deletions performed.`,
    );
    process.exit(0);
  }

  if (keys.length === 0) {
    console.log("No application-owned objects found — nothing to delete.");
    process.exit(0);
  }

  // Safety gate 4: explicit human confirmation before deleting anything.
  const confirmed = await confirmDestructiveOperation();
  if (!confirmed) {
    console.log("Aborted — no objects were deleted.");
    process.exit(1);
  }

  // Delete in batches via the existing AWS SDK client.
  const failed: string[] = [];
  let deletedCount = 0;
  for (const batch of chunkKeys(keys, MAX_DELETE_BATCH)) {
    try {
      const response = await s3
        .getClient()
        .send(
          new DeleteObjectsCommand({
            Bucket: config.bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: false },
          }),
        );
      deletedCount += response.Deleted?.length ?? 0;
      for (const err of response.Errors ?? []) {
        if (err.Key) failed.push(err.Key);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Batch delete request failed (${batch.length} key(s)): ${message}`);
      failed.push(...batch);
    }
  }

  console.log(`Deleted ${deletedCount} object(s).`);

  if (failed.length > 0) {
    console.error(`FAILED to delete ${failed.length} object(s):`);
    for (const key of failed) {
      console.error(`  ${key}`);
    }
    console.error(
      "Check S3 permissions (s3:DeleteObject) and retry the failed keys.",
    );
    process.exit(1);
  }
}

// Run only when executed directly (tsx scripts/reset-s3.ts). Importing this
// module from a test must not trigger a destructive main().
const isDirectRun =
  process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1]);

if (isDirectRun) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    console.error("reset-s3 failed unexpectedly:", message);
    process.exit(1);
  });
}
