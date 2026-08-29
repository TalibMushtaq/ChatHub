-- Align CallSession callType/status/outcome columns with the Prisma schema
-- enums. The original hand-written migration (20260827000000) created these
-- as TEXT columns; Prisma's query engine emits `::"CallStatus"` casts on every
-- reference, so any call query fails with 'type "public.CallStatus" does not
-- exist'. Create the enum types and convert the columns so the schema matches
-- the generated client.

CREATE TYPE "CallType" AS ENUM ('VOICE', 'VIDEO');
CREATE TYPE "CallStatus" AS ENUM ('RINGING', 'ACTIVE', 'ENDED');
CREATE TYPE "CallOutcome" AS ENUM ('COMPLETED', 'MISSED', 'DECLINED', 'CANCELLED', 'FAILED');

-- The partial unique indexes reference status via text literals; their
-- predicates would be invalid for an enum column, so recreate them below.
DROP INDEX "CallSession_active_directChatId_idx";
DROP INDEX "CallSession_active_channelId_idx";

-- TEXT defaults are not castable to the new enum types; drop, convert, then
-- restore schema-aligned defaults (callType default VOICE, status default
-- RINGING per schema.prisma).
ALTER TABLE "CallSession" ALTER COLUMN "callType" DROP DEFAULT;
ALTER TABLE "CallSession" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "CallSession"
  ALTER COLUMN "callType" TYPE "CallType" USING "callType"::"CallType",
  ALTER COLUMN "status" TYPE "CallStatus" USING "status"::"CallStatus",
  ALTER COLUMN "outcome" TYPE "CallOutcome" USING "outcome"::"CallOutcome";

ALTER TABLE "CallSession"
  ALTER COLUMN "callType" SET DEFAULT 'VOICE',
  ALTER COLUMN "status" SET DEFAULT 'RINGING';

-- Recreate the partial unique indexes with enum-compatible predicates.
CREATE UNIQUE INDEX "CallSession_active_directChatId_idx"
  ON "CallSession"("directChatId")
  WHERE "status" IN ('RINGING', 'ACTIVE') AND "directChatId" IS NOT NULL;

CREATE UNIQUE INDEX "CallSession_active_channelId_idx"
  ON "CallSession"("channelId")
  WHERE "status" IN ('RINGING', 'ACTIVE') AND "channelId" IS NOT NULL;