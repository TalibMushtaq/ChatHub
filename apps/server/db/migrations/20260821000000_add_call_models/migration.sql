-- Phase 7: Add CallSession/CallParticipant models and participantLimit to Channel.
-- LiveKit owns real-time state; these tables persist call history and participant records.

-- Add participant limit to voice channels (default 25, ignored for TEXT channels).
ALTER TABLE "Channel" ADD COLUMN "participantLimit" INTEGER NOT NULL DEFAULT 25;

-- Tracks voice-call instances per channel.
CREATE TABLE "CallSession" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "CallSession_pkey" PRIMARY KEY ("id")
);

-- A user who joined a CallSession (join/leave timestamps only; media state lives in LiveKit).
CREATE TABLE "CallParticipant" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),
  CONSTRAINT "CallParticipant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CallParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CallSession"("id") ON DELETE CASCADE,
  CONSTRAINT "CallParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "CallParticipant_sessionId_userId_key" UNIQUE ("sessionId", "userId")
);

-- Foreign key from Channel to CallSession (one channel has many sessions).
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE;

-- Indexes for efficient queries.
CREATE INDEX "CallSession_channelId_idx" ON "CallSession"("channelId");
CREATE INDEX "CallSession_endedAt_idx" ON "CallSession"("endedAt");
CREATE INDEX "CallParticipant_sessionId_idx" ON "CallParticipant"("sessionId");
CREATE INDEX "CallParticipant_userId_idx" ON "CallParticipant"("userId");
CREATE INDEX "CallParticipant_leftAt_idx" ON "CallParticipant"("leftAt");
