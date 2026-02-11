-- Add missing pin columns for group chat messages (introduced after initial migration).
ALTER TABLE "GroupChatMessage"
ADD COLUMN "pinnedAt" TIMESTAMP(3),
ADD COLUMN "pinnedByUserId" TEXT;

-- Support pinned list queries by group/date.
CREATE INDEX "GroupChatMessage_groupId_pinnedAt_idx" ON "GroupChatMessage"("groupId", "pinnedAt");

-- Link "pinned by" user when available.
ALTER TABLE "GroupChatMessage"
ADD CONSTRAINT "GroupChatMessage_pinnedByUserId_fkey"
FOREIGN KEY ("pinnedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

