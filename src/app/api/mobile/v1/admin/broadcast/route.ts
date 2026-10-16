import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import {
  resolveAudience,
  type AudienceKey,
  type Candidate,
  type Channel,
} from "@/lib/broadcast";
import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/notifications";
import { cors, requireMobile } from "@/lib/mobile-auth";
import { scopedDb, type ScopedDb } from "@/lib/tenant";

export { OPTIONS } from "@/lib/mobile-auth";

const Schema = z.object({
  audience: z.enum(["ALL_PARENTS", "ALL_STUDENTS", "ALL_STAFF", "TEACHING_STAFF", "SECTION_PARENTS", "FEE_DEFAULTERS"]),
  channel: z.enum(["EMAIL", "SMS", "WHATSAPP", "IN_APP"]),
  sectionId: z.string().optional(),
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1, "Write a message").max(2000),
});

/** Who to reach for each audience (copied from the web action's gatherCandidates). */
async function gatherCandidates(
  db: ScopedDb,
  audience: AudienceKey,
  options: { schoolId: string; academicYearId?: string | null; sectionId?: string },
): Promise<Candidate[]> {
  const { schoolId, academicYearId, sectionId } = options;

  if (audience === "ALL_STAFF" || audience === "TEACHING_STAFF") {
    const staff = await db.staffMember.findMany({
      where: { employmentStatus: "ACTIVE", deletedAt: null, ...(audience === "TEACHING_STAFF" ? { staffType: "TEACHING" } : {}) },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, user: { select: { id: true } } },
    });
    return staff.map((m) => ({
      id: m.id, name: `${m.firstName} ${m.lastName ?? ""}`.trim(), email: m.email, phone: m.phone,
      userId: m.user?.id ?? null, variables: { name: m.firstName },
    }));
  }

  if (audience === "ALL_STUDENTS") {
    const students = await db.student.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, user: { select: { id: true } } },
    });
    return students.map((s) => ({
      id: s.id, name: `${s.firstName} ${s.lastName ?? ""}`.trim(), email: s.email, phone: s.phone,
      userId: s.user?.id ?? null, variables: { name: s.firstName, studentName: s.firstName },
    }));
  }

  const links = await db.studentGuardian.findMany({
    where: {
      student: {
        schoolId, status: "ACTIVE", deletedAt: null,
        ...(audience === "SECTION_PARENTS" && sectionId
          ? { enrollments: { some: { sectionId, isActive: true, ...(academicYearId ? { academicYearId } : {}) } } }
          : {}),
        ...(audience === "FEE_DEFAULTERS" ? { invoices: { some: { amountDue: { gt: 0 } } } } : {}),
      },
    },
    select: {
      guardian: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, user: { select: { id: true } } } },
      student: { select: { firstName: true } },
    },
  });
  return links.map((l) => ({
    id: l.guardian.id, name: `${l.guardian.firstName} ${l.guardian.lastName ?? ""}`.trim(),
    email: l.guardian.email, phone: l.guardian.phone, userId: l.guardian.user?.id ?? null,
    variables: { name: l.guardian.firstName, guardianName: l.guardian.firstName, studentName: l.student.firstName },
  }));
}

/**
 * POST /api/mobile/v1/admin/broadcast — send a message to an audience on a
 * channel, mirroring the web `sendBroadcast`.
 */
export async function POST(req: Request) {
  const guard = await requireMobile(req, "notifications.send", { feature: "broadcasts" });
  if (guard instanceof NextResponse) return guard;
  const session = guard;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 }));
  }
  const { audience, channel, sectionId, subject, body } = parsed.data;
  if (audience === "SECTION_PARENTS" && !sectionId) {
    return cors(NextResponse.json({ error: "Choose a class for this audience." }, { status: 400 }));
  }

  const db = scopedDb(session.schoolId);
  const candidates = await gatherCandidates(db, audience as AudienceKey, {
    schoolId: session.schoolId, academicYearId: session.academicYearId, sectionId,
  });
  const resolution = resolveAudience(candidates, channel as Channel);
  if (resolution.recipients.length === 0) {
    return cors(NextResponse.json({ error: "Nobody in this audience can be reached on that channel." }, { status: 400 }));
  }

  const school = await prisma.school.findUnique({ where: { id: session.schoolId }, select: { name: true } });
  const result = await broadcast({
    schoolId: session.schoolId,
    channel: channel as Channel,
    subject,
    body,
    variables: { schoolName: school?.name ?? session.schoolName },
    recipients: resolution.recipients.map((r) => ({ recipient: r.destination, userId: r.userId, variables: r.variables })),
  });

  await recordAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: "notifications.broadcast", entityType: "NotificationLog", entityId: result.batchId,
    after: { audience, channel, queued: result.queued, via: "mobile" },
  });

  const notes: string[] = [];
  if (resolution.unreachable.length > 0) notes.push(`${resolution.unreachable.length} unreachable`);
  if (resolution.duplicatesCollapsed > 0) notes.push(`${resolution.duplicatesCollapsed} duplicates collapsed`);
  const tail = notes.length ? ` (${notes.join(", ")})` : "";
  return cors(NextResponse.json({
    ok: true,
    message: result.delivered === 0
      ? `Queued ${result.queued} message(s) on ${channel}${tail}. No provider configured, so they're recorded, not sent.`
      : `Sent to ${result.queued} recipient(s) on ${channel}${tail}.`,
  }));
}
