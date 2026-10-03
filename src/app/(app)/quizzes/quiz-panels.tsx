"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addQuestion,
  createQuiz,
  deleteQuestion,
  setQuizStatus,
} from "@/app/(app)/quizzes/actions";
import { DrawerForm } from "@/components/drawer-form";
import { ManageForm } from "@/components/manage-form";
import { Alert, Button } from "@/components/ui";

export function AddQuiz({
  classLevels,
  subjects,
  teachers,
}: {
  classLevels: { value: string; label: string }[];
  subjects: { value: string; label: string }[];
  teachers: { value: string; label: string }[];
}) {
  return (
    <DrawerForm
      trigger="New quiz"
      title="Create a quiz"
      description="A short, auto-graded quiz. It stays a draft until you publish it."
    >
      <ManageForm
        bare
        title="Create a quiz"
        action={createQuiz}
        submitLabel="Create quiz"
        footnote="Target a class so it reaches those students in the portal once published."
        fields={[
          { name: "title", label: "Title", required: true, placeholder: "General Knowledge — Week 1" },
          { name: "description", label: "Description", type: "textarea", placeholder: "Optional." },
          { name: "classLevelId", label: "Class", type: "select", options: classLevels, half: true },
          { name: "subjectId", label: "Subject", type: "select", options: subjects, half: true },
          { name: "teacherId", label: "Author", type: "select", options: teachers, half: true },
          { name: "timeLimitMinutes", label: "Time limit (min)", type: "number", min: "0", hint: "Optional.", half: true },
        ]}
      />
    </DrawerForm>
  );
}

export function AddQuestion({ quizId }: { quizId: string }) {
  return (
    <DrawerForm
      trigger="Add question"
      title="Add a question"
      description="Multiple choice with one correct answer."
    >
      <ManageForm
        bare
        title="Add a question"
        action={addQuestion}
        submitLabel="Add question"
        hiddenValues={{ quizId }}
        footnote="Leave options blank to use fewer than four. The correct option must not be blank."
        fields={[
          { name: "prompt", label: "Question", type: "textarea", required: true, placeholder: "What is the capital of India?" },
          { name: "option0", label: "Option 1", required: true, half: true },
          { name: "option1", label: "Option 2", required: true, half: true },
          { name: "option2", label: "Option 3", half: true },
          { name: "option3", label: "Option 4", half: true },
          {
            name: "correctOption",
            label: "Correct answer",
            type: "select",
            required: true,
            options: [
              { value: "0", label: "Option 1" },
              { value: "1", label: "Option 2" },
              { value: "2", label: "Option 3" },
              { value: "3", label: "Option 4" },
            ],
            half: true,
          },
          { name: "points", label: "Points", type: "number", min: "1", defaultValue: "10", required: true, half: true },
          { name: "explanation", label: "Explanation", type: "textarea", placeholder: "Shown after the student answers. Optional." },
        ]}
      />
    </DrawerForm>
  );
}

export function QuizStatusControls({
  quizId,
  status,
  canPublish,
}: {
  quizId: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  canPublish: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const run = (next: "DRAFT" | "PUBLISHED" | "ARCHIVED") =>
    startTransition(async () => {
      setError(null);
      const result = await setQuizStatus(quizId, next);
      if (result.ok) router.refresh();
      else setError(result.message);
    });

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-2">
        {status !== "PUBLISHED" && canPublish ? (
          <Button size="sm" disabled={pending} onClick={() => run("PUBLISHED")}>
            {pending ? "Working…" : "Publish"}
          </Button>
        ) : null}
        {status === "PUBLISHED" ? (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("DRAFT")}>
            {pending ? "Working…" : "Unpublish"}
          </Button>
        ) : null}
        {status !== "ARCHIVED" ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("ARCHIVED")}>
            Archive
          </Button>
        ) : (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("DRAFT")}>
            Restore
          </Button>
        )}
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}

export function DeleteQuestionButton({ id, label }: { id: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label={`Delete ${label}`}
        onClick={() =>
          startTransition(async () => {
            if (!window.confirm("Delete this question? This cannot be undone.")) return;
            setError(null);
            const result = await deleteQuestion(id);
            if (result.ok) router.refresh();
            else setError(result.message);
          })
        }
      >
        {pending ? "…" : "Delete"}
      </Button>
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </>
  );
}
