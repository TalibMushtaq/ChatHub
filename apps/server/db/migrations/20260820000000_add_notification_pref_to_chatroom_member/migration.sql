-- CreateEnum (idempotent for fresh databases)
DO $$ BEGIN
  CREATE TYPE "ChatRoomNotificationPref" AS ENUM ('ALL', 'MENTIONS', 'MUTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "ChatRoomMember" ADD COLUMN "notificationPref" "ChatRoomNotificationPref" NOT NULL DEFAULT 'ALL';
