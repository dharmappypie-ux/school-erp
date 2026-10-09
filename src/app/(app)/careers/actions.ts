"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { scopedDb } from "@/lib/tenant";

export interface JobState {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

const JobSchema = z.object({
  title: z.string().trim().min(1, "Give the post a title").max(160),
  category: z.string().trim().min(1, "Choose a category").max(60),
  description: z.string().trim().max(4000).optional(),
  responsibilities: z.string().trim().max(4000).optional(),
  location: z.string().trim().max(120).optional(),
  qualification: z.string().trim().max(200).optional(),
  salaryRange: z.string().trim().max(80).optional(),
  minExperience: z.string().trim().optional(),
  vacancies: z.string().trim().optional(),
  cvRequired: z.string().optional(),
  closingDate: z.string().trim().optional(),
  publishNow: z.string().optional(),
});

/**
 * Builds the quotable reference printed on adverts.
 *
 * Deliberately not sequential: a sequence leaks how many posts a school has
 * ever advertised, and applicants quote references over the phone, so the
 * alphabet drops characters that are misheard or misread (0/O, 1/I).
 */
function buildReference(): string {
  const alphabet = "ACDEFGHJKLMNPQRTUVWXY2346789";
  let suffix = "";
  for (let index = 0; index < 6; index += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `JOB-${suffix}`;
}

export async function createJobPosting(
  _previous: JobState,
  formData: FormData,
): Promise<JobState> {
  const raw = Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, String(value)]),
  );

  const parsed = JobSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return {
      ok: false,
      message: "Please correct the highlighted fields.",
      fieldErrors,
      values: raw,
    };
  }

  const session = await requirePermission("careers.manage");
  const db = scopedDb(session.schoolId);
  const input = parsed.data;

  let closingDate: Date | null = null;
  if (input.closingDate) {
    closingDate = new Date(`${input.closingDate}T23:59:59`);
    if (Number.isNaN(closingDate.getTime())) {
      return {
        ok: false,
        message: "That closing date could not be read.",
        fieldErrors: { closingDate: "Enter a valid date" },
        values: raw,
      };
    }
    // Publishing a post that has already closed would show applicants a form
    // they cannot submit.
    if (input.publishNow === "true" && closingDate < new Date()) {
      return {
        ok: false,
        message: "Please correct the highlighted fields.",
        fieldErrors: { closingDate: "A published post must close in the future" },
        values: raw,
      };
    }
  }

  const minExperience = input.minExperience
    ? Number.parseInt(input.minExperience, 10)
    : null;
  const vacancies = input.vacancies ? Number.parseInt(input.vacancies, 10) : 1;

  if (minExperience !== null && (Number.isNaN(minExperience) || minExperience < 0)) {
    return {
      ok: false,
      message: "Please correct the highlighted fields.",
      fieldErrors: { minExperience: "Enter a number of years, or leave blank" },
      values: raw,
    };
  }
  if (Number.isNaN(vacancies) || vacancies < 1) {
    return {
      ok: false,
      message: "Please correct the highlighted fields.",
      fieldErrors: { vacancies: "At least one vacancy" },
      values: raw,
    };
  }

  // Collisions are vanishingly unlikely but the reference is unique per school,
  // so retry rather than fail the whole submission on one unlucky draw.
  let created: { id: string; reference: string } | null = null;
  for (let attempt = 0; attempt < 5 && created === null; attempt += 1) {
    const reference = buildReference();
    const clash = await db.jobPosting.findFirst({
      where: { reference },
      select: { id: true },
    });
    if (clash) continue;

    created = await db.jobPosting.create({
      data: {
        schoolId: session.schoolId,
        reference,
        title: input.title,
        category: input.category,
        description: input.description || null,
        responsibilities: input.responsibilities || null,
        location: input.location || null,
        qualification: input.qualification || null,
        salaryRange: input.salaryRange || null,
        minExperience,
        vacancies,
        cvRequired: input.cvRequired === "true",
        status: input.publishNow === "true" ? "OPEN" : "DRAFT",
        publishedAt: input.publishNow === "true" ? new Date() : null,
        closingDate,
        createdById: session.userId,
      },
      select: { id: true, reference: true },
    });
  }

  if (!created) {
    return {
      ok: false,
      message: "Could not allocate a reference. Please try again.",
      values: raw,
    };
  }

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "careers.create",
    entityType: "JobPosting",
    entityId: created.id,
    after: { reference: created.reference, title: input.title },
  });

  revalidatePath("/careers");

  return {
    ok: true,
    message:
      input.publishNow === "true"
        ? `Published as ${created.reference}.`
        : `Saved as a draft (${created.reference}).`,
  };
}

const STATUSES = ["DRAFT", "OPEN", "CLOSED", "FILLED"] as const;

/** Moves a post between draft, open, closed and filled. */
export async function setJobStatus(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!id || !(STATUSES as readonly string[]).includes(status)) return;

  const session = await requirePermission("careers.manage");
  const db = scopedDb(session.schoolId);

  const existing = await db.jobPosting.findFirst({
    where: { id },
    select: { id: true, status: true, publishedAt: true },
  });
  if (!existing || existing.status === status) return;

  await db.jobPosting.update({
    where: { id: existing.id },
    data: {
      status: status as (typeof STATUSES)[number],
      // First time it goes live, stamp the publication date and keep it.
      publishedAt:
        status === "OPEN" && existing.publishedAt === null
          ? new Date()
          : existing.publishedAt,
    },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "careers.status",
    entityType: "JobPosting",
    entityId: existing.id,
    before: { status: existing.status },
    after: { status },
  });

  revalidatePath("/careers");
}
