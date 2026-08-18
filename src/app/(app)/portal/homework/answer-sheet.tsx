"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveAnswers } from "@/app/(app)/portal/homework/actions";
import { Alert, Button, Textarea } from "@/components/ui";

export interface PortalQuestion {
  id: string;
  sequence: number;
  prompt: string;
  type: "MULTIPLE_CHOICE" | "SHORT_TEXT" | "LONG_TEXT";
  options: string[];
  marks: number;
  selectedOption: number | null;
  textAnswer: string | null;
}

export function AnswerSheet({
  submissionId,
  childId,
  questions,
  locked,
}: {
  submissionId: string;
  childId?: string;
  questions: PortalQuestion[];
  locked: boolean;
}) {
  const [answers, setAnswers] = useState(() =>
    Object.fromEntries(
      questions.map((question) => [
        question.id,
        { selectedOption: question.selectedOption, textAnswer: question.textAnswer },
      ]),
    ),
  );
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (questions.length === 0) return null;

  const answered = questions.filter((question) => {
    const value = answers[question.id];
    return question.type === "MULTIPLE_CHOICE"
      ? value?.selectedOption !== null && value?.selectedOption !== undefined
      : Boolean(value?.textAnswer && value.textAnswer.trim());
  }).length;

  return (
    <div className="mt-3 space-y-3 rounded-[var(--radius-base)] border border-border bg-surface-subtle px-3 py-3">
      <p className="text-xs font-medium text-muted-strong">
        Worksheet · {answered} of {questions.length} answered
      </p>

      {note ? <Alert tone={note.ok ? "success" : "danger"}>{note.message}</Alert> : null}

      {questions.map((question) => (
        <div key={question.id} className="space-y-1.5">
          <p className="text-[13px] font-medium">
            {question.sequence}. {question.prompt}{" "}
            <span className="font-normal text-muted">
              ({question.marks} {question.marks === 1 ? "mark" : "marks"})
            </span>
          </p>

          {question.type === "MULTIPLE_CHOICE" ? (
            <div className="space-y-1">
              {question.options.map((option, index) => (
                <label key={index} className="flex items-center gap-2 text-[13px]">
                  <input
                    type="radio"
                    name={`q-${question.id}`}
                    disabled={locked}
                    checked={answers[question.id]?.selectedOption === index}
                    onChange={() =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: { selectedOption: index, textAnswer: null },
                      }))
                    }
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                  <span>
                    {String.fromCharCode(65 + index)}. {option}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <Textarea
              rows={question.type === "LONG_TEXT" ? 4 : 2}
              disabled={locked}
              value={answers[question.id]?.textAnswer ?? ""}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  [question.id]: { selectedOption: null, textAnswer: event.target.value },
                }))
              }
              aria-label={`Answer to question ${question.sequence}`}
              placeholder="Write your answer"
            />
          )}
        </div>
      ))}

      {locked ? (
        <p className="text-[11px] text-muted">
          This has been marked, so the answers can no longer be changed.
        </p>
      ) : (
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await saveAnswers({
                submissionId,
                childId,
                answers: questions.map((question) => ({
                  questionId: question.id,
                  selectedOption: answers[question.id]?.selectedOption ?? null,
                  textAnswer: answers[question.id]?.textAnswer ?? null,
                })),
              });
              setNote(result);
              if (result.ok) router.refresh();
            })
          }
        >
          {pending ? "Sending…" : "Send answers"}
        </Button>
      )}
    </div>
  );
}
