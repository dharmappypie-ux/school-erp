import { notFound } from "next/navigation";

import { QuizRunner } from "@/app/(app)/portal/quizzes/[id]/quiz-runner";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  PageHeader,
  StatTile,
} from "@/components/ui";
import { resolvePortalStudent } from "@/lib/portal";
import { isQuizOpen, scorePercent } from "@/lib/quiz";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Quiz" };

export default async function PortalQuizPage({
  params,
  searchParams,
}: PageProps<"/portal/quizzes/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { context, child } = await resolvePortalStudent(query.child);
  const session = context.session;
  const db = scopedDb(session.schoolId);
  const yearId = session.academicYear?.id;

  const enrollment = await db.enrollment.findFirst({
    where: { studentId: child.id, ...(yearId ? { academicYearId: yearId } : {}) },
    select: { section: { select: { classLevelId: true } } },
  });
  const classLevelId = enrollment?.section.classLevelId ?? null;

  const quiz = await db.quiz.findFirst({
    where: {
      id,
      status: "PUBLISHED",
      OR: [{ classLevelId: null }, ...(classLevelId ? [{ classLevelId }] : [])],
    },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      availableFrom: true,
      availableUntil: true,
      timeLimitMinutes: true,
      subject: { select: { name: true } },
      questions: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          sequence: true,
          prompt: true,
          options: true,
          points: true,
          correctOption: true,
          explanation: true,
        },
      },
      attempts: {
        where: { studentId: child.id },
        select: {
          id: true,
          score: true,
          totalPoints: true,
          completedAt: true,
          answers: { select: { questionId: true, selectedOption: true, isCorrect: true, pointsAwarded: true } },
        },
      },
    },
  });

  if (!quiz) notFound();

  const attempt = quiz.attempts.find((a) => a.completedAt) ?? null;
  const open = isQuizOpen(quiz);

  return (
    <>
      <div className="mb-3">
        <ButtonLink href={`/portal/quizzes?child=${child.id}`} variant="ghost" size="sm">
          ← All quizzes
        </ButtonLink>
      </div>

      <PageHeader title={quiz.title} description={quiz.description ?? undefined} />

      <div className="flex flex-wrap items-center gap-1.5">
        {quiz.subject ? <Badge tone="info">{quiz.subject.name}</Badge> : null}
        <span className="text-xs text-muted">
          {quiz.questions.length} question{quiz.questions.length === 1 ? "" : "s"}
          {quiz.timeLimitMinutes ? ` · suggested ${quiz.timeLimitMinutes} min` : ""}
        </span>
      </div>

      {attempt ? (
        <ResultsView quiz={quiz} attempt={attempt} />
      ) : !open ? (
        <div className="mt-4">
          <Alert tone="warning" title="This quiz is closed">
            It is not open for attempts right now.
          </Alert>
        </div>
      ) : quiz.questions.length === 0 ? (
        <div className="mt-4">
          <Alert tone="warning" title="No questions yet">
            This quiz has no questions to answer.
          </Alert>
        </div>
      ) : (
        <div className="mt-4">
          <QuizRunner
            quizId={quiz.id}
            childId={child.id}
            questions={quiz.questions.map((q) => ({
              id: q.id,
              sequence: q.sequence,
              prompt: q.prompt,
              options: q.options,
              points: q.points,
              // correctOption is deliberately NOT passed to the client.
            }))}
          />
        </div>
      )}
    </>
  );
}

type QuizForResults = {
  questions: {
    id: string;
    sequence: number;
    prompt: string;
    options: string[];
    points: number;
    correctOption: number;
    explanation: string | null;
  }[];
};
type AttemptForResults = {
  score: number;
  totalPoints: number;
  answers: { questionId: string; selectedOption: number | null; isCorrect: boolean; pointsAwarded: number }[];
};

function ResultsView({ quiz, attempt }: { quiz: QuizForResults; attempt: AttemptForResults }) {
  const percent = scorePercent(attempt.score, attempt.totalPoints);
  const correct = attempt.answers.filter((a) => a.isCorrect).length;

  return (
    <>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Your score"
          value={`${attempt.score}/${attempt.totalPoints}`}
          sublabel={`${percent}%`}
          tone={percent >= 60 ? "success" : percent >= 40 ? "warning" : "danger"}
        />
        <StatTile label="Correct" value={`${correct}/${quiz.questions.length}`} tone="brand" />
        <StatTile label="Result" value={percent >= 40 ? "Passed 🎉" : "Keep trying"} tone={percent >= 40 ? "success" : "warning"} />
      </div>

      <Card className="mt-4">
        <CardHeader title="Review" description="Your answers, with the correct ones marked" />
        <ol className="divide-y divide-border">
          {quiz.questions.map((question) => {
            const given = attempt.answers.find((a) => a.questionId === question.id);
            const chosen = given?.selectedOption ?? null;
            return (
              <li key={question.id} className="px-5 py-4">
                <p className="text-sm font-semibold">
                  <span className="text-muted">{question.sequence}. </span>
                  {question.prompt}
                  <span className="ml-2 text-[11px] font-normal text-muted">
                    {given?.pointsAwarded ?? 0}/{question.points} pts
                  </span>
                </p>
                <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {question.options.map((option, index) => {
                    const isCorrect = index === question.correctOption;
                    const isChosen = index === chosen;
                    return (
                      <li
                        key={index}
                        className={`rounded-[var(--radius-base)] border px-3 py-1.5 text-xs ${
                          isCorrect
                            ? "border-success/50 bg-success-soft text-success"
                            : isChosen
                              ? "border-danger/50 bg-danger-soft text-danger"
                              : "border-border text-muted-strong"
                        }`}
                      >
                        {isCorrect ? "✓ " : isChosen ? "✗ " : ""}
                        {option}
                        {isChosen && !isCorrect ? " (your answer)" : ""}
                      </li>
                    );
                  })}
                </ul>
                {question.explanation ? (
                  <p className="mt-2 text-[11px] text-muted">
                    <span className="font-medium">Why:</span> {question.explanation}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </Card>
    </>
  );
}
