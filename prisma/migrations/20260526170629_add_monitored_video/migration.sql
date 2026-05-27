-- CreateTable
CREATE TABLE "MonitoredVideo" (
    "id" TEXT NOT NULL,
    "tiktokVideoId" TEXT NOT NULL,
    "caption" TEXT,
    "thumbnailUrl" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "isMonitoring" BOOLEAN NOT NULL DEFAULT true,
    "lastChecked" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tiktokAccountId" TEXT NOT NULL,

    CONSTRAINT "MonitoredVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonitoredVideo_tiktokVideoId_key" ON "MonitoredVideo"("tiktokVideoId");

-- AddForeignKey
ALTER TABLE "MonitoredVideo" ADD CONSTRAINT "MonitoredVideo_tiktokAccountId_fkey" FOREIGN KEY ("tiktokAccountId") REFERENCES "TikTokAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
