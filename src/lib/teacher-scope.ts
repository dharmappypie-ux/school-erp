import { hasPermission } from "@/lib/permissions";
import type { scopedDb } from "@/lib/tenant";

type Db = ReturnType<typeof scopedDb>;

/**
 * The sections a teacher is CLASS TEACHER of this year. Attendance is scoped to
 * these: only a class teacher may take or edit their class's register.
 */
export async function classTeacherSectionIds(
  db: Db,
  staffId: string | null | undefined,
  yearId: string | null | undefined,
): Promise<Set<string>> {
  if (!staffId || !yearId) return new Set();
  const sections = await db.section.findMany({
    where: { academicYearId: yearId, classTeacherId: staffId },
    select: { id: true },
  });
  return new Set(sections.map((s) => s.id));
}

/**
 * Whether the caller may MARK attendance for a section. Supervisors (admins and
 * principals, via `attendance.manage` or the `*` wildcard) may mark any class;
 * everyone else may only mark the class they are class teacher of. A subject
 * teacher cannot mark a class's attendance.
 */
export async function canMarkAttendanceForSection(
  db: Db,
  staffId: string | null | undefined,
  permissions: readonly string[],
  sectionId: string,
  yearId: string | null | undefined,
): Promise<boolean> {
  if (hasPermission([...permissions], "attendance.manage")) return true;
  if (!staffId) return false;
  const section = await db.section.findFirst({
    where: { id: sectionId, classTeacherId: staffId, ...(yearId ? { academicYearId: yearId } : {}) },
    select: { id: true },
  });
  return section != null;
}

/**
 * The sections a teacher is actually connected to in a given year: ones they
 * are class teacher of, teach a subject in (via the class curriculum), or have
 * a timetable slot for. Used to surface "my classes" ahead of the school-wide
 * list on the daily teaching screens, so a teacher is not made to hunt for
 * their own section in a dropdown of the whole school.
 *
 * Returns an empty set for non-teachers (no staffId) or when there is no
 * current year — callers then fall back to showing everything, unchanged.
 */
export async function teacherSectionIds(
  db: Db,
  staffId: string | null | undefined,
  yearId: string | null | undefined,
): Promise<Set<string>> {
  if (!staffId || !yearId) return new Set();

  const sections = await db.section.findMany({
    where: {
      academicYearId: yearId,
      OR: [
        { classTeacherId: staffId },
        { timetableSlots: { some: { teacherId: staffId } } },
        { classLevel: { subjects: { some: { teacherId: staffId } } } },
      ],
    },
    select: { id: true },
  });

  return new Set(sections.map((section) => section.id));
}
