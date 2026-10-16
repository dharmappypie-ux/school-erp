"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAnyPermission } from "@/lib/auth";
import {
  isOutcome,
  promoteSection,
  type Outcome,
  type PromotionState,
} from "@/lib/promotion";
import { scopedDb } from "@/lib/tenant";

export type { PromotionState } from "@/lib/promotion";

const PromoteSchema = z.object({
  sourceSectionId: z.string().min(1, "Choose the class to promote from"),
  targetSectionId: z.string().min(1, "Choose the class to promote into"),
  allowOverfill: z.string().optional(),
});

/**
 * Promotes a whole class at once. The rules live in `@/lib/promotion`, which
 * the mobile app's promotion screen calls too; this reads the form and
 * revalidates.
 */
export async function promoteClass(
  _previous: PromotionState,
  formData: FormData,
): Promise<PromotionState> {
  const parsed = PromoteSchema.safeParse({
    sourceSectionId: formData.get("sourceSectionId"),
    targetSectionId: formData.get("targetSectionId"),
    allowOverfill: formData.get("allowOverfill") ?? undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the selected classes.",
    };
  }

  const session = await requireAnyPermission([
    "students.update",
    "students.promote",
  ]);
  const { sourceSectionId, targetSectionId } = parsed.data;

  // Per-student decisions come back as outcome:<studentId>. Read them from the
  // source class's roll rather than from the form's keys, so a crafted post
  // cannot name a student in another class.
  const db = scopedDb(session.schoolId);
  const roll = await db.enrollment.findMany({
    where: { sectionId: sourceSectionId, isActive: true },
    select: { studentId: true },
  });

  const outcomes = new Map<string, Outcome>();
  for (const { studentId } of roll) {
    const raw = formData.get(`outcome:${studentId}`);
    if (isOutcome(raw)) outcomes.set(studentId, raw);
  }

  const result = await promoteSection(
    { schoolId: session.schoolId, userId: session.userId },
    {
      sourceSectionId,
      targetSectionId,
      allowOverfill: parsed.data.allowOverfill === "true",
      outcomes,
    },
  );

  if (result.ok) {
    revalidatePath("/students");
    revalidatePath("/students/promote");
  }

  return result;
}
