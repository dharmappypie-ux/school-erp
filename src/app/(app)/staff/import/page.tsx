import { ImportForm } from "@/app/(app)/staff/import/import-form";
import { Alert, Card, CardHeader, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { buildTemplateCsv, TEMPLATE_COLUMNS } from "@/lib/staff-import";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Import staff" };

export default async function ImportStaffPage() {
  const session = await requirePermission("staff.create");
  const db = scopedDb(session.schoolId);

  const [roles, departments, designations] = await Promise.all([
    // Same exclusion as the one-at-a-time form: a staff member should never be
    // created as a student or a parent.
    db.role.findMany({
      where: { key: { notIn: ["STUDENT", "PARENT"] } },
      orderBy: { name: "asc" },
      select: { key: true, name: true },
    }),
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.designation.findMany({ orderBy: { rank: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Import staff"
        description="Bring the whole payroll in from a spreadsheet — record and sign-in together."
      />

      <Alert tone="warning" title="This creates logins, not just records">
        Every row becomes a user account as well as a staff record, and the role
        on that row decides what the person can open. Check the roles on the
        preview before importing.
      </Alert>

      <div className="mt-4">
        <ImportForm templateCsv={buildTemplateCsv()} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Columns it reads"
            description="Only First Name, Email and Role are required; the rest are optional"
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
            title="Roles to use"
            description="Write the key or the name — either is accepted, and an unknown one is rejected rather than guessed"
          />
          <div className="flex flex-wrap gap-1.5 px-5 pb-5">
            {roles.length === 0 ? (
              <p className="text-[13px] text-muted">
                No roles have been set up in this school yet.
              </p>
            ) : (
              roles.map((role) => (
                <span
                  key={role.key}
                  className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted"
                >
                  {role.name} · <span className="font-mono">{role.key}</span>
                </span>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Departments"
            description="Matched by name. A department that is not listed here is an error — the import never creates one"
          />
          <div className="flex flex-wrap gap-1.5 px-5 pb-5">
            {departments.length === 0 ? (
              <p className="text-[13px] text-muted">
                No departments yet. Add them first, or leave the column blank.
              </p>
            ) : (
              departments.map((department) => (
                <span
                  key={department.id}
                  className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted"
                >
                  {department.name}
                </span>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Designations"
            description="Matched by name, the same way as departments"
          />
          <div className="flex flex-wrap gap-1.5 px-5 pb-5">
            {designations.length === 0 ? (
              <p className="text-[13px] text-muted">
                No designations yet. Add them first, or leave the column blank.
              </p>
            ) : (
              designations.map((designation) => (
                <span
                  key={designation.id}
                  className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted"
                >
                  {designation.name}
                </span>
              ))
            )}
          </div>
        </Card>
      </div>

      <p className="mt-4 text-[11px] text-muted">
        Dates may be written DD/MM/YYYY or YYYY-MM-DD. Day-first is assumed —
        03/04/2015 is read as 3 April. Employee IDs left blank are generated in
        sequence (EMP0001, EMP0002 …).
      </p>
    </>
  );
}
