"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { cn } from "@/components/ui";
import { initials } from "@/lib/format";
import type { PortalChild } from "@/lib/portal";

/**
 * Switches between a guardian's children. Hidden entirely for a single child
 * (and for students viewing themselves), where it would be noise.
 */
export function ChildSwitcher({
  students,
  selectedId,
}: {
  students: PortalChild[];
  selectedId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  if (students.length <= 1) return null;

  function select(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("child", id);
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <div
      className={cn("mb-4 flex flex-wrap gap-2", pending && "opacity-70")}
      role="tablist"
      aria-label="Select a child"
    >
      {students.map((child) => {
        const active = child.id === selectedId;
        return (
          <button
            key={child.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => select(child.id)}
            className={cn(
              "flex items-center gap-2.5 rounded-[var(--radius-base)] border px-3 py-2 text-left transition-colors",
              active
                ? "border-brand bg-brand-soft"
                : "border-border bg-surface hover:bg-surface-hover",
            )}
          >
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold",
                active ? "bg-brand text-white" : "bg-surface-muted text-muted-strong",
              )}
            >
              {initials(child.firstName, child.lastName)}
            </span>
            <span>
              <span
                className={cn(
                  "block text-sm font-medium",
                  active ? "text-brand" : "text-foreground",
                )}
              >
                {child.firstName} {child.lastName}
              </span>
              <span className="block text-[11px] text-muted">
                {child.className ?? child.admissionNo}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
