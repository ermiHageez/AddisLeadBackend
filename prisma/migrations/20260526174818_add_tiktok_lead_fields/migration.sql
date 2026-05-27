/*
  Warnings:

  - A unique constraint covering the columns `[tiktokCommentId]` on the table `Lead` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "tiktokCommentId" TEXT,
ADD COLUMN     "tiktokVideoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Lead_tiktokCommentId_key" ON "Lead"("tiktokCommentId");
