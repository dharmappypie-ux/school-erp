"use client";

import { useState, useTransition } from "react";

import { returnBook } from "@/app/(app)/library/actions";
import { Alert, Button } from "@/components/ui";

export function ReturnButton({ issueId }: { issueId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (result?.ok) {
    return <span className="text-[11px] text-success">returned</span>;
  }

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(await returnBook({ issueId, condition: "AVAILABLE" }));
          })
        }
      >
        {pending ? "…" : "Return"}
      </Button>
      {result && !result.ok ? (
        <span className="mt-1 block text-[11px] text-danger">{result.message}</span>
      ) : null}
    </>
  );
}

/** Surfaces the outcome of the most recent return above the table. */
export function ReturnFeedback({ message, ok }: { message: string; ok: boolean }) {
  return <Alert tone={ok ? "success" : "danger"}>{message}</Alert>;
}
