import { NextResponse } from "next/server";

import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { teacherSectionIds } from "@/lib/teacher-sections";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/teacher/homework/submissions?homeworkId=…
 *
 * Every student's submission for one homework — their answer, status and any
 * mark — so the teacher can read and grade them. Guarded to homework in the
 * teacher's own sections (or authored by them).
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["homework.manage", "marks.enter", "homework.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const homeworkId = new URL(req.url).searchParams.get("homeworkId");
  if (!homeworkId) {
    return cors(NextResponse.json({ error: "homeworkId is required" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const homework = await db.homework.findUnique({
    where: { id: homeworkId },
    select: { id: true, title: true, sectionId: true, authorId: true, maxMarks: true, dueOn: true },
  });
  if (!homework) {
    return cors(NextResponse.json({ error: "Homework not found in your school." }, { status: 404 }));
  }

  // Scope: must be the author or teach the section.
  if (session.staffId && homework.authorId !== session.staffId) {
    const sectionIds = await teacherSectionIds(db, session.staffId, session.academicYearId);
    if (!sectionIds.includes(homework.sectionId)) {
      return cors(NextResponse.json({ error: "That homework is not in one of your classes." }, { status: 403 }));
    }
  }

  const subs = await db.homeworkSubmission.findMany({
    where: { homeworkId },
    orderBy: [{ status: "asc" }, { student: { rollNumber: "asc" } }],
    select: {
      id: true,
      status: true,
      content: true,
      submittedAt: true,
      marksObtained: true,
      feedback: true,
      student: { select: { firstName: true, lastName: true, admissionNo: true, rollNumber: true } },
    },
  });

  return cors(NextResponse.json({
    homework: {
      id: homework.id,
      title: homework.title,
      maxMarks: homework.maxMarks != null ? toNumber(homework.maxMarks) : null,
      dueOn: homework.dueOn.toISOString(),
    },
    items: subs.map((s) => ({
      submissionId: s.id,
      studentName: `${s.student.firstName} ${s.student.lastName ?? ""}`.trim(),
      rollNumber: s.student.rollNumber,
      admissionNo: s.student.admissionNo,
      status: s.status,
      content: s.content,
      submittedAt: s.submittedAt?.toISOString() ?? null,
      marksObtained: s.marksObtained != null ? toNumber(s.marksObtained) : null,
      feedback: s.feedback,
    })),
  }));
}
