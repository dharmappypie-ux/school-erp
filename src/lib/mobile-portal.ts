import { type ScopedDb } from "@/lib/tenant";

/**
 * Shared helpers for the parent/student mobile surface.
 *
 * The signed-in account is either the student themselves (`studentId`) or a
 * guardian (`guardianId`) linked to one or more students. These resolve the
 * child the app is acting for, and the class level used to scope the catalogue
 * of courses and quizzes — mirroring the web portal's `resolvePortalStudent`.
 */

/** The student this session acts for: the student account itself, or a guardian's first linked child. */
export async function resolveStudentId(
  db: ScopedDb,
  studentId: string | null,
  guardianId: string | null,
): Promise<string | null> {
  if (studentId) return studentId;
  if (!guardianId) return null;
  const link = await db.studentGuardian.findFirst({
    where: { guardianId },
    select: { studentId: true },
  });
  return link?.studentId ?? null;
}

/** The class level the student is enrolled in this year, used to scope the LMS catalogue. */
export async function classLevelIdForStudent(
  db: ScopedDb,
  studentId: string,
  yearId: string | null,
): Promise<string | null> {
  const enrollment = await db.enrollment.findFirst({
    where: { studentId, ...(yearId ? { academicYearId: yearId } : {}) },
    select: { section: { select: { classLevelId: true } } },
  });
  return enrollment?.section.classLevelId ?? null;
}

/** A Prisma `where` fragment: courses/quizzes for the whole school or this child's class level. */
export function catalogScope(classLevelId: string | null) {
  return {
    OR: [{ classLevelId: null }, ...(classLevelId ? [{ classLevelId }] : [])],
  };
}
