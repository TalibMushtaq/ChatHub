-- Extend CallSession to support DM calls and add call metadata.
-- Exactly one of channelId / directChatId is non-null (enforced by CHECK).

-- 1. Make channelId nullable (was NOT NULL for channel-only calls).
ALTER TABLE "CallSession" ALTER COLUMN "channelId" DROP NOT NULL;

-- 2. Add new columns with safe defaults for existing rows.
ALTER TABLE "CallSession"
  ADD COLUMN "directChatId"  TEXT,
  ADD COLUMN "callType"      TEXT NOT NULL DEFAULT 'VOICE',
  ADD COLUMN "status"        TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "outcome"       TEXT,
  ADD COLUMN "connectedAt"   TIMESTAMP(3);

-- 3. Backfill existing rows from current data.
-- endedAt IS NULL → active voice-channel sessions.
UPDATE "CallSession" SET status = 'ACTIVE' WHERE "endedAt" IS NULL;

-- endedAt IS NOT NULL → ended sessions.
UPDATE "CallSession" SET status = 'ENDED', outcome = 'COMPLETED' WHERE "endedAt" IS NOT NULL;

-- 4. CHECK constraint: exactly one target is non-null.
ALTER TABLE "CallSession"
  ADD CONSTRAINT "CallSession_target_check"
  CHECK (
    ("channelId" IS NOT NULL AND "directChatId" IS NULL) OR
    ("channelId" IS NULL AND "directChatId" IS NOT NULL)
  );

-- 5. Partial unique index: one active session per DM.
CREATE UNIQUE INDEX "CallSession_active_directChatId_idx"
  ON "CallSession"("directChatId")
  WHERE "status" IN ('RINGING', 'ACTIVE') AND "directChatId" IS NOT NULL;

-- 6. Partial unique index: one active session per channel.
CREATE UNIQUE INDEX "CallSession_active_channelId_idx"
  ON "CallSession"("channelId")
  WHERE "status" IN ('RINGING', 'ACTIVE') AND "channelId" IS NOT NULL;

-- 7. FK for directChatId.
ALTER TABLE "CallSession"
  ADD CONSTRAINT "CallSession_directChatId_fkey"
  FOREIGN KEY ("directChatId") REFERENCES "DirectChat"("id") ON DELETE CASCADE;

-- 8. Add metadata column to Message for structured system messages.
ALTER TABLE "Message" ADD COLUMN "metadata" JSONB;
