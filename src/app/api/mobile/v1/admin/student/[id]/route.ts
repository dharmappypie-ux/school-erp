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
      id: true, firstName: true, middleName: true, lastName: true, admissionNo: true, rollNumber: true,
      status: true, phone: true, email: true, gender: true, dateOfBirth: true,
      bloodGroup: true, nationality: true, religion: true, category: true, motherTongue: true,
      admissionDate: true, previousSchool: true, photoUrl: true,
      addressLine1: true, addressLine2: true, city: true, state: true, country: true, postalCode: true,
      emergencyContact: true, medicalNotes: true,
      enrollments: {
        orderBy: { enrolledOn: "desc" }, take: 1,
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
      guardians: {
        orderBy: { isPrimary: "desc" },
        select: {
          relationship: true, isPrimary: true, isFeePayer: true,
          guardian: { select: { firstName: true, lastName: true, phone: true, email: true, occupation: true } },
        },
      },
      transportAssignments: {
        where: { isActive: true }, take: 1,
        select: { route: { select: { name: true } }, stop: { select: { name: true, pickupTime: true } } },
      },
      hostelAllocations: {
        where: { isActive: true }, take: 1,
        select: { room: { select: { roomNumber: true, hostel: { select: { name: true } } } } },
      },
      _count: { select: { documents: true } },
    },
  });
  if (!s) return cors(NextResponse.json({ error: "Student not found in your school." }, { status: 404 }));

  const [attendance, invoiceAgg, invoices, marks, onLoan, payments, reportCards] = await Promise.all([
    db.attendanceRecord.groupBy({
      by: ["status"],
      where: { studentId: id, ...(yearId ? { academicYearId: yearId } : {}) },
      _count: { _all: true },
    }),
    db.invoice.aggregate({
      where: { studentId: id, ...(yearId ? { academicYearId: yearId } : {}) },
      _sum: { total: true, amountPaid: true, amountDue: true },
    }),
    db.invoice.findMany({
      where: { studentId: id }, orderBy: { dueDate: "desc" }, take: 6,
      select: { id: true, invoiceNo: true, period: true, dueDate: true, total: true, amountDue: true, status: true },
    }),
    db.markEntry.findMany({
      where: { studentId: id }, orderBy: { createdAt: "desc" }, take: 8,
      select: {
        marksObtained: true,
        subject: { select: { name: true } },
        exam: { select: { name: true, maxMarks: true } },
      },
    }),
    db.bookIssue.count({ where: { studentId: id, returnedOn: null } }),
    db.payment.findMany({
      where: { studentId: id, status: "SUCCESS" }, orderBy: { paidAt: "desc" }, take: 6,
      select: { id: true, receiptNo: true, amount: true, mode: true, paidAt: true },
    }),
    db.reportCard.findMany({
      where: { studentId: id }, orderBy: { term: { sequence: "asc" } },
      select: { id: true, percentage: true, grade: true, rank: true, result: true, isPublished: true, term: { select: { name: true } } },
    }),
  ]);

  const attTotal = attendance.reduce((n, r) => n + r._count._all, 0);
  const attPresent = attendance.filter((r) => r.status === "PRESENT" || r.status === "LATE").reduce((n, r) => n + r._count._all, 0);
  const attPercent = attTotal > 0 ? Math.round((attPresent / attTotal) * 1000) / 10 : null;

  const scored = marks.filter((m) => m.marksObtained != null && toNumber(m.exam.maxMarks) > 0);
  const avgScore = scored.length > 0
    ? Math.round((scored.reduce((sum, m) => sum + (toNumber(m.marksObtained) / toNumber(m.exam.maxMarks)) * 100, 0) / scored.length) * 10) / 10
    : null;

  const enr = s.enrollments[0];
  const sec = enr?.section;
  const payer = s.guardians.find((g) => g.isFeePayer) ?? s.guardians[0];
  const transport = s.transportAssignments[0];
  const hostel = s.hostelAllocations[0];
  const addr = [s.addressLine1, s.addressLine2, s.city, s.state, s.postalCode, s.country].filter(Boolean).join(", ");

  return cors(NextResponse.json({
    id: s.id, firstName: s.firstName, lastName: s.lastName ?? "", admissionNo: s.admissionNo,
    status: s.status, phone: s.phone ?? "", email: s.email ?? "", gender: s.gender,
    photoUrl: s.photoUrl,
    className: sec ? `${sec.classLevel.name} · ${sec.name}` : "—",
    // Back-compat single fee-payer guardian.
    guardian: payer ? {
      name: `${payer.guardian.firstName} ${payer.guardian.lastName ?? ""}`.trim(),
      phone: payer.guardian.phone, relationship: payer.relationship,
    } : null,
    personal: {
      middleName: s.middleName,
      dateOfBirth: s.dateOfBirth?.toISOString() ?? null,
      bloodGroup: s.bloodGroup, nationality: s.nationality, religion: s.religion,
      category: s.category, motherTongue: s.motherTongue,
      admissionDate: s.admissionDate?.toISOString() ?? null,
      previousSchool: s.previousSchool,
      address: addr || null,
      emergencyContact: s.emergencyContact, medicalNotes: s.medicalNotes,
    },
    services: {
      classTeacher: sec?.classTeacher ? `${sec.classTeacher.firstName} ${sec.classTeacher.lastName ?? ""}`.trim() : null,
      rollNumber: enr?.rollNumber ?? s.rollNumber,
      transport: transport ? {
        route: transport.route?.name ?? null,
        stop: transport.stop?.name ?? null,
        pickupTime: transport.stop?.pickupTime ?? null,
      } : null,
      hostel: hostel ? { hostel: hostel.room?.hostel?.name ?? null, room: hostel.room?.roomNumber ?? null } : null,
      documents: s._count.documents,
    },
    guardians: s.guardians.map((g) => ({
      name: `${g.guardian.firstName} ${g.guardian.lastName ?? ""}`.trim(),
      phone: g.guardian.phone, email: g.guardian.email, occupation: g.guardian.occupation,
      relationship: g.relationship, isPrimary: g.isPrimary, isFeePayer: g.isFeePayer,
    })),
    fees: {
      billed: toNumber(invoiceAgg._sum.total ?? 0),
      paid: toNumber(invoiceAgg._sum.amountPaid ?? 0),
      outstanding: toNumber(invoiceAgg._sum.amountDue ?? 0),
      invoices: invoices.map((i) => ({
        id: i.id, invoiceNo: i.invoiceNo, period: i.period,
        dueDate: i.dueDate.toISOString(), total: toNumber(i.total), amountDue: toNumber(i.amountDue), status: i.status,
      })),
    },
    payments: payments.map((p) => ({
      id: p.id, receiptNo: p.receiptNo, amount: toNumber(p.amount), mode: p.mode, paidAt: p.paidAt?.toISOString() ?? null,
    })),
    reportCards: reportCards.map((c) => ({
      id: c.id, term: c.term.name,
      percentage: c.percentage != null ? toNumber(c.percentage) : null,
      grade: c.grade, rank: c.rank, result: c.result, published: c.isPublished,
    })),
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
