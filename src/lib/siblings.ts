import "server-only";

import type { ScopedDb } from "@/lib/tenant";

/**
 * Reading a sibling link from both ends.
 *
 * A link is stored once: one row saying "this student's sibling is that one".
 * The alternative — writing a reciprocal row — means two records of the same
 * fact, which drift the moment one is edited and leave a half-link when one is
 * deleted. So the row stays single and both students read it.
 *
 * The cost is that `relation` describes the NAMED sibling, so it is wrong when
 * read backwards: a row saying Aarav is Pari's brother does not make Pari
 * Aarav's brother. The reverse view derives the relation from the other
 * student's own gender instead, and falls back to OTHER when that is unknown
 * rather than guessing.
 */

export type SiblingRelation = "BROTHER" | "SISTER" | "OTHER";

export interface SiblingView {
  id: string;
  /** The sibling's name, as it should read on THIS student's page. */
  name: string;
  relation: SiblingRelation;
  dateOfBirth: Date | null;
  schoolName: string | null;
  notes: string | null;
  /** The sibling's own record, when they are on this roll. */
  linked: { id: string; admissionNo: string; name: string } | null;
  /**
   * False when the row belongs to the other student. It still shows here, but
   * it cannot be edited or removed from this side — the person who entered it
   * owns it, and silently deleting their row from someone else's page would be
   * surprising.
   */
  editable: boolean;
}

type GenderLike = "MALE" | "FEMALE" | "OTHER" | null | undefined;

/** A sibling's relation to the student reading the row, from their gender. */
function relationFromGender(gender: GenderLike): SiblingRelation {
  if (gender === "MALE") return "BROTHER";
  if (gender === "FEMALE") return "SISTER";
  return "OTHER";
}

const fullName = (first: string, last: string | null) =>
  `${first} ${last ?? ""}`.trim();

/**
 * Every sibling of `studentId`, from rows pointing either way.
 *
 * A pair entered twice — once from each side — collapses to the row this
 * student owns, so the page never lists the same person twice.
 */
export async function siblingsFor(
  db: ScopedDb,
  studentId: string,
): Promise<SiblingView[]> {
  const [owned, reverse] = await Promise.all([
    db.studentSibling.findMany({
      where: { studentId },
      orderBy: [{ dateOfBirth: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        relation: true,
        dateOfBirth: true,
        schoolName: true,
        notes: true,
        siblingStudent: {
          select: { id: true, admissionNo: true, firstName: true, lastName: true },
        },
      },
    }),
    // Rows where somebody else named THIS student as their sibling.
    db.studentSibling.findMany({
      where: { siblingStudentId: studentId },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        dateOfBirth: true,
        notes: true,
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
            gender: true,
            dateOfBirth: true,
          },
        },
      },
    }),
  ]);

  const views: SiblingView[] = owned.map((row) => ({
    id: row.id,
    name: row.siblingStudent
      ? fullName(row.siblingStudent.firstName, row.siblingStudent.lastName)
      : row.name,
    relation: row.relation as SiblingRelation,
    dateOfBirth: row.dateOfBirth,
    schoolName: row.schoolName,
    notes: row.notes,
    linked: row.siblingStudent
      ? {
          id: row.siblingStudent.id,
          admissionNo: row.siblingStudent.admissionNo,
          name: fullName(row.siblingStudent.firstName, row.siblingStudent.lastName),
        }
      : null,
    editable: true,
  }));

  // Whoever this student already names, so a pair entered from both sides is
  // not listed twice.
  const alreadyLinked = new Set(
    owned.map((row) => row.siblingStudent?.id).filter(Boolean) as string[],
  );

  for (const row of reverse) {
    const other = row.student;
    if (!other || other.id === studentId) continue;
    if (alreadyLinked.has(other.id)) continue;
    alreadyLinked.add(other.id);

    views.push({
      id: row.id,
      name: fullName(other.firstName, other.lastName),
      // Not row.relation — that describes this student, not the one being shown.
      relation: relationFromGender(other.gender as GenderLike),
      // The other student's own date of birth, not the one typed on the row,
      // which described this student.
      dateOfBirth: other.dateOfBirth,
      schoolName: null,
      notes: row.notes,
      linked: {
        id: other.id,
        admissionNo: other.admissionNo,
        name: fullName(other.firstName, other.lastName),
      },
      editable: false,
    });
  }

  return views;
}
