"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { scopedDb } from "@/lib/tenant";

const MarkSchema = z.object({
  sectionId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date"),
  entries: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: z.enum(["PRESENT", "ABSENT", "LATE", "HALF_DAY", "EXCUSED", "ON_LEAVE"]),
      }),
    )
    .min(1, "Nothing to save"),
});

export interface AttendanceResult {
  ok: boolean;
  message: string;
  savedAt?: string;
}

export async function saveAttendance(
  input: z.infer<typeof MarkSchema>,
): Promise<AttendanceResult> {
  const parsed = MarkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const session = await requirePermission("attendance.mark");
  const db = scopedDb(session.schoolId);
  const { sectionId, date, entries } = parsed.data;

  const yearId = session.academicYear?.id;
  if (!yearId) {
    return { ok: false, message: "No academic year is marked current." };
  }

  // Dates are stored as @db.Date; anchoring to UTC midnight keeps the stored
  // day stable regardless of the marking user's timezone.
  const day = new Date(`${date}T00:00:00.000Z`);

  const section = await db.section.findUnique({
    where: { id: sectionId },
    select: { id: true, academicYearId: true },
  });
  if (!section) {
    return { ok: false, message: "That section does not belong to your school." };
  }

  // Only accept students actually enrolled in this section — a tampered payload
  // must not create attendance for someone else's class.
  const enrolled = await db.enrollment.findMany({
    where: { sectionId, academicYearId: yearId, isActive: true },
    select: { studentId: true },
  });
  const allowed = new Set(enrolled.map((row) => row.studentId));
  const accepted = entries.filter((entry) => allowed.has(entry.studentId));

  if (accepted.length === 0) {
    return { ok: false, message: "None of those students are enrolled in this section." };
  }

  await db.$transaction(
    accepted.map((entry) =>
      db.attendanceRecord.upsert({
        where: { studentId_date: { studentId: entry.studentId, date: day } },
        create: {
          schoolId: session.schoolId,
          studentId: entry.studentId,
          sectionId,
          academicYearId: yearId,
          date: day,
          status: entry.status,
          source: "MANUAL",
          markedById: session.staffId,
        },
        update: {
          status: entry.status,
          sectionId,
          source: "MANUAL",
          markedById: session.staffId,
        },
      }),
    ),
  );

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "attendance.mark",
    entityType: "Section",
    entityId: sectionId,
    after: {
      date,
      count: accepted.length,
      absent: accepted.filter((entry) => entry.status === "ABSENT").length,
    },
  });

  revalidatePath("/attendance");
  revalidatePath("/dashboard");

  const skipped = entries.length - accepted.length;
  return {
    ok: true,
    savedAt: new Date().toISOString(),
    message:
      skipped > 0
        ? `Saved ${accepted.length} records. ${skipped} ignored — not enrolled in this section.`
        : `Saved attendance for ${accepted.length} students.`,
  };
}
