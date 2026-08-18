"use client";

import { useState, useTransition } from "react";

import { decideLeave } from "@/app/(app)/leave/actions";
import { Button } from "@/components/ui";

export function DecideButtons({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (result?.ok) {
    return <span className="text-[11px] text-success">saved</span>;
  }

  function decide(decision: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      setResult(await decideLeave({ requestId, decision }));
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="success"
          disabled={pending}
          onClick={() => decide("APPROVED")}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => decide("REJECTED")}
        >
          Reject
        </Button>
      </div>
      {result && !result.ok ? (
        <span className="text-[11px] text-danger">{result.message}</span>
      ) : null}
    </div>
  );
}
