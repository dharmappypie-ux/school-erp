import Link from "next/link";
import { notFound } from "next/navigation";

import {
  StaffEditForm,
  type StaffDefaults,
} from "@/app/(app)/staff/[id]/edit/staff-edit-form";
import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { scopedDb } from "@/lib/tenant";

export const metadata = { title: "Edit staff" };

const asDate = (value: Date | null) =>
  value ? value.toISOString().slice(0, 10) : "";

export default async function EditStaffPage({ params }: PageProps<"/staff/[id]/edit">) {
  const session = await requirePermission("staff.update");
  const db = scopedDb(session.schoolId);
  const { id } = await params;

  const [staff, departments, designations, roles] = await Promise.all([
    db.staffMember.findUnique({
      where: { id },
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true,
        dateOfBirth: true, gender: true, staffType: true, employmentStatus: true,
        departmentId: true, designationId: true, qualification: true, experience: true,
        addressLine1: true, city: true, state: true, postalCode: true,
        user: { select: { roles: { select: { key: true } } } },
      },
    }),
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.designation.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.role.findMany({ orderBy: { name: "asc" }, select: { key: true, name: true } }),
  ]);

  if (!staff) notFound();

  const defaults: StaffDefaults = {
    id: staff.id,
    firstName: staff.firstName,
    lastName: staff.lastName ?? "",
    email: staff.email ?? "",
    phone: staff.phone ?? "",
    dateOfBirth: asDate(staff.dateOfBirth),
    gender: staff.gender ?? "",
    staffType: staff.staffType,
    employmentStatus: staff.employmentStatus,
    departmentId: staff.departmentId ?? "",
    designationId: staff.designationId ?? "",
    roleKey: staff.user?.roles[0]?.key ?? "",
    qualification: staff.qualification ?? "",
    experience: staff.experience != null ? String(staff.experience) : "",
    addressLine1: staff.addressLine1 ?? "",
    city: staff.city ?? "",
    state: staff.state ?? "",
    postalCode: staff.postalCode ?? "",
  };

  return (
    <>
      <PageHeader
        title={`Edit ${staff.firstName} ${staff.lastName ?? ""}`.trim()}
        description="Changes to the name, email or phone update both the profile and the login."
        action={
          <Link href={`/staff/${staff.id}`} className="text-xs font-medium text-brand">
            Back to profile
          </Link>
        }
      />
      <StaffEditForm
        staff={defaults}
        departments={departments}
        designations={designations}
        roles={roles}
      />
    </>
  );
}
