-- AlterTable
ALTER TABLE "FinancialTransaction" ADD COLUMN     "seriesIndex" INTEGER,
ADD COLUMN     "seriesTotal" INTEGER;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "customerName" TEXT;

-- CreateIndex
CREATE INDEX "FinancialTransaction_recurrenceGroupId_idx" ON "FinancialTransaction"("recurrenceGroupId");
