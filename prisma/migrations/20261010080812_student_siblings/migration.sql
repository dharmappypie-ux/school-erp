-- CreateEnum
CREATE TYPE "SiblingRelation" AS ENUM ('BROTHER', 'SISTER', 'OTHER');

-- CreateTable
CREATE TABLE "student_siblings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT,
    "applicationId" TEXT,
    "name" TEXT NOT NULL,
    "relation" "SiblingRelation" NOT NULL DEFAULT 'OTHER',
    "dateOfBirth" DATE,
    "schoolName" TEXT,
    "siblingStudentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_siblings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_siblings_schoolId_idx" ON "student_siblings"("schoolId");

-- CreateIndex
CREATE INDEX "student_siblings_studentId_idx" ON "student_siblings"("studentId");

-- CreateIndex
CREATE INDEX "student_siblings_applicationId_idx" ON "student_siblings"("applicationId");

-- CreateIndex
CREATE INDEX "student_siblings_siblingStudentId_idx" ON "student_siblings"("siblingStudentId");

-- AddForeignKey
ALTER TABLE "student_siblings" ADD CONSTRAINT "student_siblings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_siblings" ADD CONSTRAINT "student_siblings_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_siblings" ADD CONSTRAINT "student_siblings_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "admission_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_siblings" ADD CONSTRAINT "student_siblings_siblingStudentId_fkey" FOREIGN KEY ("siblingStudentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
