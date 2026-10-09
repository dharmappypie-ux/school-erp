import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { hasPermission } from "@/lib/permissions";
import { scopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

/**
 * `BehaviourLog` is absent from TENANT_MODELS in src/lib/tenant.ts, so the
 * scoped client passes its queries straight through — unfiltered. Every
 * behaviour query in this folder therefore carries `schoolId` by hand, or the
 * endpoint would hand one school's ledger to another. The clause stays correct
 * once the model is registered: the extension ANDs its own onto it.
 */

const KINDS = ["APPRECIATION", "CONCERN", "NEUTRAL"] as const;
const SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const;

const CreateSchema = z.object({
  studentId: z.string().trim().min(1, "Choose a student"),
  kind: z.enum(KINDS, { message: "Choose the kind of note" }),
  severity: z.enum(SEVERITIES).optional(),
  category: z.string().trim().max(60).optional(),
  summary: z.string().trim().min(1, "Write a one-line summary").max(200),
  detail: z.string().trim().max(2000).optional(),
  occurredOn: z.string().trim().min(1, "When did this happen?"),
});

/**
 * GET /api/mobile/v1/admin/behaviour
 *
 * The behaviour ledger, newest first — the last 100 notes, the same window the
 * web page shows. Retracted notes are returned rather than hidden: the record
 * stays honest, and the client strikes them through.
 */
export async function GET(req: Request) {
  const guard = await requireMobile(req, "behaviour.read");
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const db = scopedDb(session.schoolId);
  const canManage = hasPermission(session.permissions, "behaviour.manage");

  const rows = await db.behaviourLog.findMany({
    where: { schoolId: session.schoolId },
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      kind: true,
      severity: true,
      category: true,
      summary: true,
      detail: true,
      occurredOn: true,
      guardianNotifiedAt: true,
      retractedAt: true,
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          enrollments: {
            where: { isActive: true },
            take: 1,
            select: {
              section: {
                select: { name: true, classLevel: { select: { name: true } } },
              },
            },
          },
        },
      },
      recordedBy: { select: { firstName: true, lastName: true } },
    },
  });

  const items = rows.map((row) => {
    const section = row.student.enrollments[0]?.section;
    return {
      id: row.id,
      studentId: row.student.id,
      studentName: `${row.student.firstName} ${row.student.lastName ?? ""}`.trim(),
      admissionNo: row.student.admissionNo,
      className: section ? `${section.classLevel.name} ${section.name}` : "",
      kind: row.kind,
      severity: row.severity,
      category: row.category,
      summary: row.summary,
      detail: row.detail,
      occurredOn: row.occurredOn.toISOString(),
      recordedBy: row.recordedBy
        ? `${row.recordedBy.firstName} ${row.recordedBy.lastName ?? ""}`.trim()
        : null,
      guardianNotified: row.guardianNotifiedAt !== null,
      guardianNotifiedAt: row.guardianNotifiedAt?.toISOString() ?? null,
      retracted: row.retractedAt !== null,
      canAct: canManage && row.retractedAt === null,
    };
  });

  // A retracted note has been withdrawn, so it counts for nothing. Only a
  // medium or high concern joins the follow-up queue — a low one does not
  // warrant a call home, which is the rule the web stat tiles use.
  const live = items.filter((item) => !item.retracted);
  const concerns = live.filter((item) => item.kind === "CONCERN");

  return cors(
    NextResponse.json({
      title: "Behaviour",
      items,
      counts: {
        appreciations: live.filter((item) => item.kind === "APPRECIATION").length,
        concerns: concerns.length,
        awaitingGuardian: concerns.filter(
          (item) => item.severity !== "LOW" && !item.guardianNotified,
        ).length,
      },
    }),
  );
}

/**
 * POST /api/mobile/v1/admin/behaviour — record a note.
 *
 * Mirrors the web `createBehaviourLog` action, rules and all.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "behaviour.manage");
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

  // UTC midnight, matching every other date-only column here. Local midnight
  // would land on the previous day once Postgres casts it to `date` for anyone
  // east of UTC.
  const occurredOn = new Date(`${input.occurredOn}T00:00:00.000Z`);
  if (Number.isNaN(occurredOn.getTime())) {
    return cors(
      NextResponse.json({ error: "That date could not be read." }, { status: 400 }),
    );
  }

  // "Future" is judged with a day's grace rather than against UTC midnight.
  // A school in IST picking today's date between 00:00 and 05:30 local is still
  // on yesterday in UTC, so a strict UTC comparison rejects a perfectly ordinary
  // note. One day of slack covers every timezone offset (max +14) while still
  // catching the mistyped year this guard exists for.
  const now = new Date();
  const latestAllowed = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  if (occurredOn > latestAllowed) {
    return cors(
      NextResponse.json(
        { error: "A note cannot be dated in the future." },
        { status: 400 },
      ),
    );
  }

  const db = scopedDb(session.schoolId);
  const student = await db.student.findFirst({
    where: { id: input.studentId, deletedAt: null },
    select: { id: true },
  });
  if (!student) {
    return cors(
      NextResponse.json(
        { error: "That student is no longer on the roll." },
        { status: 404 },
      ),
    );
  }

  // The note belongs to the staff member who observed it. When the signed-in
  // user is not a staff member (an office account), it is left unattributed
  // rather than credited to the wrong person.
  const staff = await db.staffMember.findFirst({
    where: { userId: session.userId, deletedAt: null },
    select: { id: true },
  });

  const log = await db.behaviourLog.create({
    data: {
      schoolId: session.schoolId,
      studentId: student.id,
      kind: input.kind,
      // Praise has no severity; storing anything but LOW against it would make
      // the school-wide "high severity" count meaningless.
      severity: input.kind === "CONCERN" ? (input.severity ?? "LOW") : "LOW",
      category: input.category || null,
      summary: input.summary,
      detail: input.detail || null,
      occurredOn,
      recordedById: staff?.id ?? null,
      enteredById: session.userId,
    },
    select: { id: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "behaviour.create",
    entityType: "BehaviourLog",
    entityId: log.id,
    after: {
      studentId: student.id,
      kind: input.kind,
      summary: input.summary,
      via: "mobile",
    },
  });

  return cors(NextResponse.json({ ok: true, id: log.id, message: "Note recorded." }));
}
