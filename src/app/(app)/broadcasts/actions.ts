"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  measureMessage,
  resolveAudience,
  type AudienceKey,
  type Candidate,
  type Channel,
} from "@/lib/broadcast";
import { broadcast } from "@/lib/notifications";
import { scopedDb, type ScopedDb } from "@/lib/tenant";

export interface AudiencePreview {
  ok: boolean;
  message: string;
  reachable: number;
  unreachable: number;
  duplicatesCollapsed: number;
  /** SMS segments per recipient, and the total across the audience. */
  segments: number;
  totalSegments: number;
  encoding: string;
  sampleUnreachable: string[];
}

export interface SendResult {
  ok: boolean;
  message: string;
  batchId?: string;
}

const AUDIENCE_KEYS = [
  "ALL_PARENTS", "ALL_STUDENTS", "ALL_STAFF",
  "TEACHING_STAFF", "SECTION_PARENTS", "FEE_DEFAULTERS",
] as const;

const CHANNELS = ["EMAIL", "SMS", "WHATSAPP", "IN_APP"] as const;

const ComposeSchema = z.object({
  audience: z.enum(AUDIENCE_KEYS),
  channel: z.enum(CHANNELS),
  sectionId: z.string().optional(),
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1, "Write a message").max(2000),
});

/**
 * Gathers the candidate list for an audience.
 *
 * Guardians are returned once per child by the query, which is exactly why
 * `resolveAudience` collapses by identity afterwards — a parent with three
 * children must not be messaged three times.
 */
async function gatherCandidates(
  db: ScopedDb,
  audience: AudienceKey,
  options: { schoolId: string; academicYearId?: string; sectionId?: string },
): Promise<Candidate[]> {
  const { schoolId, academicYearId, sectionId } = options;

  if (audience === "ALL_STAFF" || audience === "TEACHING_STAFF") {
    const staff = await db.staffMember.findMany({
      where: {
        employmentStatus: "ACTIVE",
        deletedAt: null,
        ...(audience === "TEACHING_STAFF" ? { staffType: "TEACHING" } : {}),
      },
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true,
        user: { select: { id: true } },
      },
    });
    return staff.map((member) => ({
      id: member.id,
      name: `${member.firstName} ${member.lastName ?? ""}`.trim(),
      email: member.email,
      phone: member.phone,
      userId: member.user?.id ?? null,
      variables: { name: member.firstName },
    }));
  }

  if (audience === "ALL_STUDENTS") {
    const students = await db.student.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true,
        user: { select: { id: true } },
      },
    });
    return students.map((student) => ({
      id: student.id,
      name: `${student.firstName} ${student.lastName ?? ""}`.trim(),
      email: student.email,
      phone: student.phone,
      userId: student.user?.id ?? null,
      variables: { name: student.firstName, studentName: student.firstName },
    }));
  }

  // tenant-safe: the student filter below names schoolId explicitly.
  // The remaining audiences are all guardian-based.
  //
  // StudentGuardian is a join table with no `schoolId`, so the tenant
  // extension does not scope it — the filter must reach the tenant through
  // the student relation explicitly. Without `schoolId` here this query
  // returns every school's guardians.
  //
  // tenant-safe: the student filter below names schoolId explicitly.
  const links = await db.studentGuardian.findMany({
    where: {
      student: {
        schoolId,
        status: "ACTIVE",
        deletedAt: null,
        ...(audience === "SECTION_PARENTS" && sectionId
          ? {
              enrollments: {
                some: {
                  sectionId,
                  isActive: true,
                  ...(academicYearId ? { academicYearId } : {}),
                },
              },
            }
          : {}),
        ...(audience === "FEE_DEFAULTERS"
          ? { invoices: { some: { amountDue: { gt: 0 } } } }
          : {}),
      },
    },
    select: {
      guardian: {
        select: {
          id: true, firstName: true, lastName: true, email: true, phone: true,
          user: { select: { id: true } },
        },
      },
      student: { select: { firstName: true } },
    },
  });

  return links.map((link) => ({
    id: link.guardian.id,
    name: `${link.guardian.firstName} ${link.guardian.lastName ?? ""}`.trim(),
    email: link.guardian.email,
    phone: link.guardian.phone,
    userId: link.guardian.user?.id ?? null,
    variables: {
      name: link.guardian.firstName,
      guardianName: link.guardian.firstName,
      studentName: link.student.firstName,
    },
  }));
}

/** Resolves the audience without sending, so the composer can show the truth. */
export async function previewBroadcast(
  input: z.infer<typeof ComposeSchema>,
): Promise<AudiencePreview> {
  const empty = {
    reachable: 0, unreachable: 0, duplicatesCollapsed: 0,
    segments: 0, totalSegments: 0, encoding: "GSM7", sampleUnreachable: [],
  };

  const parsed = ComposeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input", ...empty };
  }

  const session = await requirePermission("notifications.send");
  const db = scopedDb(session.schoolId);
  const { audience, channel, sectionId, body } = parsed.data;

  if (audience === "SECTION_PARENTS" && !sectionId) {
    return { ok: false, message: "Choose a class for this audience.", ...empty };
  }

  const candidates = await gatherCandidates(db, audience, {
    schoolId: session.schoolId,
    academicYearId: session.academicYear?.id,
    sectionId,
  });
  const resolution = resolveAudience(candidates, channel as Channel);
  const size = measureMessage(body, channel as Channel);

  return {
    ok: resolution.recipients.length > 0,
    message:
      resolution.recipients.length === 0
        ? "Nobody in this audience can be reached on that channel."
        : `${resolution.recipients.length} recipients will receive this.`,
    reachable: resolution.recipients.length,
    unreachable: resolution.unreachable.length,
    duplicatesCollapsed: resolution.duplicatesCollapsed,
    segments: size.segments,
    totalSegments: size.segments * resolution.recipients.length,
    encoding: size.encoding,
    sampleUnreachable: resolution.unreachable
      .slice(0, 5)
      .map((entry) => `${entry.candidate.name} — ${entry.reason}`),
  };
}

/**
 * Sends a broadcast.
 *
 * Every message is persisted before dispatch and grouped under one batch id,
 * so the delivery log always reflects what was attempted even if the provider
 * fails midway.
 */
export async function sendBroadcast(
  input: z.infer<typeof ComposeSchema>,
): Promise<SendResult> {
  const parsed = ComposeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const session = await requirePermission("notifications.send");
  const db = scopedDb(session.schoolId);
  const { audience, channel, sectionId, subject, body } = parsed.data;

  if (audience === "SECTION_PARENTS" && !sectionId) {
    return { ok: false, message: "Choose a class for this audience." };
  }

  const candidates = await gatherCandidates(db, audience, {
    schoolId: session.schoolId,
    academicYearId: session.academicYear?.id,
    sectionId,
  });
  const resolution = resolveAudience(candidates, channel as Channel);

  if (resolution.recipients.length === 0) {
    return {
      ok: false,
      message: "Nobody in this audience can be reached on that channel. Nothing was sent.",
    };
  }

  const result = await broadcast({
    schoolId: session.schoolId,
    channel: channel as Channel,
    subject,
    body,
    variables: { schoolName: session.school.name },
    recipients: resolution.recipients.map((recipient) => ({
      recipient: recipient.destination,
      userId: recipient.userId,
      variables: recipient.variables,
    })),
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "notifications.broadcast",
    entityType: "NotificationLog",
    entityId: result.batchId,
    after: {
      audience,
      channel,
      queued: result.queued,
      delivered: result.delivered,
      unreachable: resolution.unreachable.length,
    },
  });

  revalidatePath("/broadcasts");

  const notes: string[] = [];
  if (resolution.unreachable.length > 0) {
    notes.push(`${resolution.unreachable.length} had no ${channel === "EMAIL" ? "email" : "contact"} on record`);
  }
  if (resolution.duplicatesCollapsed > 0) {
    notes.push(`${resolution.duplicatesCollapsed} duplicates collapsed`);
  }
  // With no provider credentials the engine records messages without
  // transmitting them, and must not claim otherwise.
  if (result.delivered === 0) {
    notes.push("no provider is configured, so messages were logged rather than transmitted");
  }

  return {
    ok: true,
    batchId: result.batchId,
    message: `Queued ${result.queued} messages${notes.length ? ` — ${notes.join("; ")}` : ""}.`,
  };
}
