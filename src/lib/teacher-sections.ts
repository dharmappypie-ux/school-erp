import type { ScopedDb } from "@/lib/tenant";

/**
 * Whether the caller may act on a given section. Admins (wildcard permission)
 * reach any class; a teacher only reaches the sections they are class teacher of
 * or teach a subject in. Use this to scope the teacher attendance/marks/homework
 * routes so one teacher can't touch another class's register.
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
