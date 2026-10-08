import { NextResponse } from "next/server";

import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/exams/setup
 *
 * Picker data for creating exam terms and exam papers: the current year's terms,
 * the class levels and the subjects. Plus existing exams per term for context.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["exams.manage", "exams.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;

  const [terms, classLevels, subjects] = await Promise.all([
    db.examTerm.findMany({
      where: yearId ? { academicYearId: yearId } : {},
      orderBy: { sequence: "asc" },
      select: {
        id: true, name: true, sequence: true, weightage: true,
        _count: { select: { exams: true } },
      },
    }),
    db.classLevel.findMany({ orderBy: { numericOrder: "asc" }, select: { id: true, name: true } }),
    db.subject.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
  ]);

  const canManage = guard.permissions.includes("*") ||
    guard.permissions.includes("exams.manage") || guard.permissions.includes("exams.*");

  return cors(NextResponse.json({
    canManage,
    terms: terms.map((t) => ({
      id: t.id, name: t.name, sequence: t.sequence,
      weightage: t.weightage != null ? toNumber(t.weightage) : null,
      exams: t._count.exams,
    })),
    classLevels,
    subjects,
  }));
}
