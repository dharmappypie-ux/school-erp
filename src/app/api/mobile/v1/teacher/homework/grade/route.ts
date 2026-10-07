import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { validateGrade } from "@/lib/homework";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { teacherSectionIds } from "@/lib/teacher-sections";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  submissionId: z.string().min(1, "Missing the submission"),
  marks: z.union([z.string(), z.number()]).optional(),
  feedback: z.string().trim().max(4000).optional(),
});

/**
 * POST /api/mobile/v1/teacher/homework/grade
 *
 * Grade one submission: record a mark (validated against the homework's max) and
 * optional feedback, moving it to GRADED. Guarded to homework in the teacher's
 * own sections (or authored by them).
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, ["homework.manage", "marks.enter"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const submission = await db.homeworkSubmission.findUnique({
    where: { id: parsed.data.submissionId },
    select: {
      id: true,
      homework: { select: { id: true, title: true, sectionId: true, authorId: true, maxMarks: true } },
    },
  });
  if (!submission) {
    return cors(NextResponse.json({ error: "Submission not found in your school." }, { status: 404 }));
  }

  const hw = submission.homework;
  if (session.staffId && hw.authorId !== session.staffId) {
    const sectionIds = await teacherSectionIds(db, session.staffId, session.academicYearId);
    if (!sectionIds.includes(hw.sectionId)) {
      return cors(NextResponse.json({ error: "That homework is not in one of your classes." }, { status: 403 }));
    }
  }

  const hasMarks = parsed.data.marks != null && `${parsed.data.marks}`.trim() !== "";
  let marksObtained: number | null = null;
  if (hasMarks) {
    marksObtained = Number(parsed.data.marks);
    const max = hw.maxMarks != null ? Number(hw.maxMarks) : null;
    const check = validateGrade(marksObtained, max);
    if (!check.ok) {
      return cors(NextResponse.json({ error: check.reason ?? "Invalid mark" }, { status: 400 }));
    }
  }

  await db.homeworkSubmission.update({
    where: { id: submission.id },
    data: {
      status: "GRADED",
      marksObtained,
      feedback: parsed.data.feedback || null,
      gradedAt: new Date(),
      gradedBy: session.staffId ?? session.userId,
    },
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "homework.grade", entityType: "HomeworkSubmission", entityId: submission.id,
    after: { homeworkId: hw.id, marks: marksObtained, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: `Graded — ${hasMarks ? `${marksObtained} marks` : "feedback"} saved.` }));
}
