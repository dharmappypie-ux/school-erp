import { NextResponse } from "next/server";
import { z } from "zod";

import { cors, resolveMobileSession, passwordChangeRequired }
  from "@/lib/mobile-auth";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({ requestId: z.string().min(1, "Missing the request") });

/**
 * POST /api/mobile/v1/parent/leave/cancel
 *
 * Withdraws a request that has not been decided yet. Scoped to the child this
 * account speaks for, so a crafted id cannot withdraw another family's request.
 */
export async function POST(req: Request) {
  const session = await resolveMobileSession(req);
  if (!session) {
  return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }
  // A temporary password blocks the API, exactly as it blocks the web app.
  if (session.mustChangePassword) return passwordChangeRequired();

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: "Invalid input" }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);

  let studentId = session.studentId;
  if (!studentId && session.guardianId) {
    const link = await db.studentGuardian.findFirst({
      where: { guardianId: session.guardianId },
      orderBy: { isPrimary: "desc" },
      select: { studentId: true },
    });
    studentId = link?.studentId ?? null;
  }
  if (!studentId) {
    return cors(NextResponse.json({ error: "No student is linked to this account." }, { status: 400 }));
  }

  const request = await db.studentLeaveRequest.findFirst({
    where: { id: parsed.data.requestId, studentId, status: "PENDING" },
    select: { id: true },
  });
  if (!request) {
    return cors(
      NextResponse.json(
        { error: "That request cannot be withdrawn — it may already have been decided." },
        { status: 409 },
      ),
    );
  }

  await db.studentLeaveRequest.update({
    where: { id: request.id },
    data: { status: "CANCELLED", decidedAt: new Date() },
  });

  return cors(NextResponse.json({ ok: true, message: "Request withdrawn." }));
}
