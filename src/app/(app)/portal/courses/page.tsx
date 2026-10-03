import Link from "next/link";

import { ChildSwitcher } from "@/app/(app)/portal/child-switcher";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatTile,
} from "@/components/ui";
import { courseProgress, totalDuration } from "@/lib/lms";
import { resolvePortalStudent } from "@/lib/portal";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Courses" };

export default async function PortalCoursesPage({
  searchParams,
}: PageProps<"/portal/courses">) {
  const params = await searchParams;
  const { context, child } = await resolvePortalStudent(params.child);
  const session = context.session;
  const db = scopedDb(session.schoolId);
  const yearId = session.academicYear?.id;

  // Which class this child is in decides which courses they may see.
  const enrollment = await db.enrollment.findFirst({
    where: { studentId: child.id, ...(yearId ? { academicYearId: yearId } : {}) },
    select: { section: { select: { classLevelId: true } } },
  });
  const classLevelId = enrollment?.section.classLevelId ?? null;

  const courses = await db.course.findMany({
    where: {
      status: "PUBLISHED",
      OR: [{ classLevelId: null }, ...(classLevelId ? [{ classLevelId }] : [])],
    },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      title: true,
      summary: true,
      subject: { select: { name: true } },
      teacher: { select: { firstName: true, lastName: true } },
      lessons: {
        select: {
          durationMinutes: true,
          progress: { where: { studentId: child.id }, select: { id: true } },
        },
      },
    },
  });

  const withProgress = courses.map((course) => {
    const total = course.lessons.length;
    const done = course.lessons.filter((l) => l.progress.length > 0).length;
    return { ...course, total, done, percent: courseProgress(done, total) };
  });

  const started = withProgress.filter((c) => c.done > 0 && c.percent < 100).length;
  const completed = withProgress.filter((c) => c.total > 0 && c.percent === 100).length;

  return (
    <>
      <PageHeader
        title="Courses"
        description={`${child.firstName} ${child.lastName ?? ""} · ${child.className ?? child.admissionNo}`}
      />

      <ChildSwitcher students={context.children} selectedId={child.id} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Available" value={String(withProgress.length)} sublabel="published for your class" />
        <StatTile label="In progress" value={String(started)} tone={started > 0 ? "warning" : "neutral"} />
        <StatTile label="Completed" value={String(completed)} tone={completed > 0 ? "success" : "neutral"} />
      </div>

      <Card className="mt-4">
        <CardHeader title="Your courses" description="Tap a course to start learning" />
        {withProgress.length === 0 ? (
          <EmptyState
            title="No courses yet"
            description="When your teachers publish course material for your class, it will appear here."
          />
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {withProgress.map((course) => (
              <Link
                key={course.id}
                href={`/portal/courses/${course.id}?child=${child.id}`}
                className="group flex flex-col rounded-[var(--radius-base)] border border-border bg-surface p-4 transition-colors hover:border-brand hover:bg-surface-hover"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold group-hover:text-brand">{course.title}</h3>
                  {course.total > 0 && course.percent === 100 ? (
                    <Badge tone="success">Done</Badge>
                  ) : course.subject ? (
                    <Badge tone="info">{course.subject.name}</Badge>
                  ) : null}
                </div>
                {course.summary ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{course.summary}</p>
                ) : null}
                <p className="mt-2 text-[11px] text-muted">
                  {course.total} lesson{course.total === 1 ? "" : "s"} · {totalDuration(course.lessons)}
                  {course.teacher
                    ? ` · ${course.teacher.firstName} ${course.teacher.lastName ?? ""}`.trimEnd()
                    : ""}
                </p>
                <div className="mt-3">
                  <ProgressBar value={course.percent} tone={course.percent === 100 ? "success" : "brand"} />
                  <p className="mt-1 text-[11px] text-muted">
                    {course.done} / {course.total} complete · {course.percent}%
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
