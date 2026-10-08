import { NextResponse } from "next/server";
import { z } from "zod";

import { validateMarks } from "@/lib/academics";
import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  classLevelId: z.string().min(1),
  subjectId: z.string().min(1),
  teacherId: z.string().optional(),
  weeklyPeriods: z.coerce.number().int().min(0).max(20),
  maxMarks: z.coerce.number().int().min(1).max(1000),
  passMarks: z.coerce.number().int().min(0).max(1000),
});

/**
 * POST /api/mobile/v1/admin/curriculum/assign
 *
 * Maps a subject onto a class (or updates it); weeklyPeriods=0 removes it.
 * Mirror of the web `assignSubject`. Gated on academics.manage.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "academics.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { classLevelId, subjectId, teacherId, weeklyPeriods, maxMarks, passMarks } = parsed.data;

  const marks = validateMarks(maxMarks, passMarks);
  if (!marks.ok) return cors(NextResponse.json({ error: marks.reason ?? "Invalid marks" }, { status: 400 }));

  const db = scopedDb(session.schoolId);
  const [classLevel, subject] = await Promise.all([
    db.classLevel.findUnique({ where: { id: classLevelId }, select: { id: true, name: true } }),
    db.subject.findUnique({ where: { id: subjectId }, select: { id: true, name: true } }),
  ]);
  if (!classLevel || !subject) {
    return cors(NextResponse.json({ error: "That class or subject does not exist in your school." }, { status: 404 }));
  }
  if (teacherId) {
    const teacher = await db.staffMember.findUnique({ where: { id: teacherId }, select: { id: true } });
    if (!teacher) return cors(NextResponse.json({ error: "That teacher does not exist in your school." }, { status: 404 }));
  }

  const existing = await db.classSubject.findFirst({
    where: { classLevelId, subjectId, sectionId: null },
    select: { id: true },
  });

  if (weeklyPeriods === 0) {
    if (!existing) {
      return cors(NextResponse.json({ error: `${subject.name} is not on ${classLevel.name}'s curriculum.` }, { status: 400 }));
    }
    await db.classSubject.delete({ where: { id: existing.id } });
    await recordAudit({
      schoolId: session.schoolId, userId: session.userId,
      action: "academics.subject.unassign", entityType: "ClassSubject", entityId: existing.id,
      before: { classLevel: classLevel.name, subject: subject.name, via: "mobile" },
    });
    return cors(NextResponse.json({ ok: true, message: `${subject.name} removed from ${classLevel.name}.` }));
  }

  if (existing) {
    await db.classSubject.update({
      where: { id: existing.id },
      data: { teacherId: teacherId || null, weeklyPeriods, maxMarks, passMarks },
    });
  } else {
    await db.classSubject.create({
      data: { classLevelId, subjectId, teacherId: teacherId || null, weeklyPeriods, maxMarks, passMarks },
    });
  }

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "academics.subject.assign", entityType: "ClassLevel", entityId: classLevelId,
    after: { classLevel: classLevel.name, subject: subject.name, weeklyPeriods, teacherId, via: "mobile" },
  });

  return cors(NextResponse.json({
    ok: true,
    message: `${subject.name} set to ${weeklyPeriods} periods a week for ${classLevel.name}.`,
  }));
}
