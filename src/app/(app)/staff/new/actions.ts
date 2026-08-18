"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import { scopedDb } from "@/lib/tenant";

export interface CreateStaffState {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
  /** Echoed back so a rejected form keeps what the user typed. */
  values?: Record<string, string>;
}

/**
 * An HTML select submits "" when nothing is chosen, which `z.enum().optional()`
 * rejects rather than treating as absent. Coerce it to undefined first, or a
 * user who simply left Gender blank gets a validation failure with no
 * indication of which field is wrong.
 */
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

const CreateStaffSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: optionalText,
  email: z.string().trim().email("A valid email is required for the login"),
  phone: optionalText,
  employeeId: optionalText,
  dateOfBirth: optionalText,
  gender: optionalEnum(["MALE", "FEMALE", "OTHER"] as const),

  staffType: z.enum([
    "TEACHING", "NON_TEACHING", "ADMINISTRATIVE", "SUPPORT", "MANAGEMENT",
  ]),
  departmentId: optionalText,
  designationId: optionalText,
  roleKey: z.string().trim().min(1, "Choose a system role"),
  joiningDate: optionalText,
  qualification: optionalText,
  experience: optionalText,

  addressLine1: optionalText,
  city: optionalText,
  state: optionalText,
  postalCode: optionalText,
});

/**
 * Creates a staff member together with their login.
 *
 * The user account and the staff record are written in one transaction — a
 * staff record without a login cannot sign in, and a login without a staff
 * record has no timetable or payroll, so neither may exist alone.
 */
export async function createStaff(
  _previous: CreateStaffState,
  formData: FormData,
): Promise<CreateStaffState> {
  const raw = Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, String(value)]),
  );

  const parsed = CreateStaffSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { ok: false, message: "Please correct the highlighted fields.", fieldErrors, values: raw };
  }

  const session = await requirePermission("staff.create");
  const db = scopedDb(session.schoolId);
  const input = parsed.data;
  const email = input.email.toLowerCase();

  const existing = await db.user.findFirst({ where: { email } });
  if (existing) {
    return {
      ok: false,
      message: "A user with that email already exists in this school.",
      fieldErrors: { email: "Already in use" },
      values: raw,
    };
  }

  const role = await db.role.findUnique({
    where: { schoolId_key: { schoolId: session.schoolId, key: input.roleKey } },
    select: { id: true, key: true },
  });
  if (!role) {
    return { ok: false, message: "That system role does not exist.", values: raw };
  }

  // Employee ids are sequential per school unless one is supplied.
  let employeeId = input.employeeId;
  if (!employeeId) {
    const latest = await db.staffMember.findFirst({
      where: { employeeId: { startsWith: "EMP" } },
      orderBy: { employeeId: "desc" },
      select: { employeeId: true },
    });
    const sequence = latest
      ? Number.parseInt(latest.employeeId.replace(/\D/g, ""), 10) + 1
      : 1;
    employeeId = `EMP${String(Number.isFinite(sequence) ? sequence : 1).padStart(4, "0")}`;
  }

  const temporaryPassword = `${employeeId}@${new Date().getFullYear()}`;
  const passwordHash = await hashPassword(temporaryPassword);

  let staffId: string;

  try {
    staffId = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          schoolId: session.schoolId,
          email,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          passwordHash,
          mustChangePassword: true,
          status: "ACTIVE",
          roles: { connect: [{ id: role.id }] },
        },
      });

      const staff = await tx.staffMember.create({
        data: {
          schoolId: session.schoolId,
          userId: user.id,
          employeeId: employeeId!,
          firstName: input.firstName,
          lastName: input.lastName,
          email,
          phone: input.phone,
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
          gender: input.gender,
          staffType: input.staffType,
          employmentStatus: "ACTIVE",
          joiningDate: input.joiningDate ? new Date(input.joiningDate) : new Date(),
          departmentId: input.departmentId ?? null,
          designationId: input.designationId ?? null,
          qualification: input.qualification,
          experience: input.experience ? Number(input.experience) : null,
          addressLine1: input.addressLine1,
          city: input.city,
          state: input.state,
          postalCode: input.postalCode,
        },
      });

      return staff.id;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: message.includes("Unique constraint")
        ? "That employee ID or email is already in use. Nothing was created."
        : `Could not create the staff member, and the change was rolled back: ${message}`,
      values: raw,
    };
  }

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "staff.create",
    entityType: "StaffMember",
    entityId: staffId,
    after: { employeeId, email, role: role.key, staffType: input.staffType },
  });

  revalidatePath("/staff");

  redirect(`/staff/${staffId}?created=${encodeURIComponent(employeeId)}`);
}
