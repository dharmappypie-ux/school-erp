import { notFound } from "next/navigation";

import { AddQuestion, DeleteQuestionButton, QuizStatusControls } from "@/app/(app)/quizzes/quiz-panels";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { requireAnyPermission } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { hasPermission } from "@/lib/permissions";
import { QUIZ_STATUS_LABEL, QUIZ_STATUS_TONE, scorePercent } from "@/lib/quiz";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Quiz" };

export default async function QuizDetailPage({ params }: PageProps<"/quizzes/[id]">) {
  const session = await requireAnyPermission(["quiz.read", "quiz.manage"]);
  const { id } = await params;
  const db = scopedDb(session.schoolId);

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      timeLimitMinutes: true,
      classLevel: { select: { name: true } },
      subject: { select: { name: true } },
      teacher: { select: { firstName: true, lastName: true } },
      questions: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          sequence: true,
          prompt: true,
          options: true,
          correctOption: true,
          points: true,
          explanation: true,
        },
      },
      attempts: {
        where: { completedAt: { not: null } },
        orderBy: [{ score: "desc" }, { completedAt: "asc" }],
        select: {
          id: true,
          score: true,
          totalPoints: true,
          completedAt: true,
          student: { select: { firstName: true, lastName: true, admissionNo: true } },
        },
      },
    },
  });

  if (!quiz) notFound();

  const canManage = hasPermission(session.permissions, "quiz.manage");
  const canPublish = hasPermission(session.permissions, "quiz.publish");
  const totalPoints = quiz.questions.reduce((sum, q) => sum + q.points, 0);
  const avgPercent =
    quiz.attempts.length > 0
      ? Math.round(
          quiz.attempts.reduce((sum, a) => sum + scorePercent(a.score, a.totalPoints), 0) /
            quiz.attempts.length,
        )
      : null;

  return (
    <>
      <div className="mb-3">
        <ButtonLink href="/quizzes" variant="ghost" size="sm">
          ← All quizzes
        </ButtonLink>
      </div>

      <PageHeader
        title={quiz.title}
        description={quiz.description ?? undefined}
        action={
          canManage ? (
            <QuizStatusControls quizId={quiz.id} status={quiz.status} canPublish={canPublish} />
          ) : (
            <Badge tone={QUIZ_STATUS_TONE[quiz.status]}>{QUIZ_STATUS_LABEL[quiz.status]}</Badge>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={QUIZ_STATUS_TONE[quiz.status]}>{QUIZ_STATUS_LABEL[quiz.status]}</Badge>
        {quiz.classLevel ? <Badge tone="brand">{quiz.classLevel.name}</Badge> : <Badge tone="neutral">All classes</Badge>}
        {quiz.subject ? <Badge tone="info">{quiz.subject.name}</Badge> : null}
        {quiz.teacher ? (
          <Badge tone="neutral">{`${quiz.teacher.firstName} ${quiz.teacher.lastName ?? ""}`.trim()}</Badge>
        ) : null}
        <span className="text-xs text-muted">
          {quiz.questions.length} question{quiz.questions.length === 1 ? "" : "s"} · {totalPoints} points
          {quiz.timeLimitMinutes ? ` · ${quiz.timeLimitMinutes} min` : ""}
        </span>
      </div>

      {quiz.status === "DRAFT" && canManage ? (
        <div className="mt-3">
          <Alert tone="info" title="This quiz is a draft">
            Students cannot see it yet. Add questions, then publish it
            {canPublish ? " with the Publish button above." : " — ask someone with publish rights to make it live."}
          </Alert>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatTile label="Attempts" value={String(quiz.attempts.length)} sublabel="completed" tone={quiz.attempts.length > 0 ? "brand" : "neutral"} />
        <StatTile label="Average score" value={avgPercent === null ? "—" : `${avgPercent}%`} tone={avgPercent === null ? "neutral" : avgPercent >= 60 ? "success" : "warning"} />
        <StatTile label="Total points" value={String(totalPoints)} sublabel="on offer" />
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Questions"
          description="Shown to students in this order"
          action={canManage ? <AddQuestion quizId={quiz.id} /> : undefined}
        />
        {quiz.questions.length === 0 ? (
          <EmptyState
            title="No questions yet"
            description={canManage ? "Add the first question to build out this quiz." : "This quiz has no questions yet."}
          />
        ) : (
          <ol className="divide-y divide-border">
            {quiz.questions.map((question) => (
              <li key={question.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold">
                    <span className="text-muted">{question.sequence}.</span> {question.prompt}
                    <span className="ml-2 text-[11px] font-normal text-muted">{question.points} pts</span>
                  </p>
                  {canManage ? (
                    <div className="shrink-0">
                      <DeleteQuestionButton id={question.id} label={`question ${question.sequence}`} />
                    </div>
                  ) : null}
                </div>
                <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {question.options.map((option, index) => (
                    <li
                      key={index}
                      className={`rounded-[var(--radius-base)] border px-3 py-1.5 text-xs ${
                        index === question.correctOption
                          ? "border-success/50 bg-success-soft text-success"
                          : "border-border text-muted-strong"
                      }`}
                    >
                      {index === question.correctOption ? "✓ " : ""}
                      {option}
                    </li>
                  ))}
                </ul>
                {question.explanation ? (
                  <p className="mt-2 text-[11px] text-muted">
                    <span className="font-medium">Why:</span> {question.explanation}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="Leaderboard" description="Top scorers on this quiz" />
        {quiz.attempts.length === 0 ? (
          <EmptyState title="No attempts yet" description="Scores will appear here as students complete the quiz." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="text-right">#</Th>
                <Th>Student</Th>
                <Th className="text-right">Score</Th>
                <Th className="text-right">%</Th>
                <Th>Completed</Th>
              </tr>
            </thead>
            <tbody>
              {quiz.attempts.slice(0, 20).map((attempt, index) => (
                <tr key={attempt.id} className="hover:bg-surface-hover">
                  <Td className="numeric text-right text-muted">{index + 1}</Td>
                  <Td className="font-medium">
                    {attempt.student.firstName} {attempt.student.lastName ?? ""}
                    <span className="ml-1 text-[11px] text-muted">{attempt.student.admissionNo}</span>
                  </Td>
                  <Td className="numeric text-right">
                    {attempt.score}/{attempt.totalPoints}
                  </Td>
                  <Td className="numeric text-right">{scorePercent(attempt.score, attempt.totalPoints)}%</Td>
                  <Td className="text-muted-strong">
                    {attempt.completedAt ? formatDate(attempt.completedAt) : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
