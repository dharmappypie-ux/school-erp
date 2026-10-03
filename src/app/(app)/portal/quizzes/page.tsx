import Link from "next/link";

import { ChildSwitcher } from "@/app/(app)/portal/child-switcher";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
} from "@/components/ui";
import { resolvePortalStudent } from "@/lib/portal";
import { computeStreak, isQuizOpen, scorePercent } from "@/lib/quiz";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Quizzes" };

export default async function PortalQuizzesPage({
  searchParams,
}: PageProps<"/portal/quizzes">) {
  const params = await searchParams;
  const { context, child } = await resolvePortalStudent(params.child);
  const session = context.session;
  const db = scopedDb(session.schoolId);
  const yearId = session.academicYear?.id;

  const enrollment = await db.enrollment.findFirst({
    where: { studentId: child.id, ...(yearId ? { academicYearId: yearId } : {}) },
    select: { section: { select: { classLevelId: true } } },
  });
  const classLevelId = enrollment?.section.classLevelId ?? null;

  const [quizzes, myAttempts, leaderboard] = await Promise.all([
    db.quiz.findMany({
      where: {
        status: "PUBLISHED",
        OR: [{ classLevelId: null }, ...(classLevelId ? [{ classLevelId }] : [])],
      },
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        availableFrom: true,
        availableUntil: true,
        status: true,
        subject: { select: { name: true } },
        _count: { select: { questions: true } },
        attempts: {
          where: { studentId: child.id },
          select: { id: true, score: true, totalPoints: true, completedAt: true },
        },
      },
    }),
    // tenant-safe: filtered by quiz.schoolId and by this viewer's own child.
    db.quizAttempt.findMany({
      where: { studentId: child.id, quiz: { schoolId: session.schoolId }, completedAt: { not: null } },
      select: { completedAt: true },
    }),
    // tenant-safe: aggregate is bounded to this school through quiz.schoolId.
    db.quizAttempt.groupBy({
      by: ["studentId"],
      where: { quiz: { schoolId: session.schoolId }, completedAt: { not: null } },
      _sum: { score: true },
    }),
  ]);

  const openQuizzes = quizzes.filter((q) => isQuizOpen(q));
  const available = openQuizzes.filter((q) => q.attempts.length === 0 && q._count.questions > 0);
  const completed = quizzes
    .filter((q) => q.attempts.some((a) => a.completedAt))
    .map((q) => ({ quiz: q, attempt: q.attempts.find((a) => a.completedAt)! }));

  // Gamification: points, rank and streak for this child.
  const ranked = leaderboard
    .map((row) => ({ studentId: row.studentId, points: row._sum.score ?? 0 }))
    .sort((a, b) => b.points - a.points);
  const myPoints = ranked.find((r) => r.studentId === child.id)?.points ?? 0;
  const myRank = ranked.findIndex((r) => r.studentId === child.id);
  const streak = computeStreak(myAttempts.map((a) => a.completedAt!).filter(Boolean));

  return (
    <>
      <PageHeader
        title="Quizzes"
        description={`${child.firstName} ${child.lastName ?? ""} · ${child.className ?? child.admissionNo}`}
      />

      <ChildSwitcher students={context.children} selectedId={child.id} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Points" value={String(myPoints)} sublabel="earned all-time" tone="brand" />
        <StatTile
          label="Rank"
          value={myRank >= 0 ? `#${myRank + 1}` : "—"}
          sublabel={ranked.length > 0 ? `of ${ranked.length} students` : "play to rank"}
          tone={myRank === 0 && ranked.length > 0 ? "success" : "neutral"}
        />
        <StatTile
          label="Streak"
          value={streak > 0 ? `${streak} 🔥` : "0"}
          sublabel={streak > 0 ? "days in a row" : "play daily to build one"}
          tone={streak > 0 ? "warning" : "neutral"}
        />
      </div>

      <Card className="mt-4">
        <CardHeader title="Play now" description="Quizzes waiting for you" />
        {available.length === 0 ? (
          <EmptyState
            title="Nothing to play right now"
            description="New quizzes for your class will show up here. Check back tomorrow!"
          />
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {available.map((quiz) => (
              <div
                key={quiz.id}
                className="flex flex-col rounded-[var(--radius-base)] border border-border bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold">{quiz.title}</h3>
                  {quiz.subject ? <Badge tone="info">{quiz.subject.name}</Badge> : null}
                </div>
                {quiz.description ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{quiz.description}</p>
                ) : null}
                <p className="mt-2 text-[11px] text-muted">
                  {quiz._count.questions} question{quiz._count.questions === 1 ? "" : "s"}
                </p>
                <div className="mt-3">
                  <ButtonLink href={`/portal/quizzes/${quiz.id}?child=${child.id}`} size="sm">
                    Start quiz
                  </ButtonLink>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="Completed" description="Your past results" />
        {completed.length === 0 ? (
          <EmptyState title="No quizzes completed yet" />
        ) : (
          <ul className="divide-y divide-border">
            {completed.map(({ quiz, attempt }) => {
              const percent = scorePercent(attempt.score, attempt.totalPoints);
              return (
                <li key={quiz.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <Link href={`/portal/quizzes/${quiz.id}?child=${child.id}`} className="min-w-0 hover:text-brand">
                    <p className="truncate text-sm font-medium">{quiz.title}</p>
                    <p className="text-[11px] text-muted">{quiz.subject?.name ?? "General"}</p>
                  </Link>
                  <Badge tone={percent >= 60 ? "success" : percent >= 40 ? "warning" : "danger"}>
                    {attempt.score}/{attempt.totalPoints} · {percent}%
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
