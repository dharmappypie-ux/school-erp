"use client";

import { useState, type ReactNode } from "react";

import { SlideOver } from "@/components/slide-over";

/**
 * A "+ Add …" button that opens a form in a right slide-in drawer, instead of
 * sitting the form permanently on the page.
 *
 * The form itself (`children`) manages its own submission and shows its own
 * success/error message; the drawer stays open afterwards so that message is
 * seen, and the list behind it has already revalidated. The person closes the
 * drawer when done (X, Escape, or backdrop).
 */
export function DrawerForm({
  trigger,
  title,
  description,
  children,
  width = "w-[28rem]",
}: {
  trigger: string;
  title: string;
  description?: string;
  children: ReactNode;
  width?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex h-9.5 items-center gap-1.5 rounded-[var(--radius-base)] bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-hover"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current">
          <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" />
        </svg>
        {trigger}
      </button>

      <SlideOver open={open} onClose={() => setOpen(false)} label={title} width={width}>
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-muted">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded-[var(--radius-base)] p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current">
              <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </SlideOver>
    </>
  );
}
