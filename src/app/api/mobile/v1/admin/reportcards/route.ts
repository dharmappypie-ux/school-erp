import { NextResponse } from "next/server";

import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/admin/reportcards — generated report cards, to publish. */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["reportcards.publish", "reportcards.read", "exams.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;
  const [rows, terms, sections] = await Promise.all([
    db.reportCard.findMany({
      orderBy: [{ isPublished: "asc" }, { percentage: "desc" }],
      take: 150,
      select: {
        id: true, percentage: true, grade: true, rank: true, result: true, isPublished: true,
        student: { select: { firstName: true, lastName: true, admissionNo: true } },
        term: { select: { name: true } },
      },
    }),
    db.examTerm.findMany({
      where: yearId ? { academicYearId: yearId } : {},
      orderBy: { sequence: "asc" },
      select: { id: true, name: true },
    }),
    db.section.findMany({
      where: yearId ? { academicYearId: yearId } : {},
      orderBy: [{ classLevel: { numericOrder: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, classLevel: { select: { name: true } } },
    }),
  ]);

  const canGenerate = guard.permissions.includes("*") ||
    guard.permissions.includes("reportcards.generate") || guard.permissions.includes("reportcards.*");

  return cors(NextResponse.json({
    canPublish: guard.permissions.includes("*") || guard.permissions.includes("reportcards.publish") || guard.permissions.includes("reportcards.*"),
    canGenerate,
    terms: terms.map((t) => ({ id: t.id, name: t.name })),
    sections: sections.map((s) => ({ id: s.id, name: `${s.classLevel.name} · ${s.name}` })),
    items: rows.map((c) => ({
      id: c.id,
      student: `${c.student.firstName} ${c.student.lastName ?? ""}`.trim(),
      admissionNo: c.student.admissionNo,
      term: c.term.name,
      percentage: c.percentage != null ? toNumber(c.percentage) : null,
      grade: c.grade,
      rank: c.rank,
      result: c.result,
      published: c.isPublished,
    })),
  }));
}
