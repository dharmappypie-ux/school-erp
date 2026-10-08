import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/admin/courses — courses with lesson counts. */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["lms.manage", "lms.publish", "lms.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const rows = await db.course.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, title: true, status: true,
      subject: { select: { name: true } },
      _count: { select: { lessons: true } },
    },
  });

  return cors(NextResponse.json({
    items: rows.map((c) => ({
      id: c.id, title: c.title, status: c.status,
      subject: c.subject?.name ?? "General", lessons: c._count.lessons,
    })),
  }));
}

const Schema = z.object({
  title: z.string().trim().min(2, "A course title is required").max(160),
  summary: z.string().trim().max(400).optional(),
  description: z.string().trim().max(2000).optional(),
  subjectId: z.string().trim().optional(),
});

/** POST /api/mobile/v1/admin/courses — create a course (draft). */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "lms.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  if (parsed.data.subjectId) {
    const subject = await db.subject.findUnique({ where: { id: parsed.data.subjectId }, select: { id: true } });
    if (!subject) return cors(NextResponse.json({ error: "That subject is not in your school." }, { status: 404 }));
  }

  const course = await db.course.create({
    data: {
      schoolId: session.schoolId,
      title: parsed.data.title,
      summary: parsed.data.summary || null,
      description: parsed.data.description || null,
      subjectId: parsed.data.subjectId || null,
      teacherId: session.staffId ?? null,
    },
    select: { id: true, title: true },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "lms.course.create", entityType: "Course", entityId: course.id,
    after: { title: course.title, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, id: course.id, message: `“${course.title}” created. Add lessons on the web.` }));
}
