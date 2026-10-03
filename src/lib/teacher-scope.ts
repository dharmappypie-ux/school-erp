import type { scopedDb } from "@/lib/tenant";

type Db = ReturnType<typeof scopedDb>;

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
