-- DropIndex: Remove unique index from Subscription.userId (Prisma @unique creates INDEX, not CONSTRAINT)
DROP INDEX "Subscription_userId_key";
