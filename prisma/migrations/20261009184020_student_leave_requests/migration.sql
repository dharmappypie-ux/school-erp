-- CreateEnum
CREATE TYPE "LeavePortion" AS ENUM ('FULL_DAY', 'FIRST_HALF', 'SECOND_HALF');

-- CreateTable
CREATE TABLE "student_leave_requests" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "portion" "LeavePortion" NOT NULL DEFAULT 'FULL_DAY',
    "leavingAfterPeriod" INTEGER,
    "reason" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_leave_requests_schoolId_status_idx" ON "student_leave_requests"("schoolId", "status");

-- CreateIndex
CREATE INDEX "student_leave_requests_studentId_fromDate_idx" ON "student_leave_requests"("studentId", "fromDate");

-- CreateIndex
CREATE INDEX "student_leave_requests_schoolId_fromDate_idx" ON "student_leave_requests"("schoolId", "fromDate");

-- AddForeignKey
ALTER TABLE "student_leave_requests" ADD CONSTRAINT "student_leave_requests_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_leave_requests" ADD CONSTRAINT "student_leave_requests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_leave_requests" ADD CONSTRAINT "student_leave_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_leave_requests" ADD CONSTRAINT "student_leave_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
