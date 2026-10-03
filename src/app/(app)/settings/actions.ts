"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { scopedDb } from "@/lib/tenant";

export interface ActionResult {
  ok: boolean;
  message: string;
  values?: Record<string, string>;
}

const YearSchema = z
  .object({
    name: z.string().trim().min(4, "A year name is required, e.g. 2026-27").max(20),
    startDate: z.string().min(1, "A start date is required"),
    endDate: z.string().min(1, "An end date is required"),
    makeCurrent: z.string().optional(),
  })
  .refine((data) => !Number.isNaN(new Date(data.startDate).getTime()), {
    message: "The start date could not be read",
    path: ["startDate"],
  })
  .refine((data) => !Number.isNaN(new Date(data.endDate).getTime()), {
    message: "The end date could not be read",
    path: ["endDate"],
  })
  .refine((data) => new Date(data.endDate) > new Date(data.startDate), {
    message: "The year must end after it starts",
    path: ["endDate"],
  });

/**
 * Creates an academic year. The first year a school creates, or one the admin
 * explicitly marks current, becomes the current year — and only one year is
 * ever current, so promoting a new one is done in a transaction that clears the
 * flag on the rest.
 */
export async function createAcademicYear(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = YearSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", values: raw };
  }

  const session = await requirePermission("academicyear.manage");
  const db = scopedDb(session.schoolId);

  const clash = await db.academicYear.findFirst({
    where: { name: parsed.data.name },
    select: { id: true },
  });
  if (clash) {
    return { ok: false, message: `An academic year named "${parsed.data.name}" already exists.`, values: raw };
  }

  const existingCount = await db.academicYear.count();
  const makeCurrent = parsed.data.makeCurrent === "yes" || existingCount === 0;

  const year = await db.$transaction(async (tx) => {
    if (makeCurrent) {
      // Only one year is current at a time.
      await tx.academicYear.updateMany({
        where: { schoolId: session.schoolId, isCurrent: true },
        data: { isCurrent: false },
      });
    }
    return tx.academicYear.create({
      data: {
        schoolId: session.schoolId,
        name: parsed.data.name,
        startDate: new Date(parsed.data.startDate),
        endDate: new Date(parsed.data.endDate),
        isCurrent: makeCurrent,
      },
      select: { id: true, name: true, isCurrent: true },
    });
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "settings.academicyear.create",
    entityType: "AcademicYear",
    entityId: year.id,
    after: { name: year.name, isCurrent: year.isCurrent },
  });

  revalidatePath("/settings");
  return {
    ok: true,
    message: year.isCurrent
      ? `${year.name} created and set as the current year.`
      : `${year.name} created. Make it current when the session begins.`,
  };
}

/**
 * Switches which academic year is current. Everything year-scoped (sections,
 * fees, exams, attendance) keys off this, so it is a transaction that clears
 * the old current flag before setting the new one.
 */
export async function setCurrentYear(yearId: string): Promise<ActionResult> {
  const session = await requirePermission("academicyear.manage");
  const db = scopedDb(session.schoolId);

  const year = await db.academicYear.findUnique({
    where: { id: yearId },
    select: { id: true, name: true, isCurrent: true },
  });
  if (!year) return { ok: false, message: "That academic year does not exist." };
  if (year.isCurrent) return { ok: true, message: `${year.name} is already current.` };

  await db.$transaction([
    db.academicYear.updateMany({
      where: { schoolId: session.schoolId, isCurrent: true },
      data: { isCurrent: false },
    }),
    db.academicYear.update({ where: { id: year.id }, data: { isCurrent: true } }),
  ]);

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "settings.academicyear.setcurrent",
    entityType: "AcademicYear",
    entityId: year.id,
    after: { name: year.name, isCurrent: true },
  });

  revalidatePath("/settings");
  return { ok: true, message: `${year.name} is now the current academic year.` };
}
