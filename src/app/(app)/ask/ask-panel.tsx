"use client";

import { useState, useTransition } from "react";

import { askQuestion, type AskResult } from "@/app/(app)/ask/actions";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Table,
  Td,
  Th,
} from "@/components/ui";

const EXAMPLES = [
  "Which students have overdue fees?",
  "Show absences in the last 30 days",
  "List teachers in the Science department",
  "Payments received this month by UPI",
];

export function AskPanel({ aiEnabled }: { aiEnabled: boolean }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [pending, startTransition] = useTransition();

  function ask(text: string) {
    if (text.trim().length < 4) return;
    startTransition(async () => {
      setResult(await askQuestion(text));
    });
  }

  function download() {
    if (!result?.csv) return;
    const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "answer.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {!aiEnabled ? (
        <Alert tone="info" title="No AI key configured">
          Questions are being matched against a small set of built-in patterns
          instead of a language model. Set <code>ANTHROPIC_API_KEY</code> to
          enable the full version.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Ask your data"
          description="A question in plain English, answered from your school's records"
        />
        <div className="space-y-3 px-5 py-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              ask(question);
            }}
            className="flex gap-2"
          >
            <Input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Which students have overdue fees?"
              className="flex-1"
              maxLength={500}
              aria-label="Question"
            />
            <Button disabled={pending || question.trim().length < 4}>
              {pending ? "Thinking…" : "Ask"}
            </Button>
          </form>

          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                disabled={pending}
                onClick={() => {
                  setQuestion(example);
                  ask(example);
                }}
                className="rounded-full border border-border-strong px-2.5 py-1 text-[11px] text-muted transition-colors hover:bg-surface-hover"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {result ? (
        <Card>
          <CardHeader
            title={result.ok ? "Answer" : "Could not answer"}
            description={
              result.ok && result.durationMs
                ? `${result.rowCount} rows in ${result.durationMs}ms`
                : undefined
            }
            action={
              <span className="flex items-center gap-1.5">
                {typeof result.remaining === "number" ? (
                  <Badge tone={result.remaining > 3 ? "neutral" : "warning"}>
                    {result.remaining} left
                  </Badge>
                ) : null}
                <Badge tone={result.usedAi ? "info" : "neutral"}>
                  {result.usedAi ? "AI" : "keyword match"}
                </Badge>
                {result.truncated ? (
                  <Badge tone="warning">truncated</Badge>
                ) : null}
              </span>
            }
          />

          <div className="space-y-3 px-5 py-4">
            <Alert tone={result.ok ? "info" : "warning"}>
              {result.explanation}
            </Alert>

            {/* The interpretation is shown so a misreading is visible rather
                than silently producing a confident, wrong table. */}
            {result.reading ? (
              <dl className="grid gap-2 rounded-[var(--radius-base)] border border-border bg-surface-subtle px-3 py-2.5 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Read as</dt>
                  <dd className="font-medium">{result.reading.source}</dd>
                </div>
                <div>
                  <dt className="text-muted">Columns</dt>
                  <dd className="font-medium">
                    {result.reading.columns.join(", ")}
                  </dd>
                </div>
                {result.reading.filters.length > 0 ? (
                  <div>
                    <dt className="text-muted">Filters</dt>
                    <dd className="font-medium">
                      {result.reading.filters.join(" · ")}
                    </dd>
                  </div>
                ) : null}
                {result.reading.sort ? (
                  <div>
                    <dt className="text-muted">Sorted by</dt>
                    <dd className="font-medium">{result.reading.sort}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}

            {result.ok && result.csv ? (
              <Button variant="secondary" onClick={download}>
                Download CSV
              </Button>
            ) : null}
          </div>

          {result.ok ? (
            result.rows?.length === 0 ? (
              <EmptyState
                title="No rows matched"
                description="The question was understood, but nothing in your records matches it."
              />
            ) : (
              <>
                {result.truncated ? (
                  <div className="px-5 pb-3">
                    <Alert tone="warning">
                      Exactly {result.rowCount} rows came back, which is the
                      limit — there are probably more.
                    </Alert>
                  </div>
                ) : null}
                <Table>
                  <thead>
                    <tr>
                      {result.columns?.map((column) => (
                        <Th key={column.key}>{column.label}</Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows?.slice(0, 100).map((row, index) => (
                      <tr key={index} className="hover:bg-surface-hover">
                        {row.map((cell, cellIndex) => (
                          <Td key={cellIndex}>
                            {cell === null ? (
                              <span className="text-muted">—</span>
                            ) : (
                              cell
                            )}
                          </Td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </Table>
                {(result.rows?.length ?? 0) > 100 ? (
                  <p className="px-5 py-3 text-xs text-muted">
                    Showing the first 100 of {result.rowCount} rows.
                  </p>
                ) : null}
              </>
            )
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
