import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({ sectionId: z.string().min(1, "Choose a class") });

/**
 * POST /api/mobile/v1/admin/student/[id]/promote — move the student to another
 * class/section, mirroring the web `promoteStudent` (deactivates the current
 * enrolment, creates the new one; respects section capacity).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobile(req, "students.update");
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  const { id } = await ctx.params;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const student = await db.student.findUnique({ where: { id }, select: { id: true } });
  if (!student) return cors(NextResponse.json({ error: "Student not found in your school." }, { status: 404 }));

  const section = await db.section.findUnique({
    where: { id: parsed.data.sectionId },
    select: {
      id: true, name: true, capacity: true, academicYearId: true,
      classLevel: { select: { name: true } },
      _count: { select: { enrollments: { where: { isActive: true } } } },
    },
  });
  if (!section) return cors(NextResponse.json({ error: "That class is not in your school." }, { status: 404 }));

  const current = await db.enrollment.findFirst({
    where: { studentId: id, isActive: true },
    select: { id: true, sectionId: true },
  });
  if (current?.sectionId === section.id) {
    return cors(NextResponse.json({ error: "The student is already in that class." }, { status: 409 }));
  }
  if (section._count.enrollments >= section.capacity) {
    return cors(NextResponse.json(
      { error: `${section.classLevel.name} ${section.name} is full (${section._count.enrollments}/${section.capacity}).` },
      { status: 409 },
    ));
  }

  await db.$transaction(async (tx) => {
    if (current) await tx.enrollment.update({ where: { id: current.id }, data: { isActive: false } });
    await tx.enrollment.create({
      data: { schoolId: session.schoolId, studentId: id, sectionId: section.id, academicYearId: section.academicYearId, isActive: true },
    });
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "students.promote", entityType: "Student", entityId: id,
    after: { sectionId: section.id, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: `Moved to ${section.classLevel.name} · ${section.name}.` }));
}
