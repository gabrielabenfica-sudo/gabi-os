-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "direction" TEXT NOT NULL DEFAULT 'UP';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "menteeId" TEXT;

-- CreateIndex
CREATE INDEX "Task_menteeId_idx" ON "Task"("menteeId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_menteeId_fkey" FOREIGN KEY ("menteeId") REFERENCES "Mentee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
