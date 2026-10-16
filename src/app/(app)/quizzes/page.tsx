import Link from "next/link";

import { AddQuiz } from "@/app/(app)/quizzes/quiz-panels";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
} from "@/components/ui";
import { requireAnyPermission, requireFeature } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { QUIZ_STATUS_LABEL, QUIZ_STATUS_TONE } from "@/lib/quiz";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Quizzes" };

export default async function QuizzesPage() {
  const session = await requireAnyPermission(["quiz.read", "quiz.manage"]);
  await requireFeature("lms");
  const db = scopedDb(session.schoolId);

  const [quizzes, classLevels, subjects, teachers] = await Promise.all([
    db.quiz.findMany({
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        classLevel: { select: { name: true } },
        subject: { select: { name: true } },
        teacher: { select: { firstName: true, lastName: true } },
        _count: { select: { questions: true, attempts: true } },
      },
    }),
    db.classLevel.findMany({ orderBy: { numericOrder: "asc" }, select: { id: true, name: true } }),
    db.subject.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.staffMember.findMany({
      where: { staffType: "TEACHING", employmentStatus: "ACTIVE", deletedAt: null },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const published = quizzes.filter((q) => q.status === "PUBLISHED").length;
  const totalAttempts = quizzes.reduce((sum, q) => sum + q._count.attempts, 0);
  const totalQuestions = quizzes.reduce((sum, q) => sum + q._count.questions, 0);
  const canManage = hasPermission(session.permissions, "quiz.manage");

  return (
    <>
      <PageHeader
        title="Quizzes"
        description={`${quizzes.length} quizzes · ${totalAttempts} attempts`}
        action={
          canManage ? (
            <AddQuiz
              classLevels={classLevels.map((l) => ({ value: l.id, label: l.name }))}
              subjects={subjects.map((s) => ({ value: s.id, label: s.name }))}
              teachers={teachers.map((t) => ({
                value: t.id,
                label: `${t.firstName} ${t.lastName ?? ""}`.trim(),
              }))}
            />
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Published" value={String(published)} sublabel="live in the portal" tone={published > 0 ? "success" : "neutral"} />
        <StatTile label="Total quizzes" value={String(quizzes.length)} sublabel="in the bank" />
        <StatTile label="Questions" value={String(totalQuestions)} sublabel="across all quizzes" />
        <StatTile label="Attempts" value={String(totalAttempts)} sublabel="by students" tone={totalAttempts > 0 ? "brand" : "neutral"} />
      </div>

      <Card className="mt-4">
        <CardHeader title="Quiz bank" description="Drafts first, then by recent activity" />
        {quizzes.length === 0 ? (
          <EmptyState
            title="No quizzes yet"
            description={
              canManage
                ? "Create a quiz, add questions, then publish it so students can play."
                : "Quizzes your school builds will appear here."
            }
          />
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {quizzes.map((quiz) => (
              <Link
                key={quiz.id}
                href={`/quizzes/${quiz.id}`}
                className="group flex flex-col rounded-[var(--radius-base)] border border-border bg-surface p-4 transition-colors hover:border-brand hover:bg-surface-hover"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold group-hover:text-brand">{quiz.title}</h3>
                  <Badge tone={QUIZ_STATUS_TONE[quiz.status]}>{QUIZ_STATUS_LABEL[quiz.status]}</Badge>
                </div>
                {quiz.description ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{quiz.description}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                  {quiz.classLevel ? <Badge tone="brand">{quiz.classLevel.name}</Badge> : <Badge tone="neutral">All classes</Badge>}
                  {quiz.subject ? <Badge tone="info">{quiz.subject.name}</Badge> : null}
                </div>
                <p className="mt-3 text-[11px] text-muted">
                  {quiz._count.questions} question{quiz._count.questions === 1 ? "" : "s"} ·{" "}
                  {quiz._count.attempts} attempt{quiz._count.attempts === 1 ? "" : "s"}
                  {quiz.teacher ? ` · ${quiz.teacher.firstName} ${quiz.teacher.lastName ?? ""}`.trimEnd() : ""}
                </p>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
