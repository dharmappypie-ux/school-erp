import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  courseId: z.string().min(1),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
});

/**
 * POST /api/mobile/v1/admin/courses/status — publish / unpublish / archive a
 * course. Publishing needs lms.publish and at least one lesson. Mirror of the
 * web `setCourseStatus`.
 */
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { courseId, status } = parsed.data;

  const guard = await requireMobile(req, status === "PUBLISHED" ? "lms.publish" : "lms.manage", { feature: "lms" });
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, status: true, _count: { select: { lessons: true } } },
  });
  if (!course) return cors(NextResponse.json({ error: "Course not found." }, { status: 404 }));
  if (status === "PUBLISHED" && course._count.lessons === 0) {
    return cors(NextResponse.json({ error: "Add at least one lesson before publishing." }, { status: 400 }));
  }

  await db.course.update({
    where: { id: courseId },
    data: { status, publishedAt: status === "PUBLISHED" ? new Date() : null },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: `lms.course.${status.toLowerCase()}`, entityType: "Course", entityId: course.id,
    before: { status: course.status }, after: { status, via: "mobile" },
  });

  const verb = status === "PUBLISHED" ? "published" : status === "ARCHIVED" ? "archived" : "moved to draft";
  return cors(NextResponse.json({ ok: true, message: `“${course.title}” ${verb}.` }));
}
