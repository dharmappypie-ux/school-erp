import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/admin/staff/[id] — full staff profile, mirroring the web detail page. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobile(req, ["staff.read", "staff.update"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  const { id } = await ctx.params;
  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;

  const s = await db.staffMember.findUnique({
    where: { id },
    select: {
      id: true, firstName: true, lastName: true, email: true, phone: true, employeeId: true,
      staffType: true, employmentStatus: true, photoUrl: true,
      dateOfBirth: true, bloodGroup: true, joiningDate: true, qualification: true, experience: true,
      specialisation: true, addressLine1: true, city: true, state: true, postalCode: true,
      panNumber: true, pfNumber: true, bankAccountNo: true, bankName: true,
      department: { select: { name: true } },
      designation: { select: { name: true } },
      user: { select: { lastLoginAt: true, status: true } },
      subjectAssignments: {
        select: {
          weeklyPeriods: true,
          subject: { select: { name: true } },
          classLevel: { select: { name: true } },
          section: { select: { name: true, _count: { select: { enrollments: { where: { isActive: true } } } } } },
        },
      },
      salaryAssignments: {
        orderBy: { effectiveFrom: "desc" }, take: 1,
        select: { basicSalary: true, effectiveFrom: true, structure: { select: { name: true } } },
      },
      leaveRequests: {
        orderBy: { createdAt: "desc" }, take: 6,
        select: { status: true, days: true, fromDate: true, toDate: true, leaveType: { select: { name: true } } },
      },
    },
  });
  if (!s) return cors(NextResponse.json({ error: "Staff not found in your school." }, { status: 404 }));

  const [classTeacherSections, leaveTotal, leavePending] = await Promise.all([
    db.section.findMany({
      where: { classTeacherId: id, ...(yearId ? { academicYearId: yearId } : {}) },
      select: { name: true, classLevel: { select: { name: true } } },
    }),
    db.leaveRequest.count({ where: { staffId: id } }),
    db.leaveRequest.count({ where: { staffId: id, status: "PENDING" } }),
  ]);

  const salary = s.salaryAssignments[0];
  const addr = [s.addressLine1, s.city, s.state, s.postalCode].filter(Boolean).join(", ");

  return cors(NextResponse.json({
    id: s.id, firstName: s.firstName, lastName: s.lastName ?? "", email: s.email ?? "", phone: s.phone ?? "",
    employeeId: s.employeeId, staffType: s.staffType, employmentStatus: s.employmentStatus,
    photoUrl: s.photoUrl,
    department: s.department?.name ?? null, designation: s.designation?.name ?? null,
    personal: {
      dateOfBirth: s.dateOfBirth?.toISOString() ?? null,
      bloodGroup: s.bloodGroup,
      address: addr || null,
    },
    employment: {
      joiningDate: s.joiningDate?.toISOString() ?? null,
      qualification: s.qualification,
      experience: s.experience,
      specialisation: s.specialisation,
      lastLoginAt: s.user?.lastLoginAt?.toISOString() ?? null,
      pfNumber: s.pfNumber,
      panNumber: s.panNumber ? `••••${s.panNumber.slice(-4)}` : null,
    },
    salary: salary ? {
      basic: toNumber(salary.basicSalary),
      structure: salary.structure?.name ?? null,
      bankName: s.bankName,
      bankAccount: s.bankAccountNo ? `••••${s.bankAccountNo.slice(-4)}` : null,
    } : null,
    teachingLoad: s.subjectAssignments.map((cs) => ({
      subject: cs.subject.name,
      className: cs.section ? `${cs.classLevel.name} · ${cs.section.name}` : cs.classLevel.name,
      students: cs.section?._count.enrollments ?? null,
      weeklyPeriods: cs.weeklyPeriods,
    })),
    classTeacherOfList: classTeacherSections.map((sec) => `${sec.classLevel.name} · ${sec.name}`),
    recentLeave: s.leaveRequests.map((l) => ({
      type: l.leaveType?.name ?? null,
      status: l.status,
      days: l.days != null ? toNumber(l.days) : null,
      from: l.fromDate.toISOString(),
      to: l.toDate.toISOString(),
    })),
    stats: {
      subjectsTaught: s.subjectAssignments.length,
      classTeacherOf: classTeacherSections.length,
      leaveTotal, leavePending,
    },
  }));
}

const Schema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().optional(),
  email: z.string().trim().email("A valid email is required"),
  staffType: z.enum(["TEACHING", "NON_TEACHING", "ADMINISTRATIVE", "SUPPORT", "MANAGEMENT"]),
  employmentStatus: z.enum(["ACTIVE", "PROBATION", "ON_LEAVE", "RESIGNED", "TERMINATED", "RETIRED"]),
});

/** POST /api/mobile/v1/admin/staff/[id] — update core details + employment status. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMobile(req, "staff.update");
  if (guard instanceof NextResponse) return guard;
  const session = guard;
  const { id } = await ctx.params;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const db = scopedDb(session.schoolId);
  const staff = await db.staffMember.findUnique({ where: { id }, select: { id: true, userId: true, employmentStatus: true } });
  if (!staff) return cors(NextResponse.json({ error: "Staff not found in your school." }, { status: 404 }));

  const email = parsed.data.email.toLowerCase();
  const clash = await db.user.findFirst({
    where: { email, NOT: staff.userId ? { id: staff.userId } : undefined },
    select: { id: true },
  });
  if (clash) {
    return cors(NextResponse.json({ error: "Another user already has that email." }, { status: 409 }));
  }

  await db.$transaction(async (tx) => {
    await tx.staffMember.update({
      where: { id },
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName || null,
        email,
        staffType: parsed.data.staffType,
        employmentStatus: parsed.data.employmentStatus,
      },
    });
    if (staff.userId) await tx.user.update({ where: { id: staff.userId }, data: { email } });
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "staff.update", entityType: "StaffMember", entityId: id,
    before: { employmentStatus: staff.employmentStatus }, after: { employmentStatus: parsed.data.employmentStatus, via: "mobile" },
  });
  return cors(NextResponse.json({ ok: true, message: `${parsed.data.firstName}'s record updated.` }));
}
