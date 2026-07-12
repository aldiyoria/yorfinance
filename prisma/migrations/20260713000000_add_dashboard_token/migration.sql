-- AlterTable
ALTER TABLE "User" ADD COLUMN "dashboardToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_dashboardToken_key" ON "User"("dashboardToken");

-- CreateIndex
CREATE INDEX "User_dashboardToken_idx" ON "User"("dashboardToken");
