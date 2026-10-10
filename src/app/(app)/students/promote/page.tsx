import Link from "next/link";

import {
  PromotionForm,
  type SectionOption,
} from "@/app/(app)/students/promote/promotion-form";
import { Alert, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Promotion" };

export default async function PromotePage({
  searchParams,
}: PageProps<"/students/promote">) {
  const session = await requirePermission("students.update");
  const db = scopedDb(session.schoolId);
  const params = await searchParams;
  const sourceSectionId =
    typeof params.section === "string" ? params.section : "";

  const years = await db.academicYear.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, isCurrent: true, isLocked: true },
  });

  const sections = await db.section.findMany({
    orderBy: [
      { academicYear: { startDate: "desc" } },
      { classLevel: { numericOrder: "asc" } },
      { name: "asc" },
    ],
    select: {
      id: true,
      name: true,
      capacity: true,
      academicYearId: true,
      classLevel: { select: { name: true, numericOrder: true } },
      _count: { select: { enrollments: { where: { isActive: true } } } },
    },
  });

  const yearById = new Map(years.map((year) => [year.id, year]));
  const source = sections.find((section) => section.id === sourceSectionId);

  const roster = source
    ? await db.enrollment.findMany({
        where: { sectionId: source.id, isActive: true },
        orderBy: [{ rollNumber: "asc" }, { student: { firstName: "asc" } }],
        select: {
          rollNumber: true,
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              admissionNo: true,
            },
          },
        },
      })
    : [];

  // Only sections in a LATER year are valid targets: promotion moves a student
  // forward into the next session, and the one-enrollment-per-year rule makes
  // a same-year target impossible anyway.
  const sourceYear = source ? yearById.get(source.academicYearId) : undefined;
  const targets: SectionOption[] = source
    ? sections
        .filter((section) => {
          const year = yearById.get(section.academicYearId);
          if (!year || year.isLocked) return false;
          if (section.academicYearId === source.academicYearId) return false;
          const sourceStart = sourceYear?.name ?? "";
          // Compare by name as a stable ordering of session labels (2026-2027).
          return year.name > sourceStart;
        })
        .map((section) => ({
          id: section.id,
          label: `${section.classLevel.name} ${section.name}`,
          yearName: yearById.get(section.academicYearId)?.name ?? "",
          capacity: section.capacity,
          seatsLeft: Math.max(section.capacity - section._count.enrollments, 0),
        }))
    : [];

  return (
    <>
      <PageHeader
        title="Student promotion"
        description="Move a whole class into the next academic year in one step."
      />

      <Card>
        <CardHeader
          title="Choose the class to promote"
          description="Pick the class as it stands in the year that is ending"
        />
        <div className="flex flex-wrap gap-2 px-5 pb-5">
          {sections.length === 0 ? (
            <p className="text-[13px] text-muted">
              No classes have been set up yet.
            </p>
          ) : (
            sections.map((section) => {
              const year = yearById.get(section.academicYearId);
              const isActive = section.id === sourceSectionId;
              return (
                <Link
                  key={section.id}
                  href={`/students/promote?section=${section.id}`}
                  className={`rounded-lg border px-3 py-1.5 text-[13px] transition ${
                    isActive
                      ? "border-brand bg-brand/10 font-medium text-brand"
                      : "border-border hover:border-brand/40"
                  }`}
                >
                  {section.classLevel.name} {section.name}
                  <span className="ml-1.5 text-[11px] text-muted">
                    {year?.name} · {section._count.enrollments}
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </Card>

      <div className="mt-4">
        {!source ? (
          <Card>
            <EmptyState
              title="Pick a class above"
              description="Then decide who is promoted, retained, or leaving."
            />
          </Card>
        ) : roster.length === 0 ? (
          <Card>
            <EmptyState
              title="No active students in that class"
              description="Nothing to promote here."
            />
          </Card>
        ) : targets.length === 0 ? (
          <Alert tone="warning" title="Nowhere to promote into">
            There is no unlocked class in a later academic year. Create next
            year&rsquo;s classes first, then come back.
          </Alert>
        ) : (
          <PromotionForm
            sourceSectionId={source.id}
            sourceLabel={`${source.classLevel.name} ${source.name} (${sourceYear?.name ?? ""})`}
            roster={roster.map((row) => ({
              studentId: row.student.id,
              name: `${row.student.firstName} ${row.student.lastName ?? ""}`.trim(),
              admissionNo: row.student.admissionNo,
              rollNumber: row.rollNumber ?? "",
            }))}
            targets={targets}
          />
        )}
      </div>
    </>
  );
}
