"use client";

import { useRef, useState, useTransition } from "react";

import { Avatar } from "@/components/avatar";
import {
  removePersonPhoto,
  uploadPersonPhoto,
  type PhotoSubject,
} from "@/lib/photo-actions";
import { MAX_IMAGE_BYTES } from "@/lib/uploads";

/**
 * Photo control shared by student and staff profiles.
 *
 * Read-only callers get the avatar alone, so the same component serves users
 * without edit rights rather than the page branching around it.
 */
export function PhotoUploader({
  subject,
  recordId,
  firstName,
  lastName,
  photoUrl,
  canEdit,
}: {
  subject: PhotoSubject;
  recordId: string;
  firstName: string;
  lastName?: string | null;
  photoUrl: string | null;
  canEdit: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(photoUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canEdit) {
    return (
      <Avatar
        firstName={firstName}
        lastName={lastName}
        photoUrl={current}
        size="xl"
      />
    );
  }

  function submit(file: File) {
    setError(null);

    // Re-checked on the server; this only avoids uploading two megabytes to be
    // told no.
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`Images must be under ${MAX_IMAGE_BYTES / (1024 * 1024)} MB.`);
      return;
    }

    const formData = new FormData();
    formData.append("photo", file);

    startTransition(async () => {
      const result = await uploadPersonPhoto(subject, recordId, formData);
      if (result.ok) setCurrent(result.photoUrl ?? null);
      else setError(result.message);
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <Avatar
          firstName={firstName}
          lastName={lastName}
          photoUrl={current}
          size="xl"
          className={pending ? "opacity-50" : undefined}
        />
        {pending ? (
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-brand">
            saving…
          </span>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) submit(file);
          // Reset so re-choosing the same file still fires a change.
          event.target.value = "";
        }}
      />

      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
          className="rounded-[var(--radius-base)] border border-border-strong px-2.5 py-1 text-[11px] font-medium hover:bg-surface-hover disabled:opacity-50"
        >
          {current ? "Replace" : "Add photo"}
        </button>
        {current ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await removePersonPhoto(subject, recordId);
                if (result.ok) setCurrent(null);
                else setError(result.message);
              })
            }
            className="rounded-[var(--radius-base)] border border-border-strong px-2.5 py-1 text-[11px] font-medium text-danger hover:bg-surface-hover disabled:opacity-50"
          >
            Remove
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="max-w-40 text-center text-[11px] text-danger">{error}</p>
      ) : null}
    </div>
  );
}
