"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, cn } from "@/components/ui";

export interface AttachmentFieldProps {
  /** Called with the chosen file; returns a message and the stored URL. */
  onUpload: (formData: FormData) => Promise<{ ok: boolean; message: string; url?: string }>;
  currentUrl?: string | null;
  label?: string;
  hint?: string;
  compact?: boolean;
}

/**
 * A file picker for worksheets and handed-in work.
 *
 * PDFs and images only — the accept attribute is a convenience for the file
 * dialog, not a control; the server checks the type and sniffs the bytes.
 */
export function AttachmentField({
  onUpload,
  currentUrl,
  label = "Attach a file",
  hint = "PDF or image, up to 10 MB.",
  compact,
}: AttachmentFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  const [url, setUrl] = useState<string | null>(currentUrl ?? null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function choose(file: File | undefined) {
    if (!file) return;
    const data = new FormData();
    data.set("file", file);
    startTransition(async () => {
      const result = await onUpload(data);
      setNote(result);
      if (result.ok && result.url) {
        setUrl(result.url);
        router.refresh();
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className={cn("space-y-1.5", compact ? "" : "mt-2")}>
      {note && !note.ok ? <Alert tone="danger">{note.message}</Alert> : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          aria-label={label}
          onChange={(event) => choose(event.target.files?.[0])}
        />
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? "Uploading…" : url ? "Replace file" : label}
        </Button>

        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-brand underline"
          >
            View attachment
          </a>
        ) : null}
      </div>

      <p className="text-[11px] text-muted">{hint}</p>
    </div>
  );
}
