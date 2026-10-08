import { NextResponse } from "next/server";
import { z } from "zod";

import { nextAdmissionNumber } from "@/lib/admissions";
import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { hashPassword } from "@/lib/password";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/** GET /api/mobile/v1/admin/students?q= — active students, newest first. */
export async function GET(req: Request) {
  const guard = await requireMobile(req, ["students.read", "students.create"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;
  const q = new URL(req.url).searchParams.get("q")?.trim();

  const rows = await db.student.findMany({
    where: {
      status: "ACTIVE",
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { admissionNo: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { admissionNo: "desc" },
    take: 100,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      enrollments: {
        where: yearId ? { academicYearId: yearId } : undefined,
        take: 1,
        select: { section: { select: { name: true, classLevel: { select: { name: true } } } } },
      },
    },
  });

  return cors(NextResponse.json({
    students: rows.map((s) => {
      const sec = s.enrollments[0]?.section;
      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName ?? ""}`.trim(),
        admissionNo: s.admissionNo,
        className: sec ? `${sec.classLevel.name} · ${sec.name}` : "—",
      };
    }),
  }));
}

const CreateSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  dateOfBirth: z.string().trim().optional(),
  sectionId: z.string().min(1, "Choose a class"),
  rollNumber: z.string().trim().optional(),
  guardianName: z.string().trim().min(1, "Guardian name is required"),
  guardianPhone: z.string().trim().min(6, "Guardian phone is required"),
  guardianEmail: z.string().trim().email().optional().or(z.literal("")),
  relationship: z.string().trim().optional(),
});

/**
 * POST /api/mobile/v1/admin/students
 *
 * Mobile mirror of the web `createStudent` action: in one transaction creates
 * the student, a primary guardian, portal logins for both, and the enrolment.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "students.create");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    ));
  }
  const input = parsed.data;

  const db = scopedDb(session.schoolId);
  const yearId = session.academicYearId;
  if (!yearId) {
    return cors(NextResponse.json({ error: "No academic year is marked current." }, { status: 409 }));
  }

  const school = await db.school.findUnique({
    where: { id: session.schoolId },
    select: { code: true, slug: true },
  });
  if (!school) {
    return cors(NextResponse.json({ error: "School not found." }, { status: 404 }));
  }

  const section = await db.section.findUnique({
    where: { id: input.sectionId },
    select: {
      id: true,
      name: true,
      capacity: true,
      academicYearId: true,
      classLevel: { select: { name: true } },
      _count: { select: { enrollments: { where: { isActive: true } } } },
    },
  });
  if (!section || section.academicYearId !== yearId) {
    return cors(NextResponse.json({ error: "That class is not part of the current year." }, { status: 400 }));
  }
  if (section._count.enrollments >= section.capacity) {
    return cors(NextResponse.json(
      { error: `${section.classLevel.name} ${section.name} is full (${section.capacity} seats).` },
      { status: 409 },
    ));
  }

  const prefix = `${(school.code || school.slug.slice(0, 3)).toUpperCase()}${new Date().getFullYear()}`;
  const latest = await db.student.findFirst({
    where: { admissionNo: { startsWith: prefix } },
    orderBy: { admissionNo: "desc" },
    select: { admissionNo: true },
  });

  // Find a free slot: the next admission number whose derived login emails and
  // admission number are all unused. A student deleted earlier can leave an
  // orphaned login behind, so stepping over those keeps create working.
  const providedGuardianEmail = input.guardianEmail && input.guardianEmail !== "" ? input.guardianEmail : null;
  let candidate = nextAdmissionNumber(prefix, latest?.admissionNo ?? null);
  let admissionNo = candidate;
  let studentEmail = `${candidate.toLowerCase()}@${school.slug}.local`;
  let guardianEmail = providedGuardianEmail ?? `parent.${candidate.toLowerCase()}@${school.slug}.local`;
  for (let i = 0; i < 100; i += 1) {
    const emails = [studentEmail, ...(providedGuardianEmail ? [] : [guardianEmail])];
    const [userClash, studentClash] = await Promise.all([
      db.user.findFirst({ where: { email: { in: emails } }, select: { id: true } }),
      db.student.findFirst({ where: { admissionNo }, select: { id: true } }),
    ]);
    if (!userClash && !studentClash) break;
    candidate = nextAdmissionNumber(prefix, candidate);
    admissionNo = candidate;
    studentEmail = `${candidate.toLowerCase()}@${school.slug}.local`;
    guardianEmail = providedGuardianEmail ?? `parent.${candidate.toLowerCase()}@${school.slug}.local`;
  }

  const [studentRole, parentRole] = await Promise.all([
    db.role.findUnique({
      where: { schoolId_key: { schoolId: session.schoolId, key: "STUDENT" } },
      select: { id: true },
    }),
    db.role.findUnique({
      where: { schoolId_key: { schoolId: session.schoolId, key: "PARENT" } },
      select: { id: true },
    }),
  ]);

  const temporaryPassword = `${admissionNo}@${new Date().getFullYear()}`;
  const passwordHash = await hashPassword(temporaryPassword);
  const rollNumber = input.rollNumber || String(section._count.enrollments + 1);
  const [gFirst, ...gRest] = input.guardianName.trim().split(" ");

  let studentId: string;
  try {
    studentId = await db.$transaction(async (tx) => {
      const studentUser = await tx.user.create({
        data: {
          schoolId: session.schoolId,
          email: studentEmail,
          firstName: input.firstName,
          lastName: input.lastName ?? null,
          passwordHash,
          mustChangePassword: true,
          status: "ACTIVE",
          ...(studentRole ? { roles: { connect: [{ id: studentRole.id }] } } : {}),
        },
      });
      const student = await tx.student.create({
        data: {
          schoolId: session.schoolId,
          userId: studentUser.id,
          admissionNo,
          rollNumber,
          firstName: input.firstName,
          lastName: input.lastName ?? null,
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
          gender: input.gender,
          email: studentEmail,
          admissionDate: new Date(),
          status: "ACTIVE",
        },
      });
      const guardianUser = await tx.user.create({
        data: {
          schoolId: session.schoolId,
          email: guardianEmail,
          firstName: gFirst ?? input.guardianName,
          lastName: gRest.join(" ") || null,
          phone: input.guardianPhone,
          passwordHash,
          mustChangePassword: true,
          status: "ACTIVE",
          ...(parentRole ? { roles: { connect: [{ id: parentRole.id }] } } : {}),
        },
      });
      const guardian = await tx.guardian.create({
        data: {
          schoolId: session.schoolId,
          userId: guardianUser.id,
          firstName: gFirst ?? input.guardianName,
          lastName: gRest.join(" ") || null,
          email: input.guardianEmail && input.guardianEmail !== "" ? input.guardianEmail : null,
          phone: input.guardianPhone,
        },
      });
      await tx.studentGuardian.create({
        data: {
          studentId: student.id,
          guardianId: guardian.id,
          relationship: input.relationship || "FATHER",
          isPrimary: true,
          isFeePayer: true,
        },
      });
      await tx.enrollment.create({
        data: {
          schoolId: session.schoolId,
          studentId: student.id,
          sectionId: input.sectionId,
          academicYearId: yearId,
          rollNumber,
          isActive: true,
        },
      });
      return student.id;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return cors(NextResponse.json(
      {
        error: message.includes("Unique constraint")
          ? "A student or login with those details already exists. Nothing was created."
          : `Could not create the student: ${message}`,
      },
      { status: 409 },
    ));
  }

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "students.create",
    entityType: "Student",
    entityId: studentId,
    after: { admissionNo, sectionId: input.sectionId, rollNumber, via: "mobile" },
  });

  return cors(NextResponse.json({
    ok: true,
    id: studentId,
    admissionNo,
    message: `${input.firstName} admitted as ${admissionNo}.`,
  }));
}
