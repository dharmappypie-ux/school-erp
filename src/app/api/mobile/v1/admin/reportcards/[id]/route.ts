import { NextResponse } from "next/server";

import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/reportcards/[id]
 *
 * One report card in full: the student, the term, every subject line and the
 * attendance behind it. The list screen can only say "published"; this is the
 * document itself, which is what a parent asks about on the phone.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobile(req, ["reportcards.read", "reportcards.publish"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const { id } = await ctx.params;
  const db = scopedDb(session.schoolId);

  const card = await db.reportCard.findUnique({
    where: { id },
    include: {
      term: { select: { name: true } },
      academicYear: { select: { name: true } },
      lines: {
        orderBy: { subject: { name: "asc" } },
        include: {
          subject: { select: { name: true, code: true, isCoScholastic: true } },
        },
      },
      student: {
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          admissionNo: true,
          dateOfBirth: true,
          enrollments: {
            take: 1,
            orderBy: { enrolledOn: "desc" },
            select: {
              rollNumber: true,
              section: {
                select: {
                  name: true,
                  classLevel: { select: { name: true } },
                  classTeacher: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!card) {
    return cors(NextResponse.json(
      { error: "That report card is not in your school." },
      { status: 404 },
    ));
  }

  const enrollment = card.student.enrollments[0];
  const section = enrollment?.section;
  const line = (l: (typeof card.lines)[number]) => ({
    subject: l.subject.name,
    code: l.subject.code,
    maxMarks: toNumber(l.maxMarks),
    obtainedMarks: l.obtainedMarks == null ? null : toNumber(l.obtainedMarks),
    percentage: l.percentage == null ? null : toNumber(l.percentage),
    grade: l.grade,
    gradePoint: l.gradePoint == null ? null : toNumber(l.gradePoint),
    rank: l.rank,
    remarks: l.remarks,
  });

  return cors(NextResponse.json({
    card: {
      id: card.id,
      term: card.term.name,
      year: card.academicYear.name,
      grade: card.grade,
      percentage: card.percentage == null ? null : toNumber(card.percentage),
      totalMarks: card.totalMarks == null ? null : toNumber(card.totalMarks),
      obtainedMarks: card.obtainedMarks == null ? null : toNumber(card.obtainedMarks),
      rank: card.rank,
      remarks: card.remarks,
      isPublished: card.isPublished,
      attendancePresent: card.attendancePresent,
      attendanceTotal: card.attendanceTotal,
      attendancePercent:
        card.attendanceTotal && card.attendanceTotal > 0
          ? ((card.attendancePresent ?? 0) / card.attendanceTotal) * 100
          : null,
    },
    student: {
      id: card.student.id,
      name: [card.student.firstName, card.student.middleName, card.student.lastName]
        .filter(Boolean)
        .join(" "),
      admissionNo: card.student.admissionNo,
      dateOfBirth: card.student.dateOfBirth?.toISOString() ?? null,
      rollNumber: enrollment?.rollNumber ?? null,
      className: section ? `${section.classLevel.name} · ${section.name}` : null,
      classTeacher: section?.classTeacher
        ? `${section.classTeacher.firstName} ${section.classTeacher.lastName ?? ""}`.trim()
        : null,
    },
    // Split the way a report card prints: marked subjects, then the graded
    // co-scholastic ones, which carry no marks out of a total.
    scholastic: card.lines.filter((l) => !l.subject.isCoScholastic).map(line),
    coScholastic: card.lines.filter((l) => l.subject.isCoScholastic).map(line),
  }));
}
