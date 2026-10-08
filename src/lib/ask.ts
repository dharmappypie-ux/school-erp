import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { env } from "@/lib/env";
import {
  allowedSourcesFor,
  buildSystemPrompt,
  interpretLocally,
  interpretResponse,
  RESPONSE_SCHEMA,
  type Interpretation,
} from "@/lib/nl-query";
import { hasPermission } from "@/lib/permissions";
import { askLimits, consumeAll } from "@/lib/rate-limit";
import { compileReport, readCell, toCsv, type FieldSpec, type SourceSpec } from "@/lib/reports";
import type { ScopedDb } from "@/lib/tenant";

export interface AskResult {
  ok: boolean;
  explanation: string;
  reading?: { source: string; columns: string[]; filters: string[]; sort?: string };
  columns?: { key: string; label: string }[];
  rows?: (string | null)[][];
  rowCount?: number;
  truncated?: boolean;
  csv?: string;
  usedAi: boolean;
  durationMs?: number;
  remaining?: number;
  retryAfterSeconds?: number;
}

const QuestionSchema = z
  .string()
  .trim()
  .min(4, "Ask a longer question")
  .max(500, "Keep the question under 500 characters");

function present(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "toString" in value) return String(value);
  return String(value);
}

async function interpretWithClaude(
  question: string,
  allowed: readonly SourceSpec[],
): Promise<{ interpretation: Interpretation; usedAi: boolean }> {
  const allowedSourceKeys = allowed.map((s) => s.key);

  if (!env.ai.apiKey) {
    return { interpretation: interpretLocally(question, allowedSourceKeys), usedAi: false };
  }

  const client = new Anthropic({ apiKey: env.ai.apiKey });
  try {
    const response = await client.messages.create({
      model: env.ai.model,
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      system: buildSystemPrompt(allowed),
      output_config: { format: { type: "json_schema", schema: RESPONSE_SCHEMA as unknown as Record<string, unknown> } },
      messages: [{ role: "user", content: `<question>\n${question}\n</question>` }],
    });

    if (response.stop_reason === "refusal") {
      return { interpretation: { answerable: false, explanation: "That question was declined. Try rephrasing it." }, usedAi: true };
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { interpretation: { answerable: false, explanation: "The model's reply could not be read as a report definition." }, usedAi: true };
    }

    return { interpretation: interpretResponse(parsed, allowedSourceKeys), usedAi: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const local = interpretLocally(question, allowedSourceKeys);
    return { interpretation: { ...local, explanation: `${local.explanation} (The AI call failed: ${message})` }, usedAi: false };
  }
}

export interface AskInput {
  db: ScopedDb;
  schoolId: string;
  userId: string;
  permissions: readonly string[];
  question: string;
}

/**
 * Natural-language data query: interprets a question (AI, or a keyword fallback
 * with no key), compiles it to a report over a permitted source, runs it, and
 * returns the rows + an explanation. Shared verbatim by the web `askQuestion`
 * action and the mobile endpoint, so the two can never drift. Rate-limited and
 * logged per school/user.
 */
export async function runAsk(input: AskInput): Promise<AskResult> {
  const { db, schoolId, userId, permissions, question } = input;

  const parsed = QuestionSchema.safeParse(question);
  if (!parsed.success) {
    return { ok: false, explanation: parsed.error.issues[0]?.message ?? "Invalid question", usedAi: false };
  }

  const allowed = allowedSourcesFor((permission) => hasPermission([...permissions], permission));
  if (allowed.length === 0) {
    return { ok: false, explanation: "You do not have read access to any data source, so there is nothing to ask about.", usedAi: false };
  }

  const limit = await consumeAll(askLimits(schoolId, userId));
  if (!limit.allowed) {
    await db.aiQueryLog.create({
      data: { schoolId, userId, question: parsed.data, model: "rate-limited", success: false, errorMessage: limit.message ?? "Rate limit reached" },
    });
    return { ok: false, explanation: limit.message ?? "Rate limit reached. Try again shortly.", usedAi: false, remaining: 0, retryAfterSeconds: limit.retryAfterSeconds };
  }

  const started = Date.now();
  const { interpretation, usedAi } = await interpretWithClaude(parsed.data, allowed);

  const log = (success: boolean, extra: Record<string, unknown>) =>
    db.aiQueryLog.create({
      data: { schoolId, userId, question: parsed.data, model: usedAi ? env.ai.model : "keyword-fallback", durationMs: Date.now() - started, success, ...extra },
    });

  if (!interpretation.answerable || !interpretation.definition) {
    await log(false, { errorMessage: interpretation.explanation });
    return { ok: false, explanation: interpretation.explanation, usedAi, remaining: limit.remaining };
  }

  const compiled = compileReport(interpretation.definition);
  if (!compiled.ok) {
    await log(false, { errorMessage: compiled.errors.join(" ") });
    return { ok: false, explanation: compiled.errors.join(" "), usedAi, remaining: limit.remaining };
  }
  if (!hasPermission([...permissions], compiled.source.permission)) {
    await log(false, { errorMessage: "permission denied for chosen source" });
    return { ok: false, explanation: `Answering that would need “${compiled.source.permission}”, which you do not have.`, usedAi, remaining: limit.remaining };
  }

  const delegate = (db as unknown as Record<string, { findMany: (args: unknown) => Promise<unknown[]> }>)[compiled.source.model];
  let records: unknown[];
  try {
    records = await delegate.findMany({ where: compiled.where, select: compiled.select, orderBy: compiled.orderBy, take: compiled.take });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await log(false, { errorMessage: message });
    return { ok: false, explanation: `The query failed: ${message}`, usedAi, remaining: limit.remaining };
  }

  const rows = records.map((record) => compiled.columns.map((c: FieldSpec) => present(readCell(record, c))));
  const durationMs = Date.now() - started;
  await log(true, { interpretation: JSON.stringify(interpretation.definition), answer: interpretation.explanation, rowCount: rows.length });

  const byKey = new Map(compiled.source.fields.map((f) => [f.key, f.label]));
  return {
    ok: true,
    explanation: interpretation.explanation,
    reading: {
      source: compiled.source.label,
      columns: compiled.columns.map((c) => c.label),
      filters: (interpretation.definition.filters ?? []).map((f) => {
        const label = byKey.get(f.field) ?? f.field;
        return f.value ? `${label} ${f.operator} ${f.value}` : `${label} ${f.operator}`;
      }),
      sort: interpretation.definition.sortBy
        ? `${byKey.get(interpretation.definition.sortBy) ?? interpretation.definition.sortBy} ${interpretation.definition.sortDirection ?? "asc"}`
        : undefined,
    },
    columns: compiled.columns.map((c) => ({ key: c.key, label: c.label })),
    rows,
    rowCount: rows.length,
    truncated: rows.length === compiled.take,
    csv: toCsv(compiled.columns, records),
    usedAi,
    durationMs,
    remaining: limit.remaining,
  };
}
