import { notFound } from "next/navigation";

import { LessonComplete } from "@/app/(app)/portal/courses/[id]/lesson-progress";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
} from "@/components/ui";
import {
  RESOURCE_TYPE_GLYPH,
  courseProgress,
  formatDuration,
  totalDuration,
} from "@/lib/lms";
import { resolvePortalStudent } from "@/lib/portal";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Course" };

export default async function PortalCourseDetailPage({
  params,
  searchParams,
}: PageProps<"/portal/courses/[id]">) {
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

  const course = await db.course.findFirst({
    where: {
      id,
      status: "PUBLISHED",
      OR: [{ classLevelId: null }, ...(classLevelId ? [{ classLevelId }] : [])],
    },
    select: {
      id: true,
      title: true,
      summary: true,
      description: true,
      subject: { select: { name: true } },
      classLevel: { select: { name: true } },
      teacher: { select: { firstName: true, lastName: true } },
      lessons: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          sequence: true,
          title: true,
          content: true,
          videoUrl: true,
          durationMinutes: true,
          resources: {
            orderBy: { createdAt: "asc" },
            select: { id: true, title: true, type: true, url: true },
          },
          progress: { where: { studentId: child.id }, select: { id: true } },
        },
      },
      resources: {
        where: { lessonId: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, type: true, url: true },
      },
    },
  });

  if (!course) notFound();

  const done = course.lessons.filter((l) => l.progress.length > 0).length;
  const percent = courseProgress(done, course.lessons.length);

  return (
    <>
      <div className="mb-3">
        <ButtonLink href={`/portal/courses?child=${child.id}`} variant="ghost" size="sm">
          ← All courses
        </ButtonLink>
      </div>

      <PageHeader title={course.title} description={course.summary ?? undefined} />

      <div className="flex flex-wrap items-center gap-1.5">
        {course.subject ? <Badge tone="info">{course.subject.name}</Badge> : null}
        {course.classLevel ? <Badge tone="brand">{course.classLevel.name}</Badge> : null}
        {course.teacher ? (
          <Badge tone="neutral">
            {`${course.teacher.firstName} ${course.teacher.lastName ?? ""}`.trim()}
          </Badge>
        ) : null}
        <span className="text-xs text-muted">
          {course.lessons.length} lesson{course.lessons.length === 1 ? "" : "s"} · {totalDuration(course.lessons)}
        </span>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Your progress"
          description={`${done} of ${course.lessons.length} lessons complete`}
          action={<Badge tone={percent === 100 ? "success" : "brand"}>{percent}%</Badge>}
        />
        <div className="px-5 py-4">
          <ProgressBar value={percent} tone={percent === 100 ? "success" : "brand"} />
        </div>
      </Card>

      {course.description ? (
        <Card className="mt-4">
          <CardHeader title="About this course" />
          <p className="whitespace-pre-wrap px-5 py-4 text-sm text-muted-strong">{course.description}</p>
        </Card>
      ) : null}

      {course.lessons.length === 0 ? (
        <Card className="mt-4">
          <EmptyState title="No lessons yet" description="Check back soon — your teacher is still building this course." />
        </Card>
      ) : (
        <div className="mt-4 space-y-4">
          {course.lessons.map((lesson) => {
            const isDone = lesson.progress.length > 0;
            return (
              <Card key={lesson.id}>
                <CardHeader
                  title={
                    <span>
                      <span className="text-muted">Lesson {lesson.sequence} · </span>
                      {lesson.title}
                    </span>
                  }
                  description={formatDuration(lesson.durationMinutes)}
                  action={isDone ? <Badge tone="success">Completed</Badge> : undefined}
                />
                <div className="space-y-3 px-5 py-4">
                  {lesson.content ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {lesson.content}
                    </p>
                  ) : (
                    <p className="text-sm text-muted">No written content for this lesson.</p>
                  )}

                  {lesson.videoUrl ? (
                    <a
                      href={lesson.videoUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
                    >
                      <span aria-hidden>🎬</span> Watch the lesson video
                    </a>
                  ) : null}

                  {lesson.resources.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {lesson.resources.map((resource) => (
                        <a
                          key={resource.id}
                          href={resource.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1 text-xs text-muted-strong hover:text-brand"
                        >
                          <span aria-hidden>{RESOURCE_TYPE_GLYPH[resource.type]}</span>
                          {resource.title}
                        </a>
                      ))}
                    </div>
                  ) : null}

                  <div className="pt-1">
                    <LessonComplete lessonId={lesson.id} childId={child.id} complete={isDone} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {course.resources.length > 0 ? (
        <Card className="mt-4">
          <CardHeader title="Course resources" description="Reference material for the whole course" />
          <ul className="divide-y divide-border">
            {course.resources.map((resource) => (
              <li key={resource.id} className="px-5 py-3">
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-2 text-sm hover:text-brand"
                >
                  <span aria-hidden className="text-base">{RESOURCE_TYPE_GLYPH[resource.type]}</span>
                  <span className="truncate">{resource.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
