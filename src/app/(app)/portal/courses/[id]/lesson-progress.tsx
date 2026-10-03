"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setLessonProgress } from "@/app/(app)/portal/courses/actions";
import { Button } from "@/components/ui";

/**
 * Per-lesson complete toggle for the portal. Optimism is deliberately avoided —
 * the write is quick, and showing the confirmed state after `router.refresh()`
 * keeps the progress bar above it honest.
 */
export function LessonComplete({
  lessonId,
  childId,
  complete,
}: {
  lessonId: string;
  childId: string;
  complete: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant={complete ? "secondary" : "success"}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await setLessonProgress(lessonId, childId, !complete);
            if (result.ok) router.refresh();
            else setError(result.message);
          })
        }
      >
        {pending ? "Saving…" : complete ? "✓ Completed — undo" : "Mark complete"}
      </Button>
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </div>
  );
}
