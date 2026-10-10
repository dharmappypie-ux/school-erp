import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  requestId: z.string().min(1, "Missing the request"),
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(300).optional(),
});

/**
 * POST /api/mobile/v1/admin/student-leave/decide
 *
 * Mirrors the web `decideStudentLeave` action, including its two rules: only a
 * PENDING request can be decided, and a rejection must carry a reason — a "no"
 * with no explanation leaves the family nothing to act on.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "studentleave.approve");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(
      NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      ),
    );
  }
  const { requestId, decision, note } = parsed.data;

  if (decision === "REJECTED" && !note) {
    return cors(
      NextResponse.json({ error: "Give a reason when rejecting a request." }, { status: 400 }),
    );
  }

  const db = scopedDb(session.schoolId);
  const request = await db.studentLeaveRequest.findFirst({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      student: { select: { firstName: true, lastName: true } },
    },
  });

  if (!request) {
    return cors(NextResponse.json({ error: "Request not found in your school." }, { status: 404 }));
  }
  if (request.status !== "PENDING") {
    return cors(
      NextResponse.json(
        { error: `That request was already ${request.status.toLowerCase()}.` },
        { status: 409 },
      ),
    );
  }

  await db.studentLeaveRequest.update({
    where: { id: request.id },
    data: {
      status: decision,
      decidedById: session.userId,
      decidedAt: new Date(),
      decisionNote: note || null,
    },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "studentleave.decide",
    entityType: "StudentLeaveRequest",
    entityId: request.id,
    before: { status: request.status },
    after: { status: decision, note, via: "mobile" },
  });

  const name = `${request.student.firstName} ${request.student.lastName ?? ""}`.trim();
  return cors(
    NextResponse.json({
      ok: true,
      message:
        decision === "APPROVED"
          ? `Leave approved for ${name}.`
          : `Leave rejected for ${name}.`,
    }),
  );
}
