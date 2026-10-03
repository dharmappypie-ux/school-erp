"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { isSafeHttpUrl } from "@/lib/lms";
import { scopedDb } from "@/lib/tenant";

export interface ActionResult {
  ok: boolean;
  message: string;
  values?: Record<string, string>;
}

const CourseSchema = z.object({
  title: z.string().trim().min(2, "A course title is required").max(120),
  summary: z.string().trim().max(240).optional(),
  description: z.string().trim().max(4000).optional(),
  classLevelId: z.string().trim().optional(),
  subjectId: z.string().trim().optional(),
  teacherId: z.string().trim().optional(),
});

/**
 * Creates a course. It starts as a DRAFT and is invisible to students until
 * published — so a half-written course can be built up over several sittings
 * without leaking to the portal.
 */
export async function createCourse(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = CourseSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("lms.manage");
  const db = scopedDb(session.schoolId);
  const { title, summary, description, classLevelId, subjectId, teacherId } = parsed.data;

  // Validate every referenced record belongs to this school before writing.
  if (classLevelId) {
    const level = await db.classLevel.findUnique({ where: { id: classLevelId }, select: { id: true } });
    if (!level) return { ok: false, message: "That class does not exist in your school.", values: raw };
  }
  if (subjectId) {
    const subject = await db.subject.findUnique({ where: { id: subjectId }, select: { id: true } });
    if (!subject) return { ok: false, message: "That subject does not exist in your school.", values: raw };
  }
  if (teacherId) {
    const teacher = await db.staffMember.findUnique({ where: { id: teacherId }, select: { id: true } });
    if (!teacher) return { ok: false, message: "That teacher does not exist in your school.", values: raw };
  }

  const course = await db.course.create({
    data: {
      schoolId: session.schoolId,
      title,
      summary: summary || null,
      description: description || null,
      classLevelId: classLevelId || null,
      subjectId: subjectId || null,
      teacherId: teacherId || null,
    },
    select: { id: true, title: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "lms.course.create",
    entityType: "Course",
    entityId: course.id,
    after: { title: course.title },
  });

  revalidatePath("/academics/courses");
  return { ok: true, message: `“${course.title}” created. Add lessons, then publish it.` };
}

const StatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);

/**
 * Moves a course between draft / published / archived. Publishing stamps
 * `publishedAt` and requires `lms.publish`; only a course with at least one
 * lesson can be published, since an empty course is useless to a student.
 */
export async function setCourseStatus(
  courseId: string,
  status: z.infer<typeof StatusSchema>,
): Promise<ActionResult> {
  const parsed = StatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, message: "Invalid status." };

  const session = await requirePermission(
    parsed.data === "PUBLISHED" ? "lms.publish" : "lms.manage",
  );
  const db = scopedDb(session.schoolId);

  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, status: true, _count: { select: { lessons: true } } },
  });
  if (!course) return { ok: false, message: "Course not found." };

  if (parsed.data === "PUBLISHED" && course._count.lessons === 0) {
    return { ok: false, message: "Add at least one lesson before publishing." };
  }

  await db.course.update({
    where: { id: courseId },
    data: {
      status: parsed.data,
      publishedAt: parsed.data === "PUBLISHED" ? new Date() : null,
    },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: `lms.course.${parsed.data.toLowerCase()}`,
    entityType: "Course",
    entityId: course.id,
    before: { status: course.status },
    after: { status: parsed.data },
  });

  revalidatePath("/academics/courses");
  revalidatePath(`/academics/courses/${courseId}`);
  revalidatePath("/portal/courses");
  const verb =
    parsed.data === "PUBLISHED" ? "published" : parsed.data === "ARCHIVED" ? "archived" : "moved to draft";
  return { ok: true, message: `“${course.title}” ${verb}.` };
}

const LessonSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().trim().min(2, "A lesson title is required").max(160),
  content: z.string().trim().max(20000).optional(),
  videoUrl: z.string().trim().optional(),
  durationMinutes: z.coerce.number().int().min(0).max(1000).optional(),
});

/**
 * Appends a lesson to a course. The sequence is assigned automatically as the
 * next slot, so lessons stay contiguously ordered without the author juggling
 * numbers by hand.
 */
export async function createLesson(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = LessonSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("lms.manage");
  const db = scopedDb(session.schoolId);
  const { courseId, title, content, videoUrl, durationMinutes } = parsed.data;

  if (videoUrl && !isSafeHttpUrl(videoUrl)) {
    return { ok: false, message: "The video URL must be a http(s) link.", values: raw };
  }

  // Course is tenant-scoped, so this lookup also proves it is ours.
  const course = await db.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) return { ok: false, message: "Course not found.", values: raw };

  // tenant-safe: courseId was validated against the scoped course lookup above.
  const last = await db.lesson.findFirst({
    where: { courseId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  const sequence = (last?.sequence ?? 0) + 1;

  // tenant-safe: courseId was validated against the scoped course lookup above.
  const lesson = await db.lesson.create({
    data: {
      courseId,
      sequence,
      title,
      content: content || null,
      videoUrl: videoUrl || null,
      durationMinutes: durationMinutes && durationMinutes > 0 ? durationMinutes : null,
    },
    select: { id: true, title: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "lms.lesson.create",
    entityType: "Lesson",
    entityId: lesson.id,
    after: { courseId, title: lesson.title, sequence },
  });

  revalidatePath(`/academics/courses/${courseId}`);
  return { ok: true, message: `Lesson ${sequence}: “${lesson.title}” added.` };
}

/**
 * Deletes a lesson and closes the gap it leaves, renumbering the lessons after
 * it so the sequence stays contiguous. Runs in a transaction so a partial
 * renumber can never leave two lessons sharing a slot.
 */
export async function deleteLesson(lessonId: string): Promise<ActionResult> {
  const session = await requirePermission("lms.manage");
  const db = scopedDb(session.schoolId);

  // tenant-safe: the lesson is reached through its course, filtered to this school.
  const lesson = await db.lesson.findFirst({
    where: { id: lessonId, course: { schoolId: session.schoolId } },
    select: { id: true, title: true, sequence: true, courseId: true },
  });
  if (!lesson) return { ok: false, message: "Lesson not found." };

  // tenant-safe: both writes target the lesson located above via its course,
  // and the renumber is confined to that same lesson's course.
  await db.$transaction([
    db.lesson.delete({ where: { id: lesson.id } }),
    db.lesson.updateMany({
      where: { courseId: lesson.courseId, sequence: { gt: lesson.sequence } },
      data: { sequence: { decrement: 1 } },
    }),
  ]);

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "lms.lesson.delete",
    entityType: "Lesson",
    entityId: lesson.id,
    before: { title: lesson.title, courseId: lesson.courseId },
  });

  revalidatePath(`/academics/courses/${lesson.courseId}`);
  revalidatePath("/portal/courses");
  return { ok: true, message: `“${lesson.title}” removed.` };
}

const ResourceSchema = z.object({
  courseId: z.string().min(1),
  lessonId: z.string().trim().optional(),
  title: z.string().trim().min(2, "A resource title is required").max(160),
  type: z.enum(["LINK", "PDF", "VIDEO", "DOCUMENT", "IMAGE", "OTHER"]),
  url: z.string().trim().min(1, "A URL is required"),
});

/** Attaches a resource (link or file URL) to a course, optionally to a lesson. */
export async function addResource(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = ResourceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("lms.manage");
  const db = scopedDb(session.schoolId);
  const { courseId, lessonId, title, type, url } = parsed.data;

  if (!isSafeHttpUrl(url)) {
    return { ok: false, message: "The resource URL must be a http(s) link.", values: raw };
  }

  const course = await db.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) return { ok: false, message: "Course not found.", values: raw };

  if (lessonId) {
    // tenant-safe: courseId was validated against the scoped course lookup above.
    const lesson = await db.lesson.findFirst({
      where: { id: lessonId, courseId },
      select: { id: true },
    });
    if (!lesson) return { ok: false, message: "That lesson is not part of this course.", values: raw };
  }

  // tenant-safe: courseId was validated against the scoped course lookup above.
  const resource = await db.courseResource.create({
    data: { courseId, lessonId: lessonId || null, title, type, url },
    select: { id: true, title: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "lms.resource.create",
    entityType: "CourseResource",
    entityId: resource.id,
    after: { courseId, title: resource.title, type },
  });

  revalidatePath(`/academics/courses/${courseId}`);
  revalidatePath("/portal/courses");
  return { ok: true, message: `Resource “${resource.title}” attached.` };
}

/** Removes a resource. */
export async function deleteResource(resourceId: string): Promise<ActionResult> {
  const session = await requirePermission("lms.manage");
  const db = scopedDb(session.schoolId);

  // tenant-safe: the resource is reached through its course, filtered to this school.
  const resource = await db.courseResource.findFirst({
    where: { id: resourceId, course: { schoolId: session.schoolId } },
    select: { id: true, title: true, courseId: true },
  });
  if (!resource) return { ok: false, message: "Resource not found." };

  // tenant-safe: the resource was located above through its course in this school.
  await db.courseResource.delete({ where: { id: resource.id } });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "lms.resource.delete",
    entityType: "CourseResource",
    entityId: resource.id,
    before: { title: resource.title, courseId: resource.courseId },
  });

  revalidatePath(`/academics/courses/${resource.courseId}`);
  revalidatePath("/portal/courses");
  return { ok: true, message: `“${resource.title}” removed.` };
}
