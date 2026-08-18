"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { submitHomework } from "@/app/(app)/portal/homework/actions";
import { attachSubmissionFile } from "@/lib/homework-attachments";
import { AttachmentField } from "@/components/attachment-field";
import { Alert, Button, Textarea } from "@/components/ui";

export function SubmitForm({
  submissionId,
  childId,
  isResubmit,
  attachmentUrl,
}: {
  submissionId: string;
  childId?: string;
  isResubmit?: boolean;
  attachmentUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <div className="mt-2">
        {note ? (
          <Alert tone={note.ok ? "success" : "danger"}>{note.message}</Alert>
        ) : (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {isResubmit ? "Resubmit work" : "Submit work"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      {note && !note.ok ? <Alert tone="danger">{note.message}</Alert> : null}
      <Textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={3}
        maxLength={5000}
        aria-label="Your work"
        placeholder="Type your answer, or note that you have handed in a hard copy."
      />
      <AttachmentField
        onUpload={(data) => attachSubmissionFile(submissionId, childId, data)}
        currentUrl={attachmentUrl}
        label="Attach your work"
        hint="A photo of your written work, or a PDF. Up to 10 MB."
        compact
      />
      <p className="text-[11px] text-muted">
        If a parent is submitting for a younger child, that is fine — the
        teacher sees who filed it.
      </p>
      <div className="flex gap-2">
        <Button
          disabled={pending || content.trim().length === 0}
          onClick={() =>
            startTransition(async () => {
              const result = await submitHomework({ submissionId, content, childId });
              setNote(result);
              if (result.ok) {
                setOpen(false);
                setContent("");
                router.refresh();
              }
            })
          }
        >
          {pending ? "Submitting…" : "Submit"}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
