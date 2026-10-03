"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/components/ui";

/**
 * A right slide-in panel with a dim backdrop — the shared shell behind both the
 * account drawer and the add/edit form drawers.
 *
 * It stays mounted and animates with a transform, so it slides both open and
 * shut; `inert` while closed keeps its controls out of the tab order, and focus
 * is trapped inside while open and handed back to the trigger on close.
 */
export function SlideOver({
  open,
  onClose,
  label,
  width = "w-96",
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  /** Tailwind width class for the panel. */
  width?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "Tab" && panel) {
        const focusables = panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (!panel.contains(active)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 transition-opacity duration-200",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      aria-hidden={!open}
      inert={!open}
    >
      <button
        type="button"
        aria-label={`Close ${label}`}
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          "absolute inset-y-0 right-0 flex max-w-[90vw] flex-col bg-surface shadow-[var(--shadow-lg)] outline-none transition-transform duration-200 ease-out",
          width,
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {children}
      </div>
    </div>
  );
}
