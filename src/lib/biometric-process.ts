import "server-only";

import type { scopedDb } from "@/lib/tenant";
import { punchDay, type PunchDirection } from "@/lib/biometric";

type Db = ReturnType<typeof scopedDb>;

export interface PunchInput {
  externalRef: string;
  punchedAt: Date;
  direction: PunchDirection;
  rawPayload?: unknown;
}

export interface PunchResult {
  externalRef: string;
  matched: boolean;
  kind: "student" | "staff" | "none";
  attendanceMarked: boolean;
}

/**
 * Records one device punch and turns it into attendance.
 *
 * The device reports an `externalRef` — the id a person is enrolled under on the
 * device. By convention that is the student's **admission number** or the
 * staff's **employee id**. We match it to a person (scoped to the device's
 * school), store the raw punch, and for a student with a live enrollment we
 * upsert today's AttendanceRecord as PRESENT with `source = BIOMETRIC`.
 *
 * An unmatched punch is still stored (processed = false) so an admin can see it
 * and fix the enrollment id, then reprocess.
 */
export async function applyPunch(
  db: Db,
  params: {
    schoolId: string;
    deviceId: string;
    currentYearId: string | null;
    punch: PunchInput;
  },
): Promise<PunchResult> {
  const { schoolId, deviceId, currentYearId } = params;
  const { externalRef, punchedAt, direction, rawPayload } = params.punch;
  const ref = externalRef.trim();

  // A student enrolled under this id?
  const student = ref
    ? await db.student.findFirst({
        where: { admissionNo: ref, status: "ACTIVE", deletedAt: null },
        select: {
          id: true,
          enrollments: {
            where: { isActive: true, ...(currentYearId ? { academicYearId: currentYearId } : {}) },
            orderBy: { enrolledOn: "desc" },
            take: 1,
            select: { sectionId: true, academicYearId: true },
          },
        },
      })
    : null;

  if (student) {
    const enrollment = student.enrollments[0] ?? null;
    const day = punchDay(punchedAt);

    await db.$transaction(async (tx) => {
      await tx.biometricPunch.create({
        data: {
          schoolId,
          deviceId,
          externalRef: ref,
          punchedAt,
          direction,
          studentId: student.id,
          processed: true,
          rawPayload: rawPayload === undefined ? undefined : (rawPayload as object),
        },
      });

      // Can only mark attendance if the student is enrolled this year.
      if (enrollment) {
        await tx.attendanceRecord.upsert({
          where: { studentId_date: { studentId: student.id, date: day } },
          create: {
            schoolId,
            studentId: student.id,
            sectionId: enrollment.sectionId,
            academicYearId: enrollment.academicYearId,
            date: day,
            status: "PRESENT",
            source: "BIOMETRIC",
            inTime: direction === "IN" ? punchedAt : null,
            outTime: direction === "OUT" ? punchedAt : null,
          },
          update: {
            status: "PRESENT",
            source: "BIOMETRIC",
            ...(direction === "IN" ? { inTime: punchedAt } : { outTime: punchedAt }),
          },
        });
      }
    });

    return { externalRef: ref, matched: true, kind: "student", attendanceMarked: Boolean(enrollment) };
  }

  // A staff member? (Logged for the record; this app has no staff attendance table.)
  const staff = ref
    ? await db.staffMember.findFirst({
        where: { employeeId: ref, deletedAt: null },
        select: { id: true },
      })
    : null;

  await db.biometricPunch.create({
    data: {
      schoolId,
      deviceId,
      externalRef: ref,
      punchedAt,
      direction,
      staffId: staff?.id ?? null,
      processed: Boolean(staff),
      rawPayload: rawPayload === undefined ? undefined : (rawPayload as object),
    },
  });

  return {
    externalRef: ref,
    matched: Boolean(staff),
    kind: staff ? "staff" : "none",
    attendanceMarked: false,
  };
}

/**
 * Re-attempts matching for punches that never matched a person (e.g. the device
 * reported an id before that student was enrolled). Called from the "Reprocess"
 * admin action after enrolment data is fixed.
 */
export async function reprocessPunches(
  db: Db,
  schoolId: string,
  currentYearId: string | null,
): Promise<{ scanned: number; resolved: number }> {
  const pending = await db.biometricPunch.findMany({
    where: { processed: false },
    orderBy: { punchedAt: "asc" },
    take: 500,
    select: { id: true, externalRef: true, punchedAt: true, direction: true },
  });

  let resolved = 0;
  for (const p of pending) {
    const student = await db.student.findFirst({
      where: { admissionNo: p.externalRef, status: "ACTIVE", deletedAt: null },
      select: {
        id: true,
        enrollments: {
          where: { isActive: true, ...(currentYearId ? { academicYearId: currentYearId } : {}) },
          orderBy: { enrolledOn: "desc" },
          take: 1,
          select: { sectionId: true, academicYearId: true },
        },
      },
    });
    if (!student) continue;

    const enrollment = student.enrollments[0] ?? null;
    const day = punchDay(p.punchedAt);
    const direction = p.direction === "OUT" ? "OUT" : "IN";

    await db.$transaction(async (tx) => {
      await tx.biometricPunch.update({
        where: { id: p.id },
        data: { studentId: student.id, processed: true },
      });
      if (enrollment) {
        await tx.attendanceRecord.upsert({
          where: { studentId_date: { studentId: student.id, date: day } },
          create: {
            schoolId,
            studentId: student.id,
            sectionId: enrollment.sectionId,
            academicYearId: enrollment.academicYearId,
            date: day,
            status: "PRESENT",
            source: "BIOMETRIC",
            inTime: direction === "IN" ? p.punchedAt : null,
            outTime: direction === "OUT" ? p.punchedAt : null,
          },
          update: {
            status: "PRESENT",
            source: "BIOMETRIC",
            ...(direction === "IN" ? { inTime: p.punchedAt } : { outTime: p.punchedAt }),
          },
        });
      }
    });
    resolved += 1;
  }

  return { scanned: pending.length, resolved };
}
