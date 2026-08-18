"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addQuestion,
  checkAllAnswers,
  deleteQuestion,
} from "@/app/(app)/homework/[id]/question-actions";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
  cn,
} from "@/components/ui";

export interface QuestionRow {
  id: string;
  sequence: number;
  prompt: string;
  type: "MULTIPLE_CHOICE" | "SHORT_TEXT" | "LONG_TEXT";
  options: string[];
  correctOption: number | null;
  marks: number;
}

const BLANK_OPTIONS = ["", "", "", ""];

export function WorksheetBuilder({
  homeworkId,
  questions,
  autoShare,
  reviewCount,
}: {
  homeworkId: string;
  questions: QuestionRow[];
  autoShare: number;
  reviewCount: number;
}) {
  const [type, setType] = useState<QuestionRow["type"]>("MULTIPLE_CHOICE");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<string[]>(BLANK_OPTIONS);
  const [correct, setCorrect] = useState<number | null>(null);
  const [expected, setExpected] = useState("");
  const [marks, setMarks] = useState("1");
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const isMcq = type === "MULTIPLE_CHOICE";
  const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);

  function submit() {
    startTransition(async () => {
      const result = await addQuestion({
        homeworkId,
        prompt,
        type,
        options: isMcq ? options : [],
        correctOption: isMcq ? correct : null,
        expectedAnswer: expected,
        marks: Number(marks),
      });
      setNote(result);
      if (result.ok) {
        setPrompt("");
        setOptions(BLANK_OPTIONS);
        setCorrect(null);
        setExpected("");
        router.refresh();
      }
    });
  }

  return (
    <Card className="mt-4">
      <CardHeader
        title="Worksheet questions"
        description={
          questions.length === 0
            ? "Draft questions here and they can be marked in one click"
            : `${questions.length} questions · ${totalMarks} marks · ${autoShare}% markable automatically`
        }
        action={
          questions.length > 0 ? (
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setNote(await checkAllAnswers(homeworkId));
                  router.refresh();
                })
              }
            >
              {pending ? "Checking…" : "Check answers"}
            </Button>
          ) : null
        }
      />

      <div className="space-y-3 px-5 py-4">
        {note ? (
          <Alert tone={note.ok ? "success" : "danger"}>{note.message}</Alert>
        ) : null}

        {reviewCount > 0 ? (
          <Alert tone="warning" title={`${reviewCount} ${reviewCount === 1 ? "answer needs" : "answers need"} your eye`}>
            Written answers are never marked automatically — a correct paraphrase
            would be failed by a machine. They are listed against each student
            below.
          </Alert>
        ) : null}

        {questions.length === 0 ? (
          <EmptyState
            title="No questions yet"
            description="Add multiple-choice questions with their answers, and the whole class can be marked in one click."
          />
        ) : (
          <ol className="space-y-2">
            {questions.map((question) => (
              <li
                key={question.id}
                className="rounded-[var(--radius-base)] border border-border px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {question.sequence}. {question.prompt}
                    </p>
                    {question.options.length > 0 ? (
                      <ul className="mt-1 space-y-0.5">
                        {question.options.map((option, index) => (
                          <li
                            key={index}
                            className={cn(
                              "text-[12px]",
                              index === question.correctOption
                                ? "font-medium text-success"
                                : "text-muted",
                            )}
                          >
                            {String.fromCharCode(65 + index)}. {option}
                            {index === question.correctOption ? " ✓" : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-0.5 text-[11px] text-muted">
                        Written answer — you mark this one
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={question.correctOption !== null ? "success" : "warning"}>
                      {question.marks} {question.marks === 1 ? "mark" : "marks"}
                    </Badge>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          setNote(await deleteQuestion(question.id));
                          router.refresh();
                        })
                      }
                      className="text-[11px] font-medium text-danger"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="space-y-3 border-t border-border pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Question type">
              <Select
                value={type}
                onChange={(event) => setType(event.target.value as QuestionRow["type"])}
              >
                <option value="MULTIPLE_CHOICE">Multiple choice</option>
                <option value="SHORT_TEXT">Short written answer</option>
                <option value="LONG_TEXT">Long written answer</option>
              </Select>
            </Field>
            <Field label="Marks">
              <Input
                type="number"
                min="0.5"
                step="0.5"
                value={marks}
                onChange={(event) => setMarks(event.target.value)}
                className="numeric"
              />
            </Field>
          </div>

          <Field label="Question" required>
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={2}
              placeholder="What is the capital of India?"
            />
          </Field>

          {isMcq ? (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-strong">
                Options — select the correct one
              </span>
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct-option"
                    checked={correct === index}
                    onChange={() => setCorrect(index)}
                    aria-label={`Option ${String.fromCharCode(65 + index)} is correct`}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                  <Input
                    value={option}
                    onChange={(event) => {
                      const next = [...options];
                      next[index] = event.target.value;
                      setOptions(next);
                    }}
                    placeholder={`Option ${String.fromCharCode(65 + index)}`}
                    aria-label={`Option ${String.fromCharCode(65 + index)}`}
                  />
                </div>
              ))}
              <p className="text-[11px] text-muted">
                The selected option is the answer key. Without it the question
                cannot be marked automatically.
              </p>
            </div>
          ) : (
            <Field label="Model answer" hint="Shown to you while marking. Never shown to students.">
              <Textarea
                value={expected}
                onChange={(event) => setExpected(event.target.value)}
                rows={2}
              />
            </Field>
          )}

          <Button disabled={pending || prompt.trim().length < 3} onClick={submit}>
            {pending ? "Adding…" : "Add question"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
