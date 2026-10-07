import { NextResponse } from "next/server";

import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/teacher/exams — exams the user can enter marks for, each
 * carrying the sections of its class level (current year) so the app can offer a
 * section picker before loading the roster.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["marks.enter", "marks.read", "exams.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;

  const exams = await db.exam.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    take: 100,
    select: {
      id: true,
      name: true,
      maxMarks: true,
      status: true,
      classLevelId: true,
      term: { select: { name: true } },
      subject: { select: { name: true } },
      classLevel: { select: { name: true } },
    },
  });

  // Sections per class level (current year), to drive the picker.
  const levelIds = [...new Set(exams.map((e) => e.classLevelId))];
  const sections = levelIds.length
    ? await db.section.findMany({
        where: { classLevelId: { in: levelIds }, ...(yearId ? { academicYearId: yearId } : {}) },
        orderBy: { name: "asc" },
        select: { id: true, name: true, classLevelId: true },
      })
    : [];
  const byLevel = new Map<string, { id: string; name: string }[]>();
  for (const s of sections) {
    (byLevel.get(s.classLevelId) ?? byLevel.set(s.classLevelId, []).get(s.classLevelId)!).push({ id: s.id, name: s.name });
  }

  return cors(NextResponse.json({
    items: exams.map((e) => ({
      id: e.id,
      name: e.name,
      subject: e.subject.name,
      className: e.classLevel.name,
      term: e.term.name,
      maxMarks: toNumber(e.maxMarks),
      status: e.status,
      sections: (byLevel.get(e.classLevelId) ?? []).map((s) => ({ id: s.id, name: `${e.classLevel.name} · ${s.name}` })),
    })),
  }));
}
