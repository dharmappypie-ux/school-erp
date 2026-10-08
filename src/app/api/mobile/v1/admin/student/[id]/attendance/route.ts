import { NextResponse } from "next/server";

import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/student/[id]/attendance
 *
 * A student's attendance history: rate / present / absent / late counts, a
 * monthly breakdown, and the most recent session records. Mirror of the web
 * /students/[id]/attendance page.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobile(req, ["students.read", "attendance.read"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  const { id } = await ctx.params;

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;

  const student = await db.student.findUnique({
    where: { id },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!student) return cors(NextResponse.json({ error: "Student not found in your school." }, { status: 404 }));

  const [groups, records] = await Promise.all([
    db.attendanceRecord.groupBy({
      by: ["status"],
      where: { studentId: id, ...(yearId ? { academicYearId: yearId } : {}) },
      _count: { _all: true },
    }),
    db.attendanceRecord.findMany({
      where: { studentId: id, ...(yearId ? { academicYearId: yearId } : {}) },
      orderBy: { date: "desc" },
      take: 90,
      select: { date: true, status: true, source: true, remarks: true },
    }),
  ]);

  const count = (st: string) => groups.find((g) => g.status === st)?._count._all ?? 0;
  const total = groups.reduce((n, g) => n + g._count._all, 0);
  const present = count("PRESENT") + count("LATE");
  const rate = total > 0 ? Math.round((present / total) * 1000) / 10 : null;

  // Monthly breakdown (present/total) from the loaded records.
  const monthly = new Map<string, { present: number; total: number }>();
  for (const r of records) {
    const key = r.date.toISOString().slice(0, 7); // YYYY-MM
    const m = monthly.get(key) ?? { present: 0, total: 0 };
    m.total += 1;
    if (r.status === "PRESENT" || r.status === "LATE") m.present += 1;
    monthly.set(key, m);
  }

  return cors(NextResponse.json({
    studentName: `${student.firstName} ${student.lastName ?? ""}`.trim(),
    rate,
    total,
    present,
    absent: count("ABSENT"),
    late: count("LATE"),
    onLeave: count("ON_LEAVE") + count("EXCUSED"),
    lowWarning: rate != null && rate < 75,
    monthly: [...monthly.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, m]) => ({
      month,
      present: m.present,
      total: m.total,
      percent: m.total > 0 ? Math.round((m.present / m.total) * 100) : 0,
    })),
    records: records.map((r) => ({
      date: r.date.toISOString(),
      status: r.status,
      source: r.source,
      remarks: r.remarks,
    })),
  }));
}
