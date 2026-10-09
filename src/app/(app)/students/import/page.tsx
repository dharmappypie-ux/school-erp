import { ImportForm } from "@/app/(app)/students/import/import-form";
import { Alert, Card, CardHeader, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { buildTemplateCsv, TEMPLATE_COLUMNS } from "@/lib/student-import";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Import students" };

export default async function ImportStudentsPage() {
  const session = await requirePermission("students.create");
  const db = scopedDb(session.schoolId);
  const yearId = session.academicYear?.id;

  const sections = yearId
    ? await db.section.findMany({
        where: { academicYearId: yearId },
        orderBy: [{ classLevel: { numericOrder: "asc" } }, { name: "asc" }],
        select: { name: true, classLevel: { select: { name: true } } },
      })
    : [];

  return (
    <>
      <PageHeader
        title="Import students"
        description="Bring a whole roll in from a spreadsheet."
      />

      {!yearId ? (
        <Alert tone="warning" title="No academic year is open">
          Students can still be imported, but they will not be enrolled in a
          class until you open a year and set up its sections.
        </Alert>
      ) : null}

      <ImportForm templateCsv={buildTemplateCsv()} />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Columns it reads"
            description="Only Admission No and a name are required; the rest are optional"
          />
          <div className="flex flex-wrap gap-1.5 px-5 pb-5">
            {TEMPLATE_COLUMNS.map((column) => (
              <span
                key={column}
                className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted"
              >
                {column}
              </span>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Class names to use"
            description="Write them exactly as they appear here, or the row is rejected"
          />
          <div className="flex flex-wrap gap-1.5 px-5 pb-5">
            {sections.length === 0 ? (
              <p className="text-[13px] text-muted">
                No sections in the current year yet.
              </p>
            ) : (
              sections.map((section) => (
                <span
                  key={`${section.classLevel.name}-${section.name}`}
                  className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted"
                >
                  {section.classLevel.name} · {section.name}
                </span>
              ))
            )}
          </div>
        </Card>
      </div>

      <p className="mt-4 text-[11px] text-muted">
        Dates may be written DD/MM/YYYY or YYYY-MM-DD. Day-first is assumed —
        03/04/2015 is read as 3 April.
      </p>
    </>
  );
}
