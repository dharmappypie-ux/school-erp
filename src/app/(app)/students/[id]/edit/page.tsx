import Link from "next/link";
import { notFound } from "next/navigation";

import {
  StudentEditForm,
  type StudentDefaults,
  type StudentFlagDefaults,
} from "@/app/(app)/students/[id]/edit/student-edit-form";
import {
  SiblingPanel,
  type SiblingRow,
} from "@/app/(app)/students/[id]/siblings/sibling-panel";
import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { dateInputValue } from "@/lib/format";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Edit student" };

const asDate = (value: Date | null) =>
  value ? value.toISOString().slice(0, 10) : "";

export default async function EditStudentPage({ params }: PageProps<"/students/[id]/edit">) {
  const session = await requirePermission("students.update");
  const db = scopedDb(session.schoolId);
  const { id } = await params;
  const yearId = session.academicYear?.id;

  const [student, sections, roll] = await Promise.all([
    db.student.findUnique({
      where: { id },
      select: {
        id: true, firstName: true, middleName: true, lastName: true,
        dateOfBirth: true, gender: true, bloodGroup: true, category: true,
        status: true, phone: true, email: true, addressLine1: true,
        city: true, state: true, postalCode: true, previousSchool: true,
        medicalNotes: true, exitReason: true,
        aadhaarNumber: true, apaarId: true, penNumber: true, udiseNumber: true,
        boardRegNoIX: true, boardRegNoXI: true,
        caste: true, isMinority: true, isBpl: true, isEws: true, isRteQuota: true,
        isSingleParent: true, isSingleChild: true, isStaffWard: true,
        isAlumniChild: true, hasDisability: true, disabilityType: true,
        hasSpecialNeeds: true,
        placeOfBirth: true, languageAtHome: true, house: true,
        admissionFileNo: true, previousTcNumber: true, previousTcDate: true,
        previousBoard: true,
        heightCm: true, weightKg: true, allergies: true, chronicAilment: true,
        enrollments: {
          where: { isActive: true },
          take: 1,
          select: {
            section: {
              select: { name: true, classLevel: { select: { name: true } } },
            },
          },
        },
        siblings: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            relation: true,
            dateOfBirth: true,
            schoolName: true,
            notes: true,
            siblingStudent: {
              select: {
                id: true,
                admissionNo: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    }),
    yearId
      ? db.section.findMany({
          where: { academicYearId: yearId },
          orderBy: [{ classLevel: { numericOrder: "asc" } }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            capacity: true,
            classLevel: { select: { name: true } },
            _count: { select: { enrollments: { where: { isActive: true } } } },
          },
        })
      : [],
    // The whole active roll, not just this year's enrolments: an older brother
    // sitting out a year is still the sibling the office is trying to link to.
    db.student.findMany({
      where: { deletedAt: null, status: "ACTIVE", id: { not: id } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 2000,
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
        enrollments: {
          where: yearId ? { academicYearId: yearId } : undefined,
          take: 1,
          select: {
            section: {
              select: {
                name: true,
                classLevel: { select: { name: true, numericOrder: true } },
              },
            },
          },
        },
        // Father where there is one, else whoever is primary — the line that
        // tells two students of the same name apart.
        guardians: {
          orderBy: [{ isPrimary: "desc" }],
          select: {
            relationship: true,
            guardian: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
  ]);

  if (!student) notFound();

  const active = student.enrollments[0]?.section;
  const currentClass = active ? `${active.classLevel.name} ${active.name}` : null;

  const defaults: StudentDefaults = {
    id: student.id,
    firstName: student.firstName,
    middleName: student.middleName ?? "",
    lastName: student.lastName ?? "",
    dateOfBirth: asDate(student.dateOfBirth),
    gender: student.gender ?? "",
    bloodGroup: student.bloodGroup ?? "",
    category: student.category ?? "",
    status: student.status,
    phone: student.phone ?? "",
    email: student.email ?? "",
    addressLine1: student.addressLine1 ?? "",
    city: student.city ?? "",
    state: student.state ?? "",
    postalCode: student.postalCode ?? "",
    previousSchool: student.previousSchool ?? "",
    medicalNotes: student.medicalNotes ?? "",
    exitReason: student.exitReason ?? "",

    aadhaarNumber: student.aadhaarNumber ?? "",
    apaarId: student.apaarId ?? "",
    penNumber: student.penNumber ?? "",
    udiseNumber: student.udiseNumber ?? "",
    boardRegNoIX: student.boardRegNoIX ?? "",
    boardRegNoXI: student.boardRegNoXI ?? "",

    caste: student.caste ?? "",
    disabilityType: student.disabilityType ?? "",

    placeOfBirth: student.placeOfBirth ?? "",
    languageAtHome: student.languageAtHome ?? "",
    house: student.house ?? "",
    admissionFileNo: student.admissionFileNo ?? "",
    previousTcNumber: student.previousTcNumber ?? "",
    previousTcDate: asDate(student.previousTcDate),
    previousBoard: student.previousBoard ?? "",

    heightCm: student.heightCm === null ? "" : String(student.heightCm),
    weightKg: student.weightKg === null ? "" : String(student.weightKg),
    allergies: student.allergies ?? "",
    chronicAilment: student.chronicAilment ?? "",
  };

  const flags: StudentFlagDefaults = {
    isMinority: student.isMinority,
    isBpl: student.isBpl,
    isEws: student.isEws,
    isRteQuota: student.isRteQuota,
    isSingleParent: student.isSingleParent,
    isSingleChild: student.isSingleChild,
    isStaffWard: student.isStaffWard,
    isAlumniChild: student.isAlumniChild,
    hasDisability: student.hasDisability,
    hasSpecialNeeds: student.hasSpecialNeeds,
  };

  const siblings: SiblingRow[] = student.siblings.map((sibling) => ({
    id: sibling.id,
    name: sibling.name,
    relation: sibling.relation,
    dateOfBirth: dateInputValue(sibling.dateOfBirth),
    schoolName: sibling.schoolName ?? "",
    notes: sibling.notes ?? "",
    linkedStudent: sibling.siblingStudent
      ? {
          id: sibling.siblingStudent.id,
          name: `${sibling.siblingStudent.firstName} ${sibling.siblingStudent.lastName ?? ""}`.trim(),
          admissionNo: sibling.siblingStudent.admissionNo,
        }
      : null,
  }));

  // Sorted by class, then section, then name, so the picker's class dropdown
  // reads I A, I B, II A … Prisma cannot order on a to-many relation's field,
  // so the ordering is done here rather than in the query.
  const rollOptions = roll
    .map((candidate) => {
      const father = candidate.guardians.find(
        (link) => link.relationship === "FATHER",
      );
      const contact = father ?? candidate.guardians[0];
      const section = candidate.enrollments[0]?.section;
      return {
        id: candidate.id,
        name: `${candidate.firstName} ${candidate.lastName ?? ""}`.trim(),
        admissionNo: candidate.admissionNo,
        classLevel: section?.classLevel.name ?? "",
        section: section?.name ?? "",
        guardianName: contact
          ? `${contact.guardian.firstName} ${contact.guardian.lastName ?? ""}`.trim()
          : "",
        sortKey: section
          ? [
              String(section.classLevel.numericOrder).padStart(4, "0"),
              section.name,
            ].join("-")
          : // Unenrolled students sort last rather than first.
            "zzzz",
      };
    })
    .sort(
      (left, right) =>
        left.sortKey.localeCompare(right.sortKey) ||
        left.name.localeCompare(right.name),
    );

  return (
    <>
      <PageHeader
        title={`Edit ${student.firstName} ${student.lastName ?? ""}`.trim()}
        description="Profile and status. Promotion is the separate panel at the bottom."
        action={
          <Link href={`/students/${student.id}`} className="text-xs font-medium text-brand">
            Back to profile
          </Link>
        }
      />
      <StudentEditForm
        student={defaults}
        flags={flags}
        currentClass={currentClass}
        sections={sections.map((s) => ({
          id: s.id,
          label: `${s.classLevel.name} ${s.name} · ${s._count.enrollments}/${s.capacity}`,
        }))}
      />

      {/* Outside the profile form: siblings save one at a time, and nesting a
          form inside another is invalid HTML — the inner one never submits. */}
      <div className="mt-4">
        <SiblingPanel
          studentId={student.id}
          siblings={siblings}
          students={rollOptions}
        />
      </div>
    </>
  );
}
