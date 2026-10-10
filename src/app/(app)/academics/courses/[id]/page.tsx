import { notFound } from "next/navigation";

import {
  AddLesson,
  AddResource,
  CourseStatusControls,
  DeleteButton,
} from "@/app/(app)/academics/courses/[id]/lesson-panels";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { requireAnyPermission, requireFeature } from "@/lib/auth";
import {
  COURSE_STATUS_LABEL,
  COURSE_STATUS_TONE,
  RESOURCE_TYPE_GLYPH,
  formatDuration,
  totalDuration,
} from "@/lib/lms";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Course" };

export default async function CourseDetailPage({
  params,
}: PageProps<"/academics/courses/[id]">) {
  const session = await requireAnyPermission(["lms.read", "lms.manage"]);
  await requireFeature("lms");
  const { id } = await params;
  const db = scopedDb(session.schoolId);

  const course = await db.course.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      summary: true,
      description: true,
      status: true,
      publishedAt: true,
      classLevel: { select: { name: true } },
      subject: { select: { name: true } },
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

  const canManage = hasPermission(session.permissions, "lms.manage");
  const canPublish = hasPermission(session.permissions, "lms.publish");
  const lessonOptions = course.lessons.map((l) => ({
    value: l.id,
    label: `${l.sequence}. ${l.title}`,
  }));

  return (
    <>
      <div className="mb-3">
        <ButtonLink href="/academics/courses" variant="ghost" size="sm">
          ← All courses
        </ButtonLink>
      </div>

      <PageHeader
        title={course.title}
        description={course.summary ?? undefined}
        action={
          canManage ? (
            <CourseStatusControls courseId={course.id} status={course.status} canPublish={canPublish} />
          ) : (
            <Badge tone={COURSE_STATUS_TONE[course.status]}>
              {COURSE_STATUS_LABEL[course.status]}
            </Badge>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={COURSE_STATUS_TONE[course.status]}>{COURSE_STATUS_LABEL[course.status]}</Badge>
        {course.classLevel ? <Badge tone="brand">{course.classLevel.name}</Badge> : null}
        {course.subject ? <Badge tone="info">{course.subject.name}</Badge> : null}
        {course.teacher ? (
          <Badge tone="neutral">
            {`${course.teacher.firstName} ${course.teacher.lastName ?? ""}`.trim()}
          </Badge>
        ) : null}
        <span className="text-xs text-muted">
          {course.lessons.length} lesson{course.lessons.length === 1 ? "" : "s"} · {totalDuration(course.lessons)}
        </span>
      </div>

      {course.status === "DRAFT" && canManage ? (
        <div className="mt-3">
          <Alert tone="info" title="This course is a draft">
            Students cannot see it yet. Add lessons and resources, then publish it
            {canPublish ? " with the Publish button above." : " — ask someone with publish rights to make it live."}
          </Alert>
        </div>
      ) : null}

      {course.description ? (
        <Card className="mt-4">
          <CardHeader title="About this course" />
          <p className="whitespace-pre-wrap px-5 py-4 text-sm text-muted-strong">{course.description}</p>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader
          title="Lessons"
          description="Shown to students in this order"
          action={canManage ? <AddLesson courseId={course.id} /> : undefined}
        />
        {course.lessons.length === 0 ? (
          <EmptyState
            title="No lessons yet"
            description={canManage ? "Add the first lesson to build out this course." : "This course has no lessons yet."}
          />
        ) : (
          <ol className="divide-y divide-border">
            {course.lessons.map((lesson) => (
              <li key={lesson.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      <span className="text-muted">{lesson.sequence}.</span> {lesson.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {formatDuration(lesson.durationMinutes)}
                      {lesson.videoUrl ? " · has video" : ""}
                      {lesson.resources.length > 0
                        ? ` · ${lesson.resources.length} resource${lesson.resources.length === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="shrink-0">
                      <DeleteButton kind="lesson" id={lesson.id} label={lesson.title} />
                    </div>
                  ) : null}
                </div>

                {lesson.content ? (
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-muted-strong">
                    {lesson.content}
                  </p>
                ) : null}

                {lesson.resources.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {lesson.resources.map((resource) => (
                      <a
                        key={resource.id}
                        href={resource.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-muted-strong hover:text-brand"
                      >
                        <span aria-hidden>{RESOURCE_TYPE_GLYPH[resource.type]}</span>
                        {resource.title}
                      </a>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Course resources"
          description="Attached to the whole course, not a single lesson"
          action={
            canManage ? <AddResource courseId={course.id} lessons={lessonOptions} /> : undefined
          }
        />
        {course.resources.length === 0 ? (
          <EmptyState
            title="No course-wide resources"
            description={canManage ? "Attach syllabi, reading lists or reference files here." : undefined}
          />
        ) : (
          <ul className="divide-y divide-border">
            {course.resources.map((resource) => (
              <li key={resource.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex min-w-0 items-center gap-2 text-sm hover:text-brand"
                >
                  <span aria-hidden className="text-base">{RESOURCE_TYPE_GLYPH[resource.type]}</span>
                  <span className="truncate">{resource.title}</span>
                </a>
                {canManage ? (
                  <div className="shrink-0">
                    <DeleteButton kind="resource" id={resource.id} label={resource.title} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
