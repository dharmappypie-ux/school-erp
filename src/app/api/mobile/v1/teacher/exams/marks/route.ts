import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { teacherCanAccessSection } from "@/lib/teacher-sections";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  examId: z.string().min(1),
  sectionId: z.string().min(1),
  entries: z.array(z.object({
    studentId: z.string().min(1),
    marks: z.string(),
    isAbsent: z.boolean().optional(),
  })).min(1),
});

/**
 * POST /api/mobile/v1/teacher/exams/marks — record marks for a section, mirroring
 * the web `saveMarks`: validates against the exam max, upserts per student, and
 * nudges the exam into MARKS_ENTRY.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "marks.enter");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { examId, sectionId, entries } = parsed.data;

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;

  if (!(await teacherCanAccessSection(db, session.staffId, session.permissions, sectionId, yearId))) {
    return cors(NextResponse.json({ error: "That class is not one of yours." }, { status: 403 }));
  }

  const exam = await db.exam.findUnique({
    where: { id: examId },
    select: { id: true, maxMarks: true, subjectId: true, status: true },
  });
  if (!exam) return cors(NextResponse.json({ error: "Exam not found in your school." }, { status: 404 }));
  const maxMarks = Number(exam.maxMarks);

  const enrolled = await db.enrollment.findMany({
    where: { sectionId, isActive: true, ...(yearId ? { academicYearId: yearId } : {}) },
    select: { studentId: true },
  });
  const allowed = new Set(enrolled.map((r) => r.studentId));

  const invalid: string[] = [];
  const toWrite: { studentId: string; marksObtained: number | null; isAbsent: boolean }[] = [];
  for (const entry of entries) {
    if (!allowed.has(entry.studentId)) continue;
    if (entry.isAbsent) {
      toWrite.push({ studentId: entry.studentId, marksObtained: null, isAbsent: true });
      continue;
    }
    const trimmed = entry.marks.trim();
    if (trimmed === "") continue;
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value < 0 || value > maxMarks) {
      invalid.push(entry.studentId);
      continue;
    }
    toWrite.push({ studentId: entry.studentId, marksObtained: value, isAbsent: false });
  }

  if (invalid.length > 0) {
    return cors(NextResponse.json(
      { error: `${invalid.length} mark(s) are outside 0–${maxMarks}. Nothing was saved.` },
      { status: 400 },
    ));
  }
  if (toWrite.length === 0) {
    return cors(NextResponse.json({ error: "No marks to save." }, { status: 400 }));
  }

  await db.$transaction(
    toWrite.map((row) =>
      db.markEntry.upsert({
        where: { examId_studentId: { examId, studentId: row.studentId } },
        create: {
          schoolId: session.schoolId, examId, studentId: row.studentId, subjectId: exam.subjectId,
          marksObtained: row.marksObtained, isAbsent: row.isAbsent, recordedById: session.staffId,
        },
        update: { marksObtained: row.marksObtained, isAbsent: row.isAbsent, recordedById: session.staffId },
      }),
    ),
  );

  if (exam.status === "PLANNED" || exam.status === "SCHEDULED" || exam.status === "ONGOING") {
    await db.exam.update({ where: { id: examId }, data: { status: "MARKS_ENTRY" } });
  }

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "marks.enter", entityType: "Exam", entityId: examId,
    after: { sectionId, saved: toWrite.length, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: `Saved marks for ${toWrite.length} students.` }));
}
