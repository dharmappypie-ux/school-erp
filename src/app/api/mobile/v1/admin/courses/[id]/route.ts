import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/courses/[id]
 *
 * One course for the admin/teacher authoring view: status, lessons (content,
 * video, resources) and course-level resources. Mirror of the web course detail.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobile(req, ["lms.read", "lms.manage"], { feature: "lms" });
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  const { id } = await ctx.params;

  const db = scopedDb(session.schoolId);
  const c = await db.course.findUnique({
    where: { id },
    select: {
      id: true, title: true, summary: true, description: true, status: true,
      subject: { select: { name: true } },
      classLevel: { select: { name: true } },
      teacher: { select: { firstName: true, lastName: true } },
      lessons: {
        orderBy: { sequence: "asc" },
        select: {
          id: true, sequence: true, title: true, content: true, videoUrl: true, durationMinutes: true,
          resources: { orderBy: { createdAt: "asc" }, select: { id: true, title: true, type: true, url: true } },
        },
      },
      resources: {
        where: { lessonId: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, type: true, url: true },
      },
    },
  });
  if (!c) return cors(NextResponse.json({ error: "Course not found." }, { status: 404 }));

  const canManage = guard.permissions.includes("*") ||
    guard.permissions.includes("lms.manage") || guard.permissions.includes("lms.*");
  const canPublish = guard.permissions.includes("*") ||
    guard.permissions.includes("lms.publish") || guard.permissions.includes("lms.*");

  return cors(NextResponse.json({
    id: c.id,
    title: c.title,
    summary: c.summary,
    description: c.description,
    status: c.status,
    subject: c.subject?.name ?? null,
    classLevel: c.classLevel?.name ?? null,
    teacher: c.teacher ? `${c.teacher.firstName} ${c.teacher.lastName ?? ""}`.trim() : null,
    canManage,
    canPublish,
    lessons: c.lessons.map((l) => ({
      id: l.id, sequence: l.sequence, title: l.title, content: l.content,
      videoUrl: l.videoUrl, durationMinutes: l.durationMinutes,
      resources: l.resources,
    })),
    resources: c.resources,
  }));
}
