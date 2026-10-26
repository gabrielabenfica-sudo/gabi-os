-- CreateEnum
CREATE TYPE "RoutineKind" AS ENUM ('SCHEDULE', 'CHECKLIST');

-- CreateTable
CREATE TABLE "Routine" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "RoutineKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineItem" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "time" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "RoutineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineCheck" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutineCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineRun" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "RoutineRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineRunStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "itemId" TEXT,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "RoutineRunStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Routine_workspaceId_kind_idx" ON "Routine"("workspaceId", "kind");

-- CreateIndex
CREATE INDEX "RoutineItem_routineId_idx" ON "RoutineItem"("routineId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineCheck_itemId_date_key" ON "RoutineCheck"("itemId", "date");

-- CreateIndex
CREATE INDEX "RoutineRun_routineId_startedAt_idx" ON "RoutineRun"("routineId", "startedAt");

-- CreateIndex
CREATE INDEX "RoutineRunStep_runId_idx" ON "RoutineRunStep"("runId");

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineItem" ADD CONSTRAINT "RoutineItem_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineCheck" ADD CONSTRAINT "RoutineCheck_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "RoutineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineRun" ADD CONSTRAINT "RoutineRun_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineRunStep" ADD CONSTRAINT "RoutineRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "RoutineRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineRunStep" ADD CONSTRAINT "RoutineRunStep_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "RoutineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
