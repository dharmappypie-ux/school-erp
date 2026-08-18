import Link from "next/link";
import { notFound } from "next/navigation";

import {
  StudentEditForm,
  type StudentDefaults,
} from "@/app/(app)/students/[id]/edit/student-edit-form";
import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Edit student" };

const asDate = (value: Date | null) =>
  value ? value.toISOString().slice(0, 10) : "";

export default async function EditStudentPage({ params }: PageProps<"/students/[id]/edit">) {
  const session = await requirePermission("students.update");
  const db = scopedDb(session.schoolId);
  const { id } = await params;
  const yearId = session.academicYear?.id;

  const [student, sections] = await Promise.all([
    db.student.findUnique({
      where: { id },
      select: {
        id: true, firstName: true, middleName: true, lastName: true,
        dateOfBirth: true, gender: true, bloodGroup: true, category: true,
        status: true, phone: true, email: true, addressLine1: true,
        city: true, state: true, postalCode: true, previousSchool: true,
        medicalNotes: true, exitReason: true,
        enrollments: {
          where: { isActive: true },
          take: 1,
          select: {
            section: {
              select: { name: true, classLevel: { select: { name: true } } },
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
  };

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
        currentClass={currentClass}
        sections={sections.map((s) => ({
          id: s.id,
          label: `${s.classLevel.name} ${s.name} · ${s._count.enrollments}/${s.capacity}`,
        }))}
      />
    </>
  );
}
