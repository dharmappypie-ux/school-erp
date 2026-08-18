"use server";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPermission } from "@/lib/permissions";
import {
  allowedSourcesFor,
  buildSystemPrompt,
  interpretLocally,
  interpretResponse,
  RESPONSE_SCHEMA,
  type Interpretation,
} from "@/lib/nl-query";
import {
  compileReport,
  readCell,
  toCsv,
  type FieldSpec,
  type SourceSpec,
} from "@/lib/reports";
import { askLimits, consumeAll } from "@/lib/rate-limit";
import { scopedDb } from "@/lib/tenant";

export interface AskResult {
  ok: boolean;
  /** How the question was read, shown to the user so they can check it. */
  explanation: string;
  /** The interpreted definition, rendered for display. */
  reading?: {
    source: string;
    columns: string[];
    filters: string[];
    sort?: string;
  };
  columns?: { key: string; label: string }[];
  rows?: (string | null)[][];
  rowCount?: number;
  truncated?: boolean;
  csv?: string;
  usedAi: boolean;
  durationMs?: number;
  /** Questions left before the limit bites, for the quota display. */
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

/**
 * Asks Claude to translate the question into a report definition.
 *
 * The model is given the field registry and the question — never any school
 * data. Its reply is constrained to a JSON schema and then validated by
 * `compileReport` before it is allowed anywhere near the database.
 */
async function interpretWithClaude(
  question: string,
  allowed: readonly SourceSpec[],
): Promise<{ interpretation: Interpretation; usedAi: boolean }> {
  const allowedSourceKeys = allowed.map((source) => source.key);

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
      output_config: {
        format: {
          type: "json_schema",
          schema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [
        {
          role: "user",
          // Delimited so the question reads as data rather than instruction.
          content: `<question>\n${question}\n</question>`,
        },
      ],
    });

    // A refusal returns 200 with no usable content — check before reading it.
    if (response.stop_reason === "refusal") {
      return {
        interpretation: {
          answerable: false,
          explanation: "That question was declined. Try rephrasing it.",
        },
        usedAi: true,
      };
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        interpretation: {
          answerable: false,
          explanation: "The model's reply could not be read as a report definition.",
        },
        usedAi: true,
      };
    }

    return {
      interpretation: interpretResponse(parsed, allowedSourceKeys),
      usedAi: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Falling back keeps the feature usable when the API is down or the key is
    // wrong; the user is told which path answered them.
    const local = interpretLocally(question, allowedSourceKeys);
    return {
      interpretation: {
        ...local,
        explanation: `${local.explanation} (The AI call failed: ${message})`,
      },
      usedAi: false,
    };
  }
}

export async function askQuestion(question: string): Promise<AskResult> {
  const parsed = QuestionSchema.safeParse(question);
  if (!parsed.success) {
    return {
      ok: false,
      explanation: parsed.error.issues[0]?.message ?? "Invalid question",
      usedAi: false,
    };
  }

  const session = await requirePermission("ai.query");
  const db = scopedDb(session.schoolId);

  // Only sources the caller could already open elsewhere in the app.
  const allowed = allowedSourcesFor((permission) =>
    hasPermission(session.permissions, permission),
  );

  if (allowed.length === 0) {
    return {
      ok: false,
      explanation:
        "You do not have read access to any data source, so there is nothing to ask about.",
      usedAi: false,
    };
  }

  // Checked before the model is called, since the API call is what costs
  // money — a refused request must not reach Anthropic at all.
  const limit = await consumeAll(askLimits(session.schoolId, session.userId));
  if (!limit.allowed) {
    await db.aiQueryLog.create({
      data: {
        schoolId: session.schoolId,
        userId: session.userId,
        question: parsed.data,
        model: "rate-limited",
        success: false,
        errorMessage: limit.message ?? "Rate limit reached",
      },
    });
    return {
      ok: false,
      explanation: limit.message ?? "Rate limit reached. Try again shortly.",
      usedAi: false,
      remaining: 0,
      retryAfterSeconds: limit.retryAfterSeconds,
    };
  }

  const started = Date.now();
  const { interpretation, usedAi } = await interpretWithClaude(parsed.data, allowed);

  async function log(success: boolean, extra: Record<string, unknown>) {
    await db.aiQueryLog.create({
      data: {
        schoolId: session.schoolId,
        userId: session.userId,
        question: parsed.success ? parsed.data : question,
        model: usedAi ? env.ai.model : "keyword-fallback",
        durationMs: Date.now() - started,
        success,
        ...extra,
      },
    });
  }

  if (!interpretation.answerable || !interpretation.definition) {
    await log(false, { errorMessage: interpretation.explanation });
    return { ok: false, explanation: interpretation.explanation, usedAi, remaining: limit.remaining };
  }

  const compiled = compileReport(interpretation.definition);
  if (!compiled.ok) {
    await log(false, { errorMessage: compiled.errors.join(" ") });
    return { ok: false, explanation: compiled.errors.join(" "), usedAi, remaining: limit.remaining };
  }

  // Re-check the permission against the source the model actually chose.
  if (!hasPermission(session.permissions, compiled.source.permission)) {
    await log(false, { errorMessage: "permission denied for chosen source" });
    return {
      ok: false,
      explanation: `Answering that would need “${compiled.source.permission}”, which you do not have.`,
      usedAi,
      remaining: limit.remaining,
    };
  }

  const delegate = (db as unknown as Record<string, {
    findMany: (args: unknown) => Promise<unknown[]>;
  }>)[compiled.source.model];

  let records: unknown[];
  try {
    // scopedDb injects schoolId — the model's definition carries no tenant.
    records = await delegate.findMany({
      where: compiled.where,
      select: compiled.select,
      orderBy: compiled.orderBy,
      take: compiled.take,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await log(false, { errorMessage: message });
    return { ok: false, explanation: `The query failed: ${message}`, usedAi, remaining: limit.remaining };
  }

  const rows = records.map((record) =>
    compiled.columns.map((column: FieldSpec) => present(readCell(record, column))),
  );
  const durationMs = Date.now() - started;

  await log(true, {
    interpretation: JSON.stringify(interpretation.definition),
    answer: interpretation.explanation,
    rowCount: rows.length,
  });

  const byKey = new Map(compiled.source.fields.map((f) => [f.key, f.label]));

  return {
    ok: true,
    explanation: interpretation.explanation,
    reading: {
      source: compiled.source.label,
      columns: compiled.columns.map((column) => column.label),
      filters: (interpretation.definition.filters ?? []).map((filter) => {
        const label = byKey.get(filter.field) ?? filter.field;
        return filter.value
          ? `${label} ${filter.operator} ${filter.value}`
          : `${label} ${filter.operator}`;
      }),
      sort: interpretation.definition.sortBy
        ? `${byKey.get(interpretation.definition.sortBy) ?? interpretation.definition.sortBy} ${interpretation.definition.sortDirection ?? "asc"}`
        : undefined,
    },
    columns: compiled.columns.map((column) => ({
      key: column.key,
      label: column.label,
    })),
    rows,
    rowCount: rows.length,
    truncated: rows.length === compiled.take,
    csv: toCsv(compiled.columns, records),
    usedAi,
    durationMs,
    remaining: limit.remaining,
  };
}
