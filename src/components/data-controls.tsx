"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Input, Select, cn } from "@/components/ui";

/**
 * URL-backed filter controls. State lives in the query string so that every
 * list view is shareable, bookmarkable and survives a refresh — and so the
 * server component can read the filters directly.
 */
function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function apply(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    // Any filter change invalidates the current page offset.
    if (!("page" in updates)) next.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  return { params, apply, pending };
}

export function SearchBox({
  placeholder = "Search…",
  paramName = "q",
}: {
  placeholder?: string;
  paramName?: string;
}) {
  const { params, apply, pending } = useUrlState();
  const [value, setValue] = useState(params.get(paramName) ?? "");

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const current = params.get(paramName) ?? "";
    if (value === current) return;
    const timer = setTimeout(() => apply({ [paramName]: value }), 300);
    return () => clearTimeout(timer);
    // `apply` and `params` are stable enough for this debounce; re-running on
    // them would cancel the timer on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn("w-full sm:w-64", pending && "opacity-70")}
      />
    </div>
  );
}

export function FilterSelect({
  paramName,
  label,
  options,
  allLabel = "All",
}: {
  paramName: string;
  label: string;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  const { params, apply } = useUrlState();
  return (
    <Select
      aria-label={label}
      value={params.get(paramName) ?? ""}
      onChange={(event) => apply({ [paramName]: event.target.value })}
      className="w-full sm:w-auto"
    >
      <option value="">{allLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
}: {
  page: number;
  pageCount: number;
  total: number;
}) {
  const { apply } = useUrlState();
  if (pageCount <= 1) {
    return (
      <p className="px-5 py-3 text-xs text-muted">
        {total} {total === 1 ? "record" : "records"}
      </p>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <p className="text-xs text-muted">
        Page {page} of {pageCount} · {total} records
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => apply({ page: String(page - 1) })}
          className="h-8 rounded-[var(--radius-base)] border border-border-strong px-3 text-xs font-medium disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => apply({ page: String(page + 1) })}
          className="h-8 rounded-[var(--radius-base)] border border-border-strong px-3 text-xs font-medium disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
