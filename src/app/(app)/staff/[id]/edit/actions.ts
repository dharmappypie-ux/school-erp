"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { scopedDb } from "@/lib/tenant";

export interface EditStaffState {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.enum(values).optional(),
  );

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const EditStaffSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: optionalText,
  email: z.string().trim().email("A valid email is required for the login"),
  phone: optionalText,
  dateOfBirth: optionalText,
  gender: optionalEnum(["MALE", "FEMALE", "OTHER"] as const),
  staffType: z.enum(["TEACHING", "NON_TEACHING", "ADMINISTRATIVE", "SUPPORT", "MANAGEMENT"]),
  employmentStatus: z.enum(["ACTIVE", "PROBATION", "ON_LEAVE", "RESIGNED", "TERMINATED", "RETIRED"]),
  departmentId: optionalText,
  designationId: optionalText,
  roleKey: z.string().trim().min(1, "Choose a system role"),
  qualification: optionalText,
  experience: optionalText,
  addressLine1: optionalText,
  city: optionalText,
  state: optionalText,
  postalCode: optionalText,
});

/**
 * Edits a staff member.
 *
 * Name, email and phone live on BOTH the login (`User`) and the staff record,
 * and the system role lives on the login only. Everything is written in one
 * transaction so the two halves can never drift apart — a mismatch here is
 * exactly the bug that made a teacher show one name on their profile and a
 * different one on their homework.
 */
export async function editStaff(
  _previous: EditStaffState,
  formData: FormData,
): Promise<EditStaffState> {
  const raw = Object.fromEntries(
    [...formData.entries()].map(([k, v]) => [k, String(v)]),
  );
  const parsed = EditStaffSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { ok: false, message: "Please correct the highlighted fields.", fieldErrors, values: raw };
  }

  const session = await requirePermission("staff.update");
  const db = scopedDb(session.schoolId);
  const input = parsed.data;
  const email = input.email.toLowerCase();

  const staff = await db.staffMember.findUnique({
    where: { id: input.id },
    select: { id: true, userId: true, employeeId: true },
  });
  if (!staff) return { ok: false, message: "Staff member not found in your school.", values: raw };

  // Email is the login identifier; a clash with anyone else is fatal.
  const clash = await db.user.findFirst({
    where: { email, NOT: staff.userId ? { id: staff.userId } : undefined },
    select: { id: true },
  });
  if (clash) {
    return {
      ok: false,
      message: "Another user already has that email.",
      fieldErrors: { email: "Already in use" },
      values: raw,
    };
  }

  const role = await db.role.findUnique({
    where: { schoolId_key: { schoolId: session.schoolId, key: input.roleKey } },
    select: { id: true },
  });
  if (!role) return { ok: false, message: "That system role does not exist.", values: raw };

  // The only rule that actually matters: a school must never be left with zero
  // super admins. Editing your own profile — even your own role — is fine as
  // long as someone can still administer the school afterwards. So the block
  // fires only when this person is the LAST active super admin and the edit
  // would take that role or that access away, whether it is you or someone else.
  const leavingAdmin =
    input.roleKey !== "SUPER_ADMIN" ||
    ["RESIGNED", "TERMINATED", "RETIRED"].includes(input.employmentStatus);

  if (staff.userId && leavingAdmin) {
    const isCurrentlyAdmin = await db.user.findFirst({
      where: { id: staff.userId, roles: { some: { key: "SUPER_ADMIN" } } },
      select: { id: true },
    });
    if (isCurrentlyAdmin) {
      const otherAdmins = await db.user.count({
        where: {
          status: "ACTIVE",
          roles: { some: { key: "SUPER_ADMIN" } },
          NOT: { id: staff.userId },
        },
      });
      if (otherAdmins === 0) {
        return {
          ok: false,
          message:
            "This is the school's only super admin. Promote another staff member to super admin first, then change this one.",
          values: raw,
        };
      }
    }
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.staffMember.update({
        where: { id: staff.id },
        data: {
          firstName: input.firstName,
          lastName: input.lastName ?? null,
          email,
          phone: input.phone ?? null,
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
          gender: input.gender ?? null,
          staffType: input.staffType,
          employmentStatus: input.employmentStatus,
          departmentId: input.departmentId ?? null,
          designationId: input.designationId ?? null,
          qualification: input.qualification ?? null,
          experience: input.experience ? Number(input.experience) : null,
          addressLine1: input.addressLine1 ?? null,
          city: input.city ?? null,
          state: input.state ?? null,
          postalCode: input.postalCode ?? null,
        },
      });

      if (staff.userId) {
        await tx.user.update({
          where: { id: staff.userId },
          data: {
            firstName: input.firstName,
            lastName: input.lastName ?? null,
            email,
            phone: input.phone ?? null,
            // Replace the whole role set: a staff member holds exactly one
            // system role, so `set` avoids leaving an old one attached.
            roles: { set: [{ id: role.id }] },
          },
        });
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Could not save: ${message}`, values: raw };
  }

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "staff.update",
    entityType: "StaffMember",
    entityId: staff.id,
    after: { email, roleKey: input.roleKey, employmentStatus: input.employmentStatus },
  });

  revalidatePath(`/staff/${staff.id}`);
  revalidatePath("/staff");
  return { ok: true, message: "Saved." };
}
