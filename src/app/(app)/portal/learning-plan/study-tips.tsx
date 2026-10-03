"use client";

import { useState, useTransition } from "react";

import { generateStudyTips } from "@/app/(app)/portal/learning-plan/actions";
import { Alert, Button } from "@/components/ui";

/**
 * "Get personalized study tips" — calls the model to rewrite the plan into
 * warm, tailored tips. Always returns something (deterministic fallback), so
 * the button never dead-ends.
 */
export function StudyTips({ childId }: { childId: string }) {
  const [tips, setTips] = useState<string[] | null>(null);
  const [usedAi, setUsedAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await generateStudyTips(childId);
            if (result.ok) {
              setTips(result.tips);
              setUsedAi(result.usedAi);
            } else {
              setError(result.message ?? "Could not generate tips.");
            }
          })
        }
      >
        {pending ? "Thinking…" : tips ? "Refresh study tips" : "Get personalized study tips"}
      </Button>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {tips ? (
        <div className="rounded-[var(--radius-base)] border border-border bg-surface-muted p-4">
          <ul className="space-y-2">
            {tips.map((tip, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-foreground">
                <span aria-hidden className="mt-0.5 text-brand">✦</span>
                {tip}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted">
            {usedAi
              ? "Personalized for you by AI, based on your recent results."
              : "Generated from your recent results."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
