import Link from "next/link";

import { ChildSwitcher } from "@/app/(app)/portal/child-switcher";
import { StudyTips } from "@/app/(app)/portal/learning-plan/study-tips";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  type Tone,
} from "@/components/ui";
import {
  classLevelForStudent,
  gatherCatalog,
  gatherLearningSignals,
} from "@/lib/ai/learning";
import { buildLearningPlan, type Priority } from "@/lib/ai/recommend";
import { resolvePortalStudent } from "@/lib/portal";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Learning plan" };

const PRIORITY_TONE: Record<Priority, Tone> = {
  high: "danger",
  medium: "warning",
  low: "info",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  high: "Focus first",
  medium: "Work on",
  low: "Keep going",
};

export default async function LearningPlanPage({
  searchParams,
}: PageProps<"/portal/learning-plan">) {
  const params = await searchParams;
  const { context, child } = await resolvePortalStudent(params.child);
  const session = context.session;
  const db = scopedDb(session.schoolId);
  const yearId = session.academicYear?.id;
  const name = `${child.firstName} ${child.lastName ?? ""}`.trim();

  const classLevelId = await classLevelForStudent(db, child.id, yearId);
  const [signals, catalog] = await Promise.all([
    gatherLearningSignals(db, { id: child.id, name }, yearId, session.schoolId),
    gatherCatalog(db, classLevelId),
  ]);
  const plan = buildLearningPlan(signals, catalog.courses, catalog.quizzes);

  const hasData =
    signals.subjects.length > 0 ||
    signals.quizzesTaken > 0 ||
    signals.attendanceRate !== null;

  return (
    <>
      <PageHeader
        title="Learning plan"
        description={`${child.firstName} ${child.lastName ?? ""} · ${child.className ?? child.admissionNo}`}
      />

      <ChildSwitcher students={context.children} selectedId={child.id} />

      {!hasData ? (
        <Card>
          <EmptyState
            title="Not enough data yet"
            description="Once there are marks, quiz results or attendance on record, a personalized plan will appear here."
          />
        </Card>
      ) : (
        <>
          <Card>
            <div className="px-5 py-5">
              <p className="text-base font-medium text-foreground">{plan.headline}</p>
              {plan.strengths.length > 0 ? (
                <p className="mt-2 text-sm text-muted-strong">
                  <span className="font-medium text-success">Strengths:</span>{" "}
                  {plan.strengths.join(", ")}.
                </p>
              ) : null}
            </div>
          </Card>

          <Card className="mt-4">
            <CardHeader title="What to work on" description="Personalized from your recent results" />
            {plan.recommendations.length === 0 ? (
              <EmptyState title="Nothing flagged" description="You're on track — keep up the good work!" />
            ) : (
              <ul className="divide-y divide-border">
                {plan.recommendations.map((rec) => (
                  <li key={rec.key} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{rec.focus}</p>
                      <Badge tone={PRIORITY_TONE[rec.priority]}>{PRIORITY_LABEL[rec.priority]}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-strong">{rec.reason}</p>
                    <p className="mt-1 text-sm text-foreground">{rec.action}</p>
                    {(rec.courseId || rec.quizId) ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {rec.courseId ? (
                          <Link
                            href={`/portal/courses/${rec.courseId}?child=${child.id}`}
                            className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand hover:underline"
                          >
                            📘 {rec.courseTitle}
                          </Link>
                        ) : null}
                        {rec.quizId ? (
                          <Link
                            href={`/portal/quizzes/${rec.quizId}?child=${child.id}`}
                            className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-muted-strong hover:text-brand"
                          >
                            📝 {rec.quizTitle}
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="mt-4">
            <CardHeader title="Study tips" description="A little encouragement, tailored to you" />
            <div className="px-5 py-4">
              <StudyTips childId={child.id} />
            </div>
          </Card>
        </>
      )}
    </>
  );
}
