import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import {
  countLeaveDays,
  formatLeaveSpan,
  PORTION_SHORT,
  type LeavePortion,
} from "@/lib/student-leave";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/student-leave
 *
 * Student leave requests for the staff app, pending first — the same ordering
 * as the web screen, because the only question a teacher opens this to answer
 * is "what is waiting on me".
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, "studentleave.read");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const rows = await db.studentLeaveRequest.findMany({
    orderBy: [{ status: "asc" }, { fromDate: "desc" }],
    take: 100,
    select: {
      id: true,
      fromDate: true,
      toDate: true,
      portion: true,
      leavingAfterPeriod: true,
      reason: true,
      status: true,
      decisionNote: true,
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          enrollments: {
            where: { isActive: true },
            take: 1,
            select: {
              section: {
                select: { name: true, classLevel: { select: { name: true } } },
              },
            },
          },
        },
      },
      requestedBy: { select: { firstName: true, lastName: true } },
    },
  });

  const items = rows.map((row) => {
    const section = row.student.enrollments[0]?.section;
    return {
      id: row.id,
      studentId: row.student.id,
      studentName: `${row.student.firstName} ${row.student.lastName ?? ""}`.trim(),
      admissionNo: row.student.admissionNo,
      className: section ? `${section.classLevel.name} ${section.name}` : "",
      span: formatLeaveSpan(row.fromDate, row.toDate, row.portion as LeavePortion),
      days: countLeaveDays(row.fromDate, row.toDate, row.portion as LeavePortion),
      portion: row.portion,
      portionLabel: PORTION_SHORT[row.portion as LeavePortion],
      leavingAfterPeriod: row.leavingAfterPeriod,
      reason: row.reason,
      status: row.status,
      decisionNote: row.decisionNote,
      askedBy: row.requestedBy
        ? `${row.requestedBy.firstName} ${row.requestedBy.lastName ?? ""}`.trim()
        : null,
    };
  });

  return cors(
    NextResponse.json({
      title: "Student leave",
      pending: items.filter((item) => item.status === "PENDING").length,
      items,
    }),
  );
}
