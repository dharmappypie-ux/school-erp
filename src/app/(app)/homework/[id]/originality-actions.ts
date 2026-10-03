"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  ORIGINALITY_SCHEMA,
  ORIGINALITY_SYSTEM_PROMPT,
  flagForPeerSimilarity,
  originalityScore,
  parseAiOpinion,
  peerSimilarities,
  type OriginalityFlag,
} from "@/lib/ai/originality";
import { env } from "@/lib/env";
import { scopedDb } from "@/lib/tenant";

export interface OriginalityResult {
  ok: boolean;
  message: string;
}

/** Cap on AI calls per run, so a huge class cannot rack up unbounded cost. */
const MAX_AI_CALLS = 30;
/** Only ask the model about submissions long enough to judge stylistically. */
const MIN_AI_TEXT_LENGTH = 200;

/**
 * Runs an originality check across every text submission for one assignment.
 *
 * The deterministic pass (word-shingle similarity between submissions) always
 * runs and needs no API key — it catches copying between students. When a key
 * is configured, submissions that look original but are long enough to judge
 * get an AI opinion on whether they read as AI-generated, which upgrades their
 * flag. Results are stored on each submission.
 */
export async function checkOriginality(homeworkId: string): Promise<OriginalityResult> {
  const session = await requirePermission("homework.manage");
  const db = scopedDb(session.schoolId);

  // Homework is tenant-scoped, so this also proves it is ours.
  const homework = await db.homework.findUnique({
    where: { id: homeworkId },
    select: { id: true, title: true },
  });
  if (!homework) return { ok: false, message: "Assignment not found." };

  // tenant-safe: reached through the scoped homework; only text submissions.
  const submissions = await db.homeworkSubmission.findMany({
    where: { homeworkId, content: { not: null } },
    select: {
      id: true,
      content: true,
      student: { select: { firstName: true, lastName: true } },
    },
  });

  const texts = submissions
    .map((s) => ({
      id: s.id,
      name: `${s.student.firstName} ${s.student.lastName ?? ""}`.trim(),
      text: (s.content ?? "").trim(),
    }))
    .filter((s) => s.text.length > 0);

  if (texts.length === 0) {
    return { ok: false, message: "No written submissions to check yet." };
  }

  const peers = peerSimilarities(texts);

  // Optional AI pass, budgeted. Only for submissions that look original so far
  // and are long enough to judge — copying is already caught deterministically.
  const client = env.ai.apiKey ? new Anthropic({ apiKey: env.ai.apiKey }) : null;
  let aiCalls = 0;
  const aiOpinions = new Map<string, { aiGenerated: boolean; confidence: number; rationale: string }>();

  if (client) {
    for (const sub of texts) {
      if (aiCalls >= MAX_AI_CALLS) break;
      const peer = peers.get(sub.id);
      const baseFlag = flagForPeerSimilarity(peer?.best ?? 0);
      if (baseFlag !== "ORIGINAL") continue; // copying already found — save the call
      if (sub.text.length < MIN_AI_TEXT_LENGTH) continue;

      aiCalls += 1;
      try {
        const response = await client.messages.create({
          model: env.ai.model,
          max_tokens: 400,
          system: ORIGINALITY_SYSTEM_PROMPT,
          output_config: {
            format: {
              type: "json_schema",
              schema: ORIGINALITY_SCHEMA as unknown as Record<string, unknown>,
            },
          },
          messages: [
            { role: "user", content: `<submission>\n${sub.text}\n</submission>` },
          ],
        });
        if (response.stop_reason === "refusal") continue;
        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("");
        const opinion = parseAiOpinion(JSON.parse(text));
        if (opinion) aiOpinions.set(sub.id, opinion);
      } catch {
        // A failed call just means no AI opinion for this one; the
        // deterministic result still stands.
      }
    }
  }

  const now = new Date();
  let flaggedCount = 0;

  for (const sub of texts) {
    const peer = peers.get(sub.id);
    const sim = peer?.best ?? 0;
    let flag: OriginalityFlag = flagForPeerSimilarity(sim);
    let score = originalityScore(sim);

    const noteParts: string[] = [];
    if (flag !== "ORIGINAL" && peer?.againstName) {
      noteParts.push(`${Math.round(sim * 100)}% overlap with ${peer.againstName}'s submission.`);
    }

    const opinion = aiOpinions.get(sub.id);
    if (opinion && opinion.aiGenerated && opinion.confidence >= 0.6 && flag === "ORIGINAL") {
      flag = "AI_GENERATED";
      score = Math.min(score, Math.round((1 - opinion.confidence) * 100));
      noteParts.push(`AI check: ${opinion.rationale} (${Math.round(opinion.confidence * 100)}% confidence)`);
    } else if (opinion && !opinion.aiGenerated && flag === "ORIGINAL") {
      noteParts.push("AI check: reads as the student's own writing.");
    }

    if (flag !== "ORIGINAL") flaggedCount += 1;

    // tenant-safe: sub.id came from the scoped submissions query above.
    await db.homeworkSubmission.update({
      where: { id: sub.id },
      data: {
        originalityScore: score,
        originalityFlag: flag,
        originalityNote: noteParts.join(" ") || "No similarity or AI signals found.",
        originalityCheckedAt: now,
      },
    });
  }

  await recordAudit({
    schoolId: session.schoolId,
    userId: session.userId,
    action: "homework.originality.check",
    entityType: "Homework",
    entityId: homework.id,
    after: { checked: texts.length, flagged: flaggedCount, aiCalls },
  });

  revalidatePath(`/homework/${homeworkId}`);
  const aiNote = client ? ` (${aiCalls} AI check${aiCalls === 1 ? "" : "s"})` : " (similarity only — no AI key)";
  return {
    ok: true,
    message: `Checked ${texts.length} submission${texts.length === 1 ? "" : "s"}: ${flaggedCount} flagged${aiNote}.`,
  };
}
