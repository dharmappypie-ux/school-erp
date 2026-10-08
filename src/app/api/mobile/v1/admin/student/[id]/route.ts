import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/student/[id] — the student's profile, mirroring the
 * website's detail page: details for the edit form plus the headline stats
 * (attendance, average score, fees outstanding, library) and recent marks.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobile(req, ["students.read", "students.update"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  const { id } = await ctx.params;
  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;

  const s = await db.student.findUnique({
    where: { id },
    select: {
      id: true, firstName: true, lastName: true, admissionNo: true, status: true,
      phone: true, email: true, gender: true,
      enrollments: {
        where: { isActive: true }, take: 1,
        select: { section: { select: { name: true, classLevel: { select: { name: true } } } } },
      },
      guardians: {
        where: { isFeePayer: true }, take: 1,
        select: { relationship: true, guardian: { select: { firstName: true, lastName: true, phone: true } } },
      },
    },
  });
  if (!s) return cors(NextResponse.json({ error: "Student not found in your school." }, { status: 404 }));

  const [attendance, invoiceAgg, marks, onLoan] = await Promise.all([
    db.attendanceRecord.groupBy({
      by: ["status"],
      where: { studentId: id, ...(yearId ? { academicYearId: yearId } : {}) },
      _count: { _all: true },
    }),
    db.invoice.aggregate({
      where: { studentId: id, ...(yearId ? { academicYearId: yearId } : {}) },
      _sum: { amountDue: true },
    }),
    db.markEntry.findMany({
      where: { studentId: id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        marksObtained: true,
        subject: { select: { name: true } },
        exam: { select: { name: true, maxMarks: true } },
      },
    }),
    db.bookIssue.count({ where: { studentId: id, returnedOn: null } }),
  ]);

  const attTotal = attendance.reduce((n, r) => n + r._count._all, 0);
  const attPresent = attendance.filter((r) => r.status === "PRESENT" || r.status === "LATE").reduce((n, r) => n + r._count._all, 0);
  const attPercent = attTotal > 0 ? Math.round((attPresent / attTotal) * 1000) / 10 : null;

  const scored = marks.filter((m) => m.marksObtained != null && toNumber(m.exam.maxMarks) > 0);
  const avgScore = scored.length > 0
    ? Math.round((scored.reduce((sum, m) => sum + (toNumber(m.marksObtained) / toNumber(m.exam.maxMarks)) * 100, 0) / scored.length) * 10) / 10
    : null;

  const sec = s.enrollments[0]?.section;
  const payer = s.guardians[0];
  return cors(NextResponse.json({
    id: s.id, firstName: s.firstName, lastName: s.lastName ?? "", admissionNo: s.admissionNo,
    status: s.status, phone: s.phone ?? "", email: s.email ?? "", gender: s.gender,
    className: sec ? `${sec.classLevel.name} · ${sec.name}` : "—",
    guardian: payer ? {
      name: `${payer.guardian.firstName} ${payer.guardian.lastName ?? ""}`.trim(),
      phone: payer.guardian.phone, relationship: payer.relationship,
    } : null,
    stats: {
      attendancePercent: attPercent,
      attendancePresent: attPresent,
      attendanceTotal: attTotal,
      averageScore: avgScore,
      assessments: scored.length,
      feesOutstanding: toNumber(invoiceAgg._sum.amountDue ?? 0),
      booksOnLoan: onLoan,
    },
    recentMarks: marks.map((m) => ({
      subject: m.subject.name,
      exam: m.exam.name,
      score: m.marksObtained != null ? `${toNumber(m.marksObtained)}/${toNumber(m.exam.maxMarks)}` : "—",
    })),
  }));
}

const Schema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().optional(),
  status: z.enum(["ACTIVE", "ALUMNI", "TRANSFERRED", "DROPPED", "SUSPENDED", "ON_LEAVE"]),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
});

/** POST /api/mobile/v1/admin/student/[id] — update key fields + lifecycle status. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobile(req, "students.update");
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  const { id } = await ctx.params;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const db = scopedDb(session.schoolId);
  const existing = await db.student.findUnique({ where: { id }, select: { id: true, status: true, exitDate: true } });
  if (!existing) return cors(NextResponse.json({ error: "Student not found in your school." }, { status: 404 }));

  const leavingActive = existing.status === "ACTIVE" && parsed.data.status !== "ACTIVE";
  const returningActive = existing.status !== "ACTIVE" && parsed.data.status === "ACTIVE";

  await db.student.update({
    where: { id },
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName || null,
      status: parsed.data.status,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      exitDate: leavingActive ? (existing.exitDate ?? new Date()) : returningActive ? null : existing.exitDate,
    },
  });
  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "students.update", entityType: "Student", entityId: id,
    before: { status: existing.status }, after: { status: parsed.data.status, via: "mobile" },
  });
  return cors(NextResponse.json({ ok: true, message: `${parsed.data.firstName}'s record updated.` }));
}
