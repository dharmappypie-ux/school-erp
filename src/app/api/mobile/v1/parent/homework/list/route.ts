import { NextResponse } from "next/server";

import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb, type ScopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

async function resolveStudentId(db: ScopedDb, studentId: string | null, guardianId: string | null) {
  if (studentId) return studentId;
  if (!guardianId) return null;
  const link = await db.studentGuardian.findFirst({ where: { guardianId }, select: { studentId: true } });
  return link?.studentId ?? null;
}

/**
 * GET /api/mobile/v1/parent/homework/list
 *
 * The signed-in child's homework with its submission state, so the app can show
 * each task and let the student turn in an answer. Child-scoped like the rest of
 * the parent surface — no extra permission beyond a valid session.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const studentId = await resolveStudentId(db, session.studentId, session.guardianId);
  if (!studentId) return cors(NextResponse.json({ items: [] }));

  const rows = await db.homeworkSubmission.findMany({
    where: { studentId },
    orderBy: { homework: { dueOn: "desc" } },
    take: 100,
    select: {
      id: true,
      status: true,
      content: true,
      submittedAt: true,
      attachmentUrl: true,
      marksObtained: true,
      feedback: true,
      homework: {
        select: {
          id: true, title: true, description: true, dueOn: true, maxMarks: true,
          attachmentUrl: true,
          subject: { select: { name: true } },
          author: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  return cors(NextResponse.json({
    items: rows.map((r) => ({
      submissionId: r.id,
      homeworkId: r.homework.id,
      title: r.homework.title,
      description: r.homework.description,
      subject: r.homework.subject.name,
      teacher: r.homework.author
        ? `${r.homework.author.firstName} ${r.homework.author.lastName ?? ""}`.trim()
        : null,
      dueOn: r.homework.dueOn.toISOString(),
      status: r.status,
      content: r.content,
      submittedAt: r.submittedAt?.toISOString() ?? null,
      attachmentUrl: r.attachmentUrl,
      worksheetUrl: r.homework.attachmentUrl,
      marksObtained: r.marksObtained != null ? toNumber(r.marksObtained) : null,
      maxMarks: r.homework.maxMarks != null ? toNumber(r.homework.maxMarks) : null,
      feedback: r.feedback,
    })),
  }));
}
