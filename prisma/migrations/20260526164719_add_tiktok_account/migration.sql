-- CreateTable
CREATE TABLE "TikTokAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tiktokUserId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "username" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TikTokAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TikTokAccount_userId_key" ON "TikTokAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TikTokAccount_tiktokUserId_key" ON "TikTokAccount"("tiktokUserId");

-- AddForeignKey
ALTER TABLE "TikTokAccount" ADD CONSTRAINT "TikTokAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
