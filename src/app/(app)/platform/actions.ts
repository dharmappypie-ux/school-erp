"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformAdmin } from "@/lib/auth";
import { SubscriptionPlan } from "@/generated/prisma/enums";
import {
  addSchoolAdminCore,
  AddAdminSchema,
  provisionSchool,
  resetSchoolAdminPasswordCore,
  SchoolSchema,
  setSchoolActiveCore,
  setSchoolAdminRoleCore,
  setSchoolAdminStatusCore,
  setSchoolPlanCore,
  type AdminRoleKey,
  type AdminStatus,
} from "@/lib/platform";

/**
 * Platform-owner server actions.
 *
 * These are thin: they authorise the caller, hand the work to `@/lib/platform`
 * and revalidate. The mobile API's `/platform/*` routes call the very same
 * functions, so the console and the app cannot drift apart.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
  values?: Record<string, string>;
}

export async function createSchool(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = SchoolSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePlatformAdmin();
  const result = await provisionSchool(
    { schoolId: session.schoolId, userId: session.userId },
    parsed.data,
  );
  if (!result.ok) return { ok: false, message: result.message, values: raw };

  revalidatePath("/platform");
  return { ok: true, message: result.message };
}

/* -------------------------------------------------------------------------- */
/* Cross-school admin management                                               */
/* -------------------------------------------------------------------------- */

/** Adds an administrator (super admin or admin) to a school. */
export async function addSchoolAdmin(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = AddAdminSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePlatformAdmin();
  const result = await addSchoolAdminCore(
    { schoolId: session.schoolId, userId: session.userId },
    parsed.data,
  );
  if (!result.ok) return { ok: false, message: result.message, values: raw };

  revalidatePath(`/platform/${parsed.data.schoolId}`);
  return { ok: true, message: result.message };
}

/** Switches an admin between SUPER_ADMIN and ADMIN. */
export async function setSchoolAdminRole(
  schoolId: string,
  userId: string,
  roleKey: AdminRoleKey,
): Promise<ActionResult> {
  const session = await requirePlatformAdmin();
  const result = await setSchoolAdminRoleCore(
    { schoolId: session.schoolId, userId: session.userId },
    schoolId,
    userId,
    roleKey,
  );
  if (result.ok) revalidatePath(`/platform/${schoolId}`);
  return result;
}

/** Issues a fresh one-time password for a school admin. */
export async function resetSchoolAdminPassword(
  schoolId: string,
  userId: string,
): Promise<ActionResult> {
  const session = await requirePlatformAdmin();
  const result = await resetSchoolAdminPasswordCore(
    { schoolId: session.schoolId, userId: session.userId },
    schoolId,
    userId,
  );
  if (result.ok) revalidatePath(`/platform/${schoolId}`);
  return result;
}

/** Changes a school's subscription plan, which gates its optional features. */
export async function setSchoolPlan(
  schoolId: string,
  plan: SubscriptionPlan,
): Promise<ActionResult> {
  const session = await requirePlatformAdmin();
  const result = await setSchoolPlanCore(
    { schoolId: session.schoolId, userId: session.userId },
    schoolId,
    plan,
  );
  if (result.ok) {
    revalidatePath(`/platform/${schoolId}`);
    revalidatePath("/platform");
  }
  return result;
}

/** Activates, deactivates or suspends a school admin. */
export async function setSchoolAdminStatus(
  schoolId: string,
  userId: string,
  status: AdminStatus,
): Promise<ActionResult> {
  const session = await requirePlatformAdmin();
  const result = await setSchoolAdminStatusCore(
    { schoolId: session.schoolId, userId: session.userId },
    schoolId,
    userId,
    status,
  );
  if (result.ok) revalidatePath(`/platform/${schoolId}`);
  return result;
}

/** Switches a whole tenant on or off — nobody in it can sign in while off. */
export async function setSchoolActive(
  schoolId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const session = await requirePlatformAdmin();
  const result = await setSchoolActiveCore(
    { schoolId: session.schoolId, userId: session.userId },
    schoolId,
    isActive,
  );
  if (result.ok) {
    revalidatePath(`/platform/${schoolId}`);
    revalidatePath("/platform");
  }
  return result;
}
