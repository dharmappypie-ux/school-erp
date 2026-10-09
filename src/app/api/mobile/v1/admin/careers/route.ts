import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * GET /api/mobile/v1/admin/careers
 *
 * The postings board, ordered as the web screen orders it — by status (draft,
 * open, closed, filled, the enum's own order) then newest first.
 *
 * `JobPosting` is absent from TENANT_MODELS in src/lib/tenant.ts, so `scopedDb`
 * injects no tenant clause for it: every query in this file filters `schoolId`
 * by hand. The filters stay correct once the model is registered — the
 * extension ANDs its clause onto the caller's.
 */
export async function GET(req: Request) {
  // The web page gates on either permission; a manage-only custom role must not
  // find itself locked out of the list it is allowed to edit.
  const guard = await requireMobile(req, ["careers.read", "careers.manage"]);
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const canManage = hasPermission(session.permissions, "careers.manage");
  const now = new Date();

  const rows = await db.jobPosting.findMany({
    // A careers.read-only caller is usually front office fielding phone calls:
    // they need the live adverts, not half-written drafts.
    where: canManage
      ? { schoolId: session.schoolId }
      : { schoolId: session.schoolId, status: { in: ["OPEN", "CLOSED"] } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: { _count: { select: { applications: true } } },
  });

  const items = rows.map((job) => ({
    id: job.id,
    reference: job.reference,
    title: job.title,
    category: job.category,
    description: job.description,
    qualification: job.qualification,
    salaryRange: job.salaryRange,
    location: job.location,
    minExperience: job.minExperience,
    vacancies: job.vacancies,
    cvRequired: job.cvRequired,
    status: job.status,
    closingDate: job.closingDate ? job.closingDate.toISOString() : null,
    publishedAt: job.publishedAt ? job.publishedAt.toISOString() : null,
    applications: job._count.applications,
    // An open post past its closing date is still accepting applications it
    // will not honour, and only a human can decide to close or extend it.
    lapsed:
      job.status === "OPEN" && job.closingDate !== null && job.closingDate < now,
    canManage,
  }));

  return cors(
    NextResponse.json({
      title: "Careers",
      canManage,
      items,
      counts: {
        open: items.filter((item) => item.status === "OPEN").length,
        drafts: items.filter((item) => item.status === "DRAFT").length,
        lapsed: items.filter((item) => item.lapsed).length,
        applications: items.reduce((total, item) => total + item.applications, 0),
      },
    }),
  );
}

/**
 * A field the app left blank arrives as `""` (or `null`) rather than missing.
 * For the optional numbers that is "not stated", not zero — an empty experience
 * box coerced to 0 would advertise "0+ yrs" instead of "freshers may apply".
 */
const blankToNull = (value: unknown) => (value === "" ? null : value);

const CreateSchema = z.object({
  title: z.string().trim().min(1, "Give the post a title").max(160),
  category: z.string().trim().min(1, "Choose a category").max(60),
  description: z.string().trim().max(4000).nullish(),
  responsibilities: z.string().trim().max(4000).nullish(),
  location: z.string().trim().max(120).nullish(),
  qualification: z.string().trim().max(200).nullish(),
  salaryRange: z.string().trim().max(80).nullish(),
  minExperience: z.preprocess(
    blankToNull,
    z.coerce.number().int().min(0, "Enter a number of years, or leave it out").nullish(),
  ),
  vacancies: z.preprocess(
    blankToNull,
    z.coerce.number().int().min(1, "At least one vacancy").nullish(),
  ),
  cvRequired: z.boolean().nullish(),
  closingDate: z.preprocess(
    blankToNull,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date").nullish(),
  ),
  publishNow: z.boolean().nullish(),
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

/**
 * POST /api/mobile/v1/admin/careers
 *
 * Mobile mirror of the web `createJobPosting` action: publish straight away or
 * keep the post as a draft.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "careers.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(
      NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      ),
    );
  }
  const input = parsed.data;
  const publishNow = input.publishNow === true;

  let closingDate: Date | null = null;
  if (input.closingDate) {
    // The date is the last day applications are accepted, so it runs to the end
    // of that day — in UTC, because a local midnight lands on the previous day
    // for anyone east of UTC.
    closingDate = new Date(`${input.closingDate}T23:59:59.999Z`);
    if (Number.isNaN(closingDate.getTime())) {
      return cors(
        NextResponse.json({ error: "That closing date could not be read." }, { status: 400 }),
      );
    }
    // Publishing a post that has already closed would show applicants a form
    // they cannot submit.
    if (publishNow && closingDate < new Date()) {
      return cors(
        NextResponse.json(
          { error: "A published post must close in the future." },
          { status: 400 },
        ),
      );
    }
  }

  const db = scopedDb(session.schoolId);

  // Collisions are vanishingly unlikely but the reference is unique per school,
  // so retry rather than fail the whole submission on one unlucky draw.
  let created: { id: string; reference: string } | null = null;
  for (let attempt = 0; attempt < 5 && created === null; attempt += 1) {
    const reference = buildReference();
    const clash = await db.jobPosting.findFirst({
      where: { schoolId: session.schoolId, reference },
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
        minExperience: input.minExperience ?? null,
        vacancies: input.vacancies ?? 1,
        // The web checkbox ships checked, as does the column default.
        cvRequired: input.cvRequired ?? true,
        status: publishNow ? "OPEN" : "DRAFT",
        publishedAt: publishNow ? new Date() : null,
        closingDate,
        createdById: session.userId,
      },
      select: { id: true, reference: true },
    });
  }

  if (!created) {
    return cors(
      NextResponse.json(
        { error: "Could not allocate a reference. Please try again." },
        { status: 409 },
      ),
    );
  }

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "careers.create",
    entityType: "JobPosting",
    entityId: created.id,
    after: { reference: created.reference, title: input.title, via: "mobile" },
  });

  return cors(
    NextResponse.json({
      ok: true,
      id: created.id,
      reference: created.reference,
      message: publishNow
        ? `Published as ${created.reference}.`
        : `Saved as a draft (${created.reference}).`,
    }),
  );
}
