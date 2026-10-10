import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, resolveMobileSession } from "@/lib/mobile-auth";
import {
  countLeaveDays,
  formatLeaveSpan,
  PORTION_SHORT,
  validateLeave,
  type LeavePortion,
} from "@/lib/student-leave";
import { scopedDb, type ScopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * Resolves the child this account speaks for.
 *
 * Mirrors the snapshot endpoint's rule: a student account is its own child, a
 * guardian account takes their primary link. The client never sends a studentId
 * — a guardian must not be able to request leave for somebody else's child by
 * editing the request body.
 */
async function resolveChild(
  db: ScopedDb,
  studentId: string | null,
  guardianId: string | null,
): Promise<string | null> {
  if (studentId) return studentId;
  if (!guardianId) return null;
  const link = await db.studentGuardian.findFirst({
    where: { guardianId },
    orderBy: { isPrimary: "desc" },
    select: { studentId: true },
  });
  return link?.studentId ?? null;
}

/** GET — this child's leave requests, newest first. */
export async function GET(req: Request) {
  const session = await resolveMobileSession(req);
  if (!session) {
    return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  const db = scopedDb(session.schoolId);
  const studentId = await resolveChild(db, session.studentId, session.guardianId);
  if (!studentId) {
    return cors(NextResponse.json({ title: "Leave", items: [], note: "No student is linked to this account." }));
  }

  const rows = await db.studentLeaveRequest.findMany({
    where: { studentId },
    orderBy: [{ fromDate: "desc" }],
    take: 40,
    select: {
      id: true,
      fromDate: true,
      toDate: true,
      portion: true,
      leavingAfterPeriod: true,
      reason: true,
      status: true,
      decisionNote: true,
      createdAt: true,
    },
  });

  return cors(
    NextResponse.json({
      title: "Leave",
      items: rows.map((row) => ({
        id: row.id,
        span: formatLeaveSpan(row.fromDate, row.toDate, row.portion as LeavePortion),
        days: countLeaveDays(row.fromDate, row.toDate, row.portion as LeavePortion),
        portion: row.portion,
        portionLabel: PORTION_SHORT[row.portion as LeavePortion],
        leavingAfterPeriod: row.leavingAfterPeriod,
        reason: row.reason,
        status: row.status,
        decisionNote: row.decisionNote,
        canWithdraw: row.status === "PENDING",
        askedOn: row.createdAt.toISOString(),
      })),
    }),
  );
}

const ApplySchema = z.object({
  fromDate: z.string().min(1),
  toDate: z.string().min(1),
  portion: z.enum(["FULL_DAY", "FIRST_HALF", "SECOND_HALF"]).default("FULL_DAY"),
  reason: z.string().trim().min(1),
  leavingAfterPeriod: z.union([z.number(), z.string()]).optional(),
});

/** POST — raise a leave request for this child. */
export async function POST(req: Request) {
  const session = await resolveMobileSession(req);
  if (!session) {
    return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  const parsed = ApplySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(
      NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      ),
    );
  }

  const db = scopedDb(session.schoolId);
  const studentId = await resolveChild(db, session.studentId, session.guardianId);
  if (!studentId) {
    return cors(NextResponse.json({ error: "No student is linked to this account." }, { status: 400 }));
  }

  const input = parsed.data;
  const check = validateLeave(
    {
      fromDate: input.fromDate,
      toDate: input.toDate,
      portion: input.portion,
      reason: input.reason,
      leavingAfterPeriod:
        input.leavingAfterPeriod === undefined ? "" : String(input.leavingAfterPeriod),
    },
    new Date(),
  );

  if (!check.ok || !check.parsed) {
    const first = Object.values(check.fieldErrors)[0] ?? "Check the dates and reason.";
    return cors(NextResponse.json({ error: first, fieldErrors: check.fieldErrors }, { status: 400 }));
  }

  const { from, to, days, leavingAfterPeriod } = check.parsed;

  // Same guard as the web form: one absence, one request.
  const clash = await db.studentLeaveRequest.findFirst({
    where: {
      studentId,
      status: { in: ["PENDING", "APPROVED"] },
      fromDate: { lte: to },
      toDate: { gte: from },
    },
    select: { status: true },
  });
  if (clash) {
    return cors(
      NextResponse.json(
        {
          error:
            clash.status === "PENDING"
              ? "A request already covers those dates and is awaiting a decision."
              : "Approved leave already covers those dates.",
        },
        { status: 409 },
      ),
    );
  }

  const created = await db.studentLeaveRequest.create({
    data: {
      schoolId: session.schoolId,
      studentId,
      fromDate: from,
      toDate: to,
      portion: input.portion,
      leavingAfterPeriod,
      reason: input.reason.trim(),
      requestedById: session.userId,
      status: "PENDING",
    },
    select: { id: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "studentleave.apply",
    entityType: "StudentLeaveRequest",
    entityId: created.id,
    after: { studentId, days, portion: input.portion, via: "mobile" },
  });

  return cors(
    NextResponse.json({
      ok: true,
      id: created.id,
      message: `Request sent for ${days} ${days === 1 ? "day" : "days"}. The class teacher will respond.`,
    }),
  );
}
