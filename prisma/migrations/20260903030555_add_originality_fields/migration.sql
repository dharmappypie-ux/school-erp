-- AlterTable
ALTER TABLE "homework_submissions" ADD COLUMN     "originalityCheckedAt" TIMESTAMP(3),
ADD COLUMN     "originalityFlag" TEXT,
ADD COLUMN     "originalityNote" TEXT,
ADD COLUMN     "originalityScore" INTEGER;
