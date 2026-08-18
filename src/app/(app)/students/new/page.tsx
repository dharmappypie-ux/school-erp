import { StudentForm } from "@/app/(app)/students/new/student-form";
import { Alert, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Add student" };

export default async function NewStudentPage() {
  const session = await requirePermission("students.create");
  const db = scopedDb(session.schoolId);

  if (!session.academicYear) {
    return (
      <>
        <PageHeader title="Add student" />
        <Alert tone="warning" title="No academic year is current">
          A student cannot be enrolled until an academic year is marked current.
        </Alert>
      </>
    );
  }

  const sections = await db.section.findMany({
    where: { academicYearId: session.academicYear.id },
    orderBy: [{ classLevel: { numericOrder: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      capacity: true,
      classLevel: { select: { name: true } },
      _count: { select: { enrollments: { where: { isActive: true } } } },
    },
  });

  return (
    <>
      <PageHeader
        title="Add student"
        description={`Enrolling into ${session.academicYear.name}`}
      />

      {sections.length === 0 ? (
        <Alert tone="warning" title="No classes configured">
          Create at least one class section before adding students.
        </Alert>
      ) : (
        <StudentForm
          sections={sections.map((section) => ({
            id: section.id,
            label: `${section.classLevel.name} ${section.name}`,
            seatsLeft: section.capacity - section._count.enrollments,
          }))}
        />
      )}
    </>
  );
}
