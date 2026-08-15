-- AlterTable
ALTER TABLE "User" ADD COLUMN     "customStatus" TEXT,
ADD COLUMN     "showOnlineStatus" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showTypingStatus" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'AVAILABLE';
