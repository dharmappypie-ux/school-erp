-- CreateEnum
CREATE TYPE "HomeworkQuestionType" AS ENUM ('MULTIPLE_CHOICE', 'SHORT_TEXT', 'LONG_TEXT');

-- CreateTable
CREATE TABLE "homework_questions" (
    "id" TEXT NOT NULL,
    "homeworkId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "type" "HomeworkQuestionType" NOT NULL DEFAULT 'MULTIPLE_CHOICE',
    "options" TEXT[],
    "correctOption" INTEGER,
    "expectedAnswer" TEXT,
    "marks" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_answers" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOption" INTEGER,
    "textAnswer" TEXT,
    "awardedMarks" DECIMAL(6,2),
    "isCorrect" BOOLEAN,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "homework_questions_homeworkId_idx" ON "homework_questions"("homeworkId");

-- CreateIndex
CREATE UNIQUE INDEX "homework_questions_homeworkId_sequence_key" ON "homework_questions"("homeworkId", "sequence");

-- CreateIndex
CREATE INDEX "homework_answers_submissionId_idx" ON "homework_answers"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "homework_answers_submissionId_questionId_key" ON "homework_answers"("submissionId", "questionId");

-- AddForeignKey
ALTER TABLE "homework_questions" ADD CONSTRAINT "homework_questions_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "homeworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_answers" ADD CONSTRAINT "homework_answers_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "homework_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_answers" ADD CONSTRAINT "homework_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "homework_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
