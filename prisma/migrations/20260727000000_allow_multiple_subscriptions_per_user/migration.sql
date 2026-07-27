-- AlterTable: Remove unique constraint from Subscription.userId
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_userId_key";

-- CreateIndex: Add index for efficient userId lookups
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");
