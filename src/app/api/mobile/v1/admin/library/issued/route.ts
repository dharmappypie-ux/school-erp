import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/admin/library/issued — copies currently on loan, for return. */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["library.circulate", "library.manage", "library.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const rows = await db.bookIssue.findMany({
    where: { returnedOn: null },
    orderBy: { dueOn: "asc" },
    take: 150,
    select: {
      id: true,
      dueOn: true,
      copy: { select: { accessionNo: true, book: { select: { title: true } } } },
      student: { select: { firstName: true, lastName: true, admissionNo: true } },
      staff: { select: { firstName: true, lastName: true } },
    },
  });

  const now = Date.now();
  return cors(NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      title: r.copy.book.title,
      accessionNo: r.copy.accessionNo,
      borrower: r.student
        ? `${r.student.firstName} ${r.student.lastName ?? ""}`.trim()
        : r.staff
          ? `${r.staff.firstName} ${r.staff.lastName ?? ""}`.trim()
          : "—",
      dueOn: r.dueOn.toISOString(),
      overdue: r.dueOn.getTime() < now,
    })),
  }));
}
