"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { sendMessage } from "@/app/(app)/messages/actions";
import { Alert, Button, Textarea } from "@/components/ui";

export function Composer({ threadId }: { threadId: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    if (body.trim().length === 0) return;
    startTransition(async () => {
      const result = await sendMessage({ threadId, body });
      if (result.ok) {
        setBody("");
        setError(null);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="space-y-2 border-t border-border px-5 py-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends; Shift+Enter makes a new line.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        rows={2}
        maxLength={5000}
        placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
        aria-label="Message"
      />
      <div className="flex justify-end">
        <Button disabled={pending || body.trim().length === 0} onClick={submit}>
          {pending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
