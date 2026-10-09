"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  decideStudentLeave,
  type DecisionState,
} from "@/app/(app)/leave/students/actions";
import { Alert, Button, Input } from "@/components/ui";

function Buttons({ onReject }: { onReject: () => void }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex gap-2">
      <Button
        type="submit"
        name="decision"
        value="APPROVED"
        disabled={pending}
      >
        {pending ? "Saving…" : "Approve"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={onReject}
      >
        Reject
      </Button>
    </div>
  );
}

function RejectButtons({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex gap-2">
      <Button type="submit" name="decision" value="REJECTED" disabled={pending}>
        {pending ? "Saving…" : "Confirm rejection"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={onCancel}
      >
        Cancel
      </Button>
    </div>
  );
}

export function DecidePanel({ requestId }: { requestId: string }) {
  const [state, formAction] = useActionState<DecisionState, FormData>(
    decideStudentLeave,
    { ok: false, message: "" },
  );
  const [rejecting, setRejecting] = useState(false);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={requestId} />

      {state.message && !state.ok ? (
        <Alert tone="danger">{state.message}</Alert>
      ) : null}

      {rejecting ? (
        <>
          {/* Required by the action — a rejection with no reason gives the
              family nothing to act on. */}
          <Input
            name="note"
            required
            maxLength={300}
            autoFocus
            placeholder="Why is this being rejected?"
          />
          <RejectButtons onCancel={() => setRejecting(false)} />
        </>
      ) : (
        <Buttons onReject={() => setRejecting(true)} />
      )}
    </form>
  );
}
