-- CreateTable
CREATE TABLE "ProcessState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startTime" BIGINT NOT NULL,
    "updatedAt" BIGINT NOT NULL,
    "lastTweetId" TEXT
);

-- CreateTable
CREATE TABLE "Tweet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorId" TEXT NOT NULL,
    "conversationId" TEXT,
    "inReplyToUserId" TEXT,
    "createdAt" BIGINT NOT NULL,
    "text" TEXT NOT NULL,
    "mediaUrls" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "isRoot" BOOLEAN NOT NULL DEFAULT false,
    "threadId" TEXT,
    "translatedText" TEXT,
    CONSTRAINT "Tweet_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorId" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "updatedAt" BIGINT
);
