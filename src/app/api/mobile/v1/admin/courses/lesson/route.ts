import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { isSafeHttpUrl } from "@/lib/lms";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  courseId: z.string().min(1),
  title: z.string().trim().min(2, "A lesson title is required").max(160),
  content: z.string().trim().max(20000).optional(),
  videoUrl: z.string().trim().optional(),
  durationMinutes: z.coerce.number().int().min(0).max(1000).optional(),
});

/** POST /api/mobile/v1/admin/courses/lesson — add a lesson to a course (mirror of web createLesson). */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "lms.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { courseId, title, content, videoUrl, durationMinutes } = parsed.data;

  if (videoUrl && !isSafeHttpUrl(videoUrl)) {
    return cors(NextResponse.json({ error: "The video URL must be a http(s) link." }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const course = await db.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) return cors(NextResponse.json({ error: "Course not found." }, { status: 404 }));

  const last = await db.lesson.findFirst({ where: { courseId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
  const sequence = (last?.sequence ?? 0) + 1;

  const lesson = await db.lesson.create({
    data: {
      courseId, sequence, title,
      content: content || null,
      videoUrl: videoUrl || null,
      durationMinutes: durationMinutes && durationMinutes > 0 ? durationMinutes : null,
    },
    select: { id: true, title: true },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "lms.lesson.create", entityType: "Lesson", entityId: lesson.id,
    after: { courseId, sequence, title, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: `Lesson ${sequence}: “${lesson.title}” added.` }));
}
