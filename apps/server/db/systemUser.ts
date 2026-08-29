import { prisma } from "./prisma";
import { createLogger } from "../src/lib/logger";

/**
 * Id of the seeded system user. SYSTEM call-history messages write
 * `senderId: SYSTEM_USER_ID`, so this row must exist for the
 * Message.senderId -> User FK (onDelete: Cascade) to accept the write.
 */
export const SYSTEM_USER_ID = "system";

const log = createLogger("system-user");

/**
 * Ensure the system user row exists. Idempotent upsert keyed on the fixed id,
 * so it is safe to run on every server boot (also acts as a repair for DBs
 * that predate this seed, like the production DB that hit the FK violation).
 */
export async function ensureSystemUser(): Promise<void> {
  await prisma.user.upsert({
    where: { id: SYSTEM_USER_ID },
    update: {},
    create: {
      id: SYSTEM_USER_ID,
      email: "system@chathub.local",
      username: "system",
      displayName: "Chathub",
      status: "INVISIBLE",
    },
  });
  log.info("System user guaranteed");
}