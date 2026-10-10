import { StudentForm } from "@/app/(app)/students/new/student-form";
import { Alert, ButtonLink, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Add student" };

export default async function NewStudentPage() {
  const session = await requirePermission("students.create");
  const db = scopedDb(session.schoolId);
  // Only offer the fix to someone who can actually perform it.
  const canSetUpClasses = hasPermission(session.permissions, "academics.manage");

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
          <p>A student is enrolled into a section, so one has to exist first.</p>
          {/* Telling someone what is missing without a way to fix it leaves them
              to guess which screen it lives on. */}
          {canSetUpClasses ? (
            <div className="mt-3">
              <ButtonLink href="/academics">Set up classes</ButtonLink>
            </div>
          ) : (
            <p className="mt-2">
              Ask an administrator to add one under Classes &amp; subjects.
            </p>
          )}
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
