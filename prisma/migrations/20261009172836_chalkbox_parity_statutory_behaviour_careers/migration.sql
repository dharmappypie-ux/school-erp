-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('MARRIED', 'UNMARRIED', 'WIDOWED', 'DIVORCED');

-- CreateEnum
CREATE TYPE "PoliceVerificationStatus" AS ENUM ('NOT_STARTED', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BehaviourKind" AS ENUM ('APPRECIATION', 'CONCERN', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "BehaviourSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'FILLED');

-- CreateEnum
CREATE TYPE "JobApplicationStatus" AS ENUM ('RECEIVED', 'SHORTLISTED', 'INTERVIEWED', 'OFFERED', 'REJECTED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "staff_members" ADD COLUMN     "drivingLicenceExpiry" TIMESTAMP(3),
ADD COLUMN     "drivingLicenceNo" TEXT,
ADD COLUMN     "fatherOrHusbandName" TEXT,
ADD COLUMN     "maritalStatus" "MaritalStatus",
ADD COLUMN     "oasisId" TEXT,
ADD COLUMN     "policeVerificationDate" TIMESTAMP(3),
ADD COLUMN     "policeVerificationRef" TEXT,
ADD COLUMN     "policeVerificationStatus" "PoliceVerificationStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "teacherNationalCode" TEXT;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "admissionFileNo" TEXT,
ADD COLUMN     "allergies" TEXT,
ADD COLUMN     "apaarId" TEXT,
ADD COLUMN     "boardRegNoIX" TEXT,
ADD COLUMN     "boardRegNoXI" TEXT,
ADD COLUMN     "caste" TEXT,
ADD COLUMN     "chronicAilment" TEXT,
ADD COLUMN     "disabilityType" TEXT,
ADD COLUMN     "hasDisability" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasSpecialNeeds" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "heightCm" INTEGER,
ADD COLUMN     "house" TEXT,
ADD COLUMN     "isAlumniChild" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isBpl" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isEws" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isMinority" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isRteQuota" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSingleChild" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSingleParent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isStaffWard" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "languageAtHome" TEXT,
ADD COLUMN     "penNumber" TEXT,
ADD COLUMN     "placeOfBirth" TEXT,
ADD COLUMN     "previousBoard" TEXT,
ADD COLUMN     "previousClassResult" TEXT,
ADD COLUMN     "previousTcDate" TIMESTAMP(3),
ADD COLUMN     "previousTcNumber" TEXT,
ADD COLUMN     "udiseNumber" TEXT,
ADD COLUMN     "weightKg" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "behaviour_logs" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" "BehaviourKind" NOT NULL,
    "severity" "BehaviourSeverity" NOT NULL DEFAULT 'LOW',
    "category" TEXT,
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "occurredOn" DATE NOT NULL,
    "recordedById" TEXT,
    "enteredById" TEXT,
    "guardianNotifiedAt" TIMESTAMP(3),
    "retractedAt" TIMESTAMP(3),
    "retractedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "behaviour_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_postings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "responsibilities" TEXT,
    "location" TEXT,
    "minExperience" INTEGER,
    "qualification" TEXT,
    "salaryRange" TEXT,
    "vacancies" INTEGER NOT NULL DEFAULT 1,
    "cvRequired" BOOLEAN NOT NULL DEFAULT true,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "closingDate" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applications" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "applicantName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "experience" INTEGER,
    "qualification" TEXT,
    "coverNote" TEXT,
    "resumeUrl" TEXT,
    "status" "JobApplicationStatus" NOT NULL DEFAULT 'RECEIVED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "behaviour_logs_schoolId_occurredOn_idx" ON "behaviour_logs"("schoolId", "occurredOn");

-- CreateIndex
CREATE INDEX "behaviour_logs_studentId_occurredOn_idx" ON "behaviour_logs"("studentId", "occurredOn");

-- CreateIndex
CREATE INDEX "behaviour_logs_schoolId_kind_idx" ON "behaviour_logs"("schoolId", "kind");

-- CreateIndex
CREATE INDEX "job_postings_schoolId_status_closingDate_idx" ON "job_postings"("schoolId", "status", "closingDate");

-- CreateIndex
CREATE UNIQUE INDEX "job_postings_schoolId_reference_key" ON "job_postings"("schoolId", "reference");

-- CreateIndex
CREATE INDEX "job_applications_schoolId_status_idx" ON "job_applications"("schoolId", "status");

-- CreateIndex
CREATE INDEX "job_applications_jobId_status_idx" ON "job_applications"("jobId", "status");

-- CreateIndex
CREATE INDEX "staff_members_schoolId_policeVerificationStatus_idx" ON "staff_members"("schoolId", "policeVerificationStatus");

-- CreateIndex
CREATE INDEX "students_schoolId_house_idx" ON "students"("schoolId", "house");

-- AddForeignKey
ALTER TABLE "behaviour_logs" ADD CONSTRAINT "behaviour_logs_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_logs" ADD CONSTRAINT "behaviour_logs_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_logs" ADD CONSTRAINT "behaviour_logs_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
