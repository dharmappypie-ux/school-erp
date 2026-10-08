import { NextResponse } from "next/server";
import { z } from "zod";

import { canTransition, STATUS_LABEL } from "@/lib/admissions";
import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  applicationId: z.string().min(1),
  toStatus: z.enum([
    "DRAFT", "SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "TEST_SCHEDULED",
    "INTERVIEW_SCHEDULED", "OFFERED", "ACCEPTED", "REJECTED", "WITHDRAWN", "ENROLLED",
  ]),
  note: z.string().trim().max(500).optional(),
});

/** POST /api/mobile/v1/admin/admissions/move — advance an application's stage. */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "admissions.manage");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { applicationId, toStatus, note } = parsed.data;

  const db = scopedDb(session.schoolId);
  const application = await db.admissionApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, status: true, firstName: true, applicationNo: true },
  });
  if (!application) return cors(NextResponse.json({ error: "Application not found in your school." }, { status: 404 }));

  if (!canTransition(application.status, toStatus)) {
    return cors(NextResponse.json(
      { error: `Cannot move from ${STATUS_LABEL[application.status]} to ${STATUS_LABEL[toStatus]}.` },
      { status: 409 },
    ));
  }

  const decided = ["OFFERED", "ACCEPTED", "REJECTED", "WITHDRAWN", "ENROLLED"].includes(toStatus);
  await db.$transaction([
    db.admissionApplication.update({
      where: { id: applicationId },
      data: {
        status: toStatus,
        ...(decided ? { decisionDate: new Date(), decisionBy: session.userId } : {}),
        ...(toStatus === "REJECTED" && note ? { rejectionReason: note } : {}),
      },
    }),
    db.admissionEvent.create({
      data: { applicationId, fromStatus: application.status, toStatus, note: note || null, actorId: session.userId },
    }),
  ]);

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "admissions.move", entityType: "AdmissionApplication", entityId: applicationId,
    before: { status: application.status }, after: { status: toStatus, via: "mobile" },
  });

  return cors(NextResponse.json({ ok: true, message: `${application.applicationNo} moved to ${STATUS_LABEL[toStatus]}.` }));
}
