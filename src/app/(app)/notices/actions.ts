"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { scopedDb } from "@/lib/tenant";

export interface NoticeState {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

const AUDIENCE_OPTIONS = ["ALL", "PARENTS", "STUDENTS", "STAFF"] as const;

const NoticeSchema = z.object({
  title: z.string().trim().min(1, "A title is required").max(200),
  body: z.string().trim().min(1, "Write the notice").max(4000),
  audience: z.string().trim().min(1, "Choose at least one audience"),
  sectionId: z.string().trim().optional(),
  isPinned: z.string().optional(),
  publishNow: z.string().optional(),
  expiresAt: z.string().trim().optional(),
});

/**
 * Creates a notice.
 *
 * A notice is only visible once `publishedAt` is set. Saving without
 * publishing leaves it as a draft the office can revise — a notice sent to
 * every parent cannot be unsent, so publishing is an explicit choice rather
 * than a side effect of saving.
 */
export async function createNotice(
  _previous: NoticeState,
  formData: FormData,
): Promise<NoticeState> {
  const raw = Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, String(value)]),
  );

  const parsed = NoticeSchema.safeParse(raw);
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

  const session = await requirePermission("notices.manage");
  const db = scopedDb(session.schoolId);
  const input = parsed.data;

  const audience = input.audience
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => (AUDIENCE_OPTIONS as readonly string[]).includes(value));

  if (audience.length === 0) {
    return {
      ok: false,
      message: "Choose at least one audience.",
      fieldErrors: { audience: "Required" },
      values: raw,
    };
  }

  // A section-specific notice must actually name a section, or it would
  // silently reach nobody.
  const sectionId = input.sectionId || null;
  if (sectionId) {
    const section = await db.section.findUnique({
      where: { id: sectionId },
      select: { id: true },
    });
    if (!section) {
      return { ok: false, message: "That class does not exist.", values: raw };
    }
  }

  const publishNow = input.publishNow === "on" || input.publishNow === "true";

  const notice = await db.notice.create({
    data: {
      schoolId: session.schoolId,
      title: input.title,
      body: input.body,
      audience,
      sectionId,
      authorId: session.userId,
      isPinned: input.isPinned === "on" || input.isPinned === "true",
      publishedAt: publishNow ? new Date() : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
    select: { id: true },
  });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: publishNow ? "notices.publish" : "notices.draft",
    entityType: "Notice",
    entityId: notice.id,
    after: { title: input.title, audience, sectionId, published: publishNow },
  });

  revalidatePath("/notices");
  revalidatePath("/dashboard");
  revalidatePath("/portal");

  return {
    ok: true,
    message: publishNow
      ? "Notice published — it is now visible to the chosen audience."
      : "Saved as a draft. It is not visible until you publish it.",
  };
}

const ToggleSchema = z.object({
  noticeId: z.string().min(1),
  action: z.enum(["PUBLISH", "UNPUBLISH", "PIN", "UNPIN"]),
});

export async function updateNotice(
  input: z.infer<typeof ToggleSchema>,
): Promise<{ ok: boolean; message: string }> {
  const parsed = ToggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };

  const session = await requirePermission("notices.manage");
  const db = scopedDb(session.schoolId);
  const { noticeId, action } = parsed.data;

  const notice = await db.notice.findUnique({
    where: { id: noticeId },
    select: { id: true, title: true, publishedAt: true, isPinned: true },
  });
  if (!notice) return { ok: false, message: "Notice not found in your school." };

  const data =
    action === "PUBLISH"
      ? { publishedAt: new Date() }
      : action === "UNPUBLISH"
        ? { publishedAt: null }
        : { isPinned: action === "PIN" };

  await db.notice.update({ where: { id: noticeId }, data });

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: `notices.${action.toLowerCase()}`,
    entityType: "Notice",
    entityId: noticeId,
    after: { title: notice.title },
  });

  revalidatePath("/notices");
  revalidatePath("/dashboard");
  revalidatePath("/portal");

  const messages: Record<string, string> = {
    PUBLISH: "Notice published.",
    UNPUBLISH: "Notice withdrawn — it is no longer visible.",
    PIN: "Notice pinned to the top.",
    UNPIN: "Notice unpinned.",
  };
  return { ok: true, message: messages[action] };
}
