"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { submitQuizAttempt } from "@/app/(app)/portal/quizzes/actions";
import { Alert, Button, Card, CardHeader } from "@/components/ui";

export interface RunnerQuestion {
  id: string;
  sequence: number;
  prompt: string;
  options: string[];
  points: number;
}

/**
 * Takes a quiz one page of questions at a time (all shown together). The
 * correct answers are never sent to the client — only the chosen options are
 * posted, and the server grades. On success the page refreshes into the
 * results view.
 */
export function QuizRunner({
  quizId,
  childId,
  questions,
}: {
  quizId: string;
  childId: string;
  questions: RunnerQuestion[];
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const answered = Object.keys(answers).length;

  function submit() {
    startTransition(async () => {
      setError(null);
      const result = await submitQuizAttempt(quizId, childId, answers);
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  }

  return (
    <div className="space-y-4">
      {questions.map((question) => (
        <Card key={question.id}>
          <CardHeader
            title={
              <span>
                <span className="text-muted">Q{question.sequence}. </span>
                {question.prompt}
              </span>
            }
            description={`${question.points} points`}
          />
          <fieldset className="space-y-2 px-5 py-4">
            <legend className="sr-only">{question.prompt}</legend>
            {question.options.map((option, index) => {
              const selected = answers[question.id] === index;
              return (
                <label
                  key={index}
                  className={`flex cursor-pointer items-center gap-3 rounded-[var(--radius-base)] border px-3 py-2 text-sm transition-colors ${
                    selected
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-border hover:bg-surface-hover"
                  }`}
                >
                  <input
                    type="radio"
                    name={question.id}
                    checked={selected}
                    onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: index }))}
                    className="accent-[var(--brand)]"
                  />
                  {option}
                </label>
              );
            })}
          </fieldset>
        </Card>
      ))}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={pending}
          onClick={() => {
            if (
              answered < questions.length &&
              !window.confirm(
                `You've answered ${answered} of ${questions.length}. Submit anyway? Unanswered questions score zero.`,
              )
            ) {
              return;
            }
            submit();
          }}
        >
          {pending ? "Submitting…" : "Submit quiz"}
        </Button>
        <span className="text-xs text-muted">
          {answered} of {questions.length} answered
        </span>
      </div>
    </div>
  );
}
