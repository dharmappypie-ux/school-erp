import { NextResponse } from "next/server";
import { z } from "zod";

import { enrolApplicant } from "@/lib/admissions-enrol";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  applicationId: z.string().min(1),
  sectionId: z.string().min(1, "Choose a section"),
});

/**
 * POST /api/mobile/v1/admin/admissions/enrol
 *
 * Enrols an ACCEPTED applicant into a section — creates the student + guardian
 * logins and the active enrollment, marks the application ENROLLED. Mirror of
 * the web `enrolApplicant`, via the shared lib so the two stay identical.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "admissions.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  if (!session.academicYearId) {
    return cors(NextResponse.json({ error: "No academic year is marked current." }, { status: 409 }));
  }

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const school = await db.school.findUnique({
    where: { id: session.schoolId },
    select: { name: true, slug: true },
  });
  if (!school) return cors(NextResponse.json({ error: "School not found." }, { status: 404 }));

  const result = await enrolApplicant({
    db,
    schoolId: session.schoolId,
    schoolName: school.name,
    schoolSlug: school.slug,
    academicYearId: session.academicYearId,
    actorUserId: session.userId,
    applicationId: parsed.data.applicationId,
    sectionId: parsed.data.sectionId,
    plan: session.plan,
  });

  return cors(NextResponse.json(result, { status: result.ok ? 200 : 400 }));
}
