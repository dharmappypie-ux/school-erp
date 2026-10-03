"use server";

import Anthropic from "@anthropic-ai/sdk";

import { requirePermission } from "@/lib/auth";
import {
  classLevelForStudent,
  gatherCatalog,
  gatherLearningSignals,
} from "@/lib/ai/learning";
import {
  STUDY_TIPS_SCHEMA,
  STUDY_TIPS_SYSTEM_PROMPT,
  buildLearningPlan,
  parseTips,
  summariseForAi,
} from "@/lib/ai/recommend";
import { env } from "@/lib/env";
import { getPortalContext } from "@/lib/portal";
import { scopedDb } from "@/lib/tenant";

export interface StudyTipsResult {
  ok: boolean;
  tips: string[];
  usedAi: boolean;
  message?: string;
}

/** Deterministic tips derived from the plan, used when there is no API key or the call fails. */
function fallbackTips(recommendations: { action: string }[]): string[] {
  const tips = recommendations.map((r) => r.action);
  if (tips.length === 0) {
    return ["You're doing well across the board — keep up your routine and stay curious!"];
  }
  return tips.slice(0, 5);
}

/**
 * Generates personalised study tips for one of the viewer's children. The plan
 * is always computed by the rules engine; the model only rewrites it into
 * warmer, tailored language. Falls back to the deterministic tips when no key
 * is configured or the call fails, so the button always returns something.
 */
export async function generateStudyTips(childId: string): Promise<StudyTipsResult> {
  await requirePermission("portal.access");
  const context = await getPortalContext();
  const child = context.children.find((candidate) => candidate.id === childId);
  if (!child) return { ok: false, tips: [], usedAi: false, message: "That student is not linked to your account." };

  const db = scopedDb(context.session.schoolId);
  const yearId = context.session.academicYear?.id;
  const name = `${child.firstName} ${child.lastName ?? ""}`.trim();

  const classLevelId = await classLevelForStudent(db, child.id, yearId);
  const [signals, catalog] = await Promise.all([
    gatherLearningSignals(db, { id: child.id, name }, yearId, context.session.schoolId),
    gatherCatalog(db, classLevelId),
  ]);
  const plan = buildLearningPlan(signals, catalog.courses, catalog.quizzes);

  if (!env.ai.apiKey) {
    return { ok: true, tips: fallbackTips(plan.recommendations), usedAi: false };
  }

  const client = new Anthropic({ apiKey: env.ai.apiKey });
  try {
    const response = await client.messages.create({
      model: env.ai.model,
      max_tokens: 600,
      system: STUDY_TIPS_SYSTEM_PROMPT,
      output_config: {
        format: {
          type: "json_schema",
          schema: STUDY_TIPS_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [
        { role: "user", content: `<summary>\n${summariseForAi(signals, plan)}\n</summary>` },
      ],
    });

    if (response.stop_reason === "refusal") {
      return { ok: true, tips: fallbackTips(plan.recommendations), usedAi: false };
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    const tips = parseTips(JSON.parse(text));
    if (!tips) return { ok: true, tips: fallbackTips(plan.recommendations), usedAi: false };
    return { ok: true, tips, usedAi: true };
  } catch {
    return { ok: true, tips: fallbackTips(plan.recommendations), usedAi: false };
  }
}
