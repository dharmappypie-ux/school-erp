import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { teacherSectionIds } from "@/lib/teacher-sections";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/teacher/homework/list
 *
 * Homework for the teacher's sections (or authored by them), each with a tally
 * of how many submissions are in / still to grade, so the app can show a
 * "to grade" queue.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["homework.manage", "marks.enter", "homework.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const sectionIds = await teacherSectionIds(db, session.staffId, session.academicYearId);

  const where = session.staffId
    ? { OR: [{ authorId: session.staffId }, ...(sectionIds.length ? [{ sectionId: { in: sectionIds } }] : [])] }
    : {};

  const rows = await db.homework.findMany({
    where,
    orderBy: { dueOn: "desc" },
    take: 100,
    select: {
      id: true,
      title: true,
      dueOn: true,
      maxMarks: true,
      subject: { select: { name: true } },
      section: { select: { name: true, classLevel: { select: { name: true } } } },
      submissions: { select: { status: true } },
    },
  });

  return cors(NextResponse.json({
    items: rows.map((h) => {
      const total = h.submissions.length;
      const submitted = h.submissions.filter((s) => s.status === "SUBMITTED" || s.status === "LATE").length;
      const graded = h.submissions.filter((s) => s.status === "GRADED").length;
      return {
        id: h.id,
        title: h.title,
        subject: h.subject.name,
        className: `${h.section.classLevel.name} · ${h.section.name}`,
        dueOn: h.dueOn.toISOString(),
        total,
        submitted,
        graded,
        toGrade: submitted,
      };
    }),
  }));
}
