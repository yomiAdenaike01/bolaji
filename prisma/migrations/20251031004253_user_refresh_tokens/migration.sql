-- CreateTable
CREATE TABLE "UserRefreshToken" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenJti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserRefreshToken_tokenHash_key" ON "UserRefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "UserRefreshToken_userId_idx" ON "UserRefreshToken"("userId");

-- CreateIndex
CREATE INDEX "UserRefreshToken_sessionId_idx" ON "UserRefreshToken"("sessionId");

-- CreateIndex
CREATE INDEX "UserRefreshToken_expiresAt_idx" ON "UserRefreshToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "UserRefreshToken" ADD CONSTRAINT "UserRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRefreshToken" ADD CONSTRAINT "UserRefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
