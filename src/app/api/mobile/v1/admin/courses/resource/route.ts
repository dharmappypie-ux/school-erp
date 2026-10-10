import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { isSafeHttpUrl } from "@/lib/lms";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  courseId: z.string().min(1),
  lessonId: z.string().trim().optional(),
  title: z.string().trim().min(2, "A resource title is required").max(160),
  type: z.enum(["LINK", "PDF", "VIDEO", "DOCUMENT", "IMAGE", "OTHER"]),
  url: z.string().trim().min(1, "A URL is required"),
});

/** POST /api/mobile/v1/admin/courses/resource — attach a resource to a course/lesson (mirror of web addResource). */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "lms.manage", { feature: "lms" });
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { courseId, lessonId, title, type, url } = parsed.data;

  if (!isSafeHttpUrl(url)) {
    return cors(NextResponse.json({ error: "The resource URL must be a http(s) link." }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const course = await db.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) return cors(NextResponse.json({ error: "Course not found." }, { status: 404 }));

  if (lessonId) {
    const lesson = await db.lesson.findFirst({ where: { id: lessonId, courseId }, select: { id: true } });
    if (!lesson) return cors(NextResponse.json({ error: "That lesson is not part of this course." }, { status: 404 }));
  }

  const resource = await db.courseResource.create({
    data: { courseId, lessonId: lessonId || null, title, type, url },
    select: { id: true, title: true },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "lms.resource.create", entityType: "CourseResource", entityId: resource.id,
    after: { courseId, lessonId: lessonId || null, title, type, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: `Resource “${resource.title}” attached.` }));
}
