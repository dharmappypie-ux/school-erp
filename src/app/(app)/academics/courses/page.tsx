import Link from "next/link";

import { AddCourse } from "@/app/(app)/academics/courses/course-panels";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
} from "@/components/ui";
import { requireAnyPermission } from "@/lib/auth";
import { COURSE_STATUS_LABEL, COURSE_STATUS_TONE, totalDuration } from "@/lib/lms";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Courses" };

export default async function CoursesPage() {
  const session = await requireAnyPermission(["lms.read", "lms.manage"]);
  const db = scopedDb(session.schoolId);

  const [courses, classLevels, subjects, teachers] = await Promise.all([
    db.course.findMany({
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        summary: true,
        status: true,
        classLevel: { select: { name: true } },
        subject: { select: { name: true } },
        teacher: { select: { firstName: true, lastName: true } },
        lessons: { select: { durationMinutes: true } },
        _count: { select: { lessons: true, resources: true } },
      },
    }),
    db.classLevel.findMany({
      orderBy: { numericOrder: "asc" },
      select: { id: true, name: true },
    }),
    db.subject.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.staffMember.findMany({
      where: { staffType: "TEACHING", employmentStatus: "ACTIVE", deletedAt: null },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const published = courses.filter((c) => c.status === "PUBLISHED").length;
  const drafts = courses.filter((c) => c.status === "DRAFT").length;
  const totalLessons = courses.reduce((sum, c) => sum + c._count.lessons, 0);
  const canManage = hasPermission(session.permissions, "lms.manage");

  return (
    <>
      <PageHeader
        title="Courses"
        description={`${courses.length} courses · ${totalLessons} lessons`}
        action={
          canManage ? (
            <AddCourse
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
        <StatTile label="Drafts" value={String(drafts)} sublabel="not yet visible to students" tone={drafts > 0 ? "warning" : "neutral"} />
        <StatTile label="Total lessons" value={String(totalLessons)} sublabel="across all courses" />
        <StatTile label="Courses" value={String(courses.length)} sublabel="in the catalogue" />
      </div>

      <Card className="mt-4">
        <CardHeader title="Course catalogue" description="Newest drafts first, then by recent activity" />
        {courses.length === 0 ? (
          <EmptyState
            title="No courses yet"
            description={
              canManage
                ? "Create a course, add lessons and resources, then publish it to your students."
                : "Courses your school builds will appear here."
            }
          />
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {courses.map((course) => (
              <Link
                key={course.id}
                href={`/academics/courses/${course.id}`}
                className="group flex flex-col rounded-[var(--radius-base)] border border-border bg-surface p-4 transition-colors hover:border-brand hover:bg-surface-hover"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold group-hover:text-brand">{course.title}</h3>
                  <Badge tone={COURSE_STATUS_TONE[course.status]}>
                    {COURSE_STATUS_LABEL[course.status]}
                  </Badge>
                </div>
                {course.summary ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{course.summary}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                  {course.classLevel ? <Badge tone="brand">{course.classLevel.name}</Badge> : null}
                  {course.subject ? <Badge tone="info">{course.subject.name}</Badge> : null}
                </div>
                <p className="mt-3 text-[11px] text-muted">
                  {course._count.lessons} lesson{course._count.lessons === 1 ? "" : "s"} ·{" "}
                  {course._count.resources} resource{course._count.resources === 1 ? "" : "s"} ·{" "}
                  {totalDuration(course.lessons)}
                  {course.teacher
                    ? ` · ${course.teacher.firstName} ${course.teacher.lastName ?? ""}`.trimEnd()
                    : ""}
                </p>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
