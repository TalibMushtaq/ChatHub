/*
  Warnings:

  - You are about to drop the column `fileName` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `fileSize` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `fileUri` on the `Message` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Message" DROP COLUMN "fileName",
DROP COLUMN "fileSize",
DROP COLUMN "fileUri";
