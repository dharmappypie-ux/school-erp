import { hasPermission } from "@/lib/permissions";
import type { ScopedDb } from "@/lib/tenant";

/**
 * Whether the caller may MARK attendance for a given section.
 *
 * Attendance is stricter than marks/homework: only the section's **class
 * teacher** may take or edit its register. Supervisors — admins and principals,
 * via the `attendance.manage` permission (or the `*` wildcard) — may mark any
 * class. A subject teacher who merely teaches a lesson in a class is NOT allowed
 * to mark that class's attendance.
 */
export async function canMarkAttendanceForSection(
  db: ScopedDb,
  staffId: string | null,
  permissions: readonly string[],
  sectionId: string,
  yearId: string | null,
): Promise<boolean> {
  if (hasPermission([...permissions], "attendance.manage")) return true;
  if (!staffId) return false;
  const section = await db.section.findFirst({
    where: { id: sectionId, classTeacherId: staffId, ...(yearId ? { academicYearId: yearId } : {}) },
    select: { id: true },
  });
  return section != null;
}

/** The sections a teacher is CLASS TEACHER of (for attendance scoping). */
export async function classTeacherSectionIds(
  db: ScopedDb,
  staffId: string | null,
  yearId: string | null,
): Promise<string[]> {
  if (!staffId) return [];
  const rows = await db.section.findMany({
    where: { classTeacherId: staffId, ...(yearId ? { academicYearId: yearId } : {}) },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Whether the caller may act on a given section. Admins (wildcard permission)
 * reach any class; a teacher only reaches the sections they are class teacher of
 * or teach a subject in. Use this to scope the teacher marks/homework routes so
 * one teacher can't touch another class's work. (Attendance uses the stricter
 * {@link canMarkAttendanceForSection}.)
 */
export async function teacherCanAccessSection(
  db: ScopedDb,
  staffId: string | null,
  permissions: readonly string[],
  sectionId: string,
  yearId: string | null,
): Promise<boolean> {
  if (permissions.includes("*")) return true;
  const owned = await teacherSectionIds(db, staffId, yearId);
  return owned.includes(sectionId);
}

/**
 * The section ids a teacher is responsible for: ones they are class teacher of,
 * plus ones they teach a subject in (class-level-wide assignments expanded to
 * the current year's sections). Mirrors the logic in teacher/classes, and is
 * used to scope the mobile homework review/grade endpoints.
 */
export async function teacherSectionIds(
  db: ScopedDb,
  staffId: string | null,
  yearId: string | null,
): Promise<string[]> {
  if (!staffId) return [];
  const ids = new Set<string>();
  const classLevelIds = new Set<string>();

  const [owned, assignments] = await Promise.all([
    db.section.findMany({
      where: { classTeacherId: staffId, ...(yearId ? { academicYearId: yearId } : {}) },
      select: { id: true },
    }),
    db.classSubject.findMany({
      where: { teacherId: staffId },
      select: { sectionId: true, classLevelId: true },
    }),
  ]);
  for (const s of owned) ids.add(s.id);
  for (const a of assignments) {
    if (a.sectionId) ids.add(a.sectionId);
    else classLevelIds.add(a.classLevelId);
  }
  if (classLevelIds.size > 0) {
    const extra = await db.section.findMany({
      where: { classLevelId: { in: [...classLevelIds] }, ...(yearId ? { academicYearId: yearId } : {}) },
      select: { id: true },
    });
    for (const s of extra) ids.add(s.id);
  }
  return [...ids];
}
