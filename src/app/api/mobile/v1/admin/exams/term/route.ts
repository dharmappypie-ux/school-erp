import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  name: z.string().trim().min(1, "A term name is required").max(60),
  sequence: z.coerce.number().int().min(1, "Sequence starts at 1").max(20),
  weightage: z.coerce.number().min(0).max(100),
});

/**
 * POST /api/mobile/v1/admin/exams/term — create an exam term for the current
 * year. Mirror of the web `createExamTerm`. Gated on exams.manage.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "exams.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  if (!session.academicYearId) {
    return cors(NextResponse.json({ error: "Set up a current academic year first." }, { status: 409 }));
  }

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { name, sequence, weightage } = parsed.data;

  const db = scopedDb(session.schoolId);
  const clash = await db.examTerm.findFirst({
    where: { academicYearId: session.academicYearId, name },
    select: { id: true },
  });
  if (clash) {
    return cors(NextResponse.json({ error: `A term named "${name}" already exists this year.` }, { status: 409 }));
  }

  const term = await db.examTerm.create({
    data: { schoolId: session.schoolId, academicYearId: session.academicYearId, name, sequence, weightage },
    select: { id: true, name: true },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "exams.term.create", entityType: "ExamTerm", entityId: term.id,
    after: { name: term.name, sequence, weightage, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: `Term "${term.name}" created. Add exams to it next.` }));
}
