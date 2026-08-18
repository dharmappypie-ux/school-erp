"use client";

import { useState, useTransition } from "react";

import { gradeSubmission } from "@/app/(app)/homework/actions";
import { Button, Input, cn } from "@/components/ui";

export function GradeRow({
  submissionId,
  maxMarks,
  currentMarks,
  currentFeedback,
}: {
  submissionId: string;
  maxMarks: number | null;
  currentMarks: number | null;
  currentFeedback: string | null;
}) {
  const [marks, setMarks] = useState(currentMarks !== null ? String(currentMarks) : "");
  const [feedback, setFeedback] = useState(currentFeedback ?? "");
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (maxMarks === null) {
    return <span className="text-[11px] text-muted">ungraded</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        aria-label="Mark"
        type="number"
        min="0"
        max={maxMarks}
        value={marks}
        onChange={(event) => setMarks(event.target.value)}
        className="numeric w-16"
      />
      <Input
        aria-label="Feedback"
        value={feedback}
        onChange={(event) => setFeedback(event.target.value)}
        placeholder="feedback"
        className="w-32"
      />
      <Button
        variant="secondary"
        disabled={pending || marks.trim() === ""}
        onClick={() =>
          startTransition(async () => {
            setNote(await gradeSubmission({ submissionId, marks, feedback }));
          })
        }
      >
        {pending ? "…" : "Save"}
      </Button>
      {note ? (
        <span
          className={cn(
            "text-[11px]",
            note.ok ? "text-success" : "text-danger",
          )}
        >
          {note.ok ? "saved" : note.message}
        </span>
      ) : null}
    </div>
  );
}
