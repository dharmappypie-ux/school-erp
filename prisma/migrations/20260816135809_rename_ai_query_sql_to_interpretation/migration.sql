/*
  Warnings:

  - You are about to drop the column `generatedSql` on the `ai_query_logs` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ai_query_logs" DROP COLUMN "generatedSql",
ADD COLUMN     "interpretation" TEXT;
