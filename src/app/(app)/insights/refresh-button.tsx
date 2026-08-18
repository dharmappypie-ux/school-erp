"use client";

import { useState, useTransition } from "react";

import { refreshInsights } from "@/app/(app)/insights/actions";
import { Alert, Button } from "@/components/ui";

export function RefreshButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(await refreshInsights());
          })
        }
      >
        {pending ? "Scoring…" : "Recompute scores"}
      </Button>
      {result ? (
        <div className="w-full max-w-md">
          <Alert tone={result.ok ? "success" : "danger"}>{result.message}</Alert>
        </div>
      ) : null}
    </div>
  );
}
