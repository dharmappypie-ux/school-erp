"use server";

import { requirePermission, requireFeature } from "@/lib/auth";
import { runAsk, type AskResult } from "@/lib/ask";
import { scopedDb } from "@/lib/tenant";

export type { AskResult } from "@/lib/ask";

export async function askQuestion(question: string): Promise<AskResult> {
  const session = await requirePermission("ai.query");
  await requireFeature("ask_ai");
  const db = scopedDb(session.schoolId);
  return runAsk({
    db,
    schoolId: session.schoolId,
    userId: session.userId,
    permissions: session.permissions,
    question,
  });
}
