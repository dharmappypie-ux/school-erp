import { StaffForm } from "@/app/(app)/staff/new/staff-form";
import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Add staff" };

export default async function NewStaffPage() {
  const session = await requirePermission("staff.create");
  const db = scopedDb(session.schoolId);

  const [departments, designations, roles] = await Promise.all([
    db.department.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.designation.findMany({
      orderBy: { rank: "asc" },
      select: { id: true, name: true },
    }),
    // Portal-only roles are excluded: a staff member should never be created
    // as a student or a parent.
    db.role.findMany({
      where: { key: { notIn: ["STUDENT", "PARENT"] } },
      orderBy: { name: "asc" },
      select: { key: true, name: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Add staff"
        description="Creates the staff record and their sign-in together."
      />
      <StaffForm
        departments={departments}
        designations={designations}
        roles={roles}
      />
    </>
  );
}
