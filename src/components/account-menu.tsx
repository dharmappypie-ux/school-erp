"use client";

import Link from "next/link";

import { cn } from "@/components/ui";
import { SlideOver } from "@/components/slide-over";

export interface AccountFact {
  label: string;
  value: string;
}

export interface AccountDrawerProps {
  open: boolean;
  onClose: () => void;
  name: string;
  email: string;
  initials: string;
  avatarUrl: string | null;
  roleLabel: string;
  facts: AccountFact[];
  profileHref: string | null;
  profileLabel: string | null;
  school: { name: string };
  academicYear: string | null;
}

/**
 * The account panel — the signed-in person's details in a right slide-in
 * drawer. Sign-out is a real POST form because the session cookie is httpOnly
 * and cannot be cleared from JavaScript.
 */
export function AccountDrawer({
  open,
  onClose,
  name,
  email,
  initials,
  avatarUrl,
  roleLabel,
  facts,
  profileHref,
  profileLabel,
  school,
  academicYear,
}: AccountDrawerProps) {
  return (
    <SlideOver open={open} onClose={onClose} label="Account" width="w-80">
      <div className="flex items-start gap-3 border-b border-border px-5 py-5">
        <AccountAvatar initials={initials} avatarUrl={avatarUrl} large />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{name}</span>
          <span className="block truncate text-xs text-muted">{email}</span>
          <span className="mt-1 inline-block rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
            {roleLabel}
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-[var(--radius-base)] p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current">
            <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z" />
          </svg>
        </button>
      </div>

      <dl className="grid flex-1 grid-cols-2 content-start gap-x-3 gap-y-3.5 overflow-y-auto px-5 py-4 text-xs">
        <div className="col-span-2">
          <dt className="text-[11px] text-muted">School</dt>
          <dd className="font-medium">{school.name}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[11px] text-muted">Academic year</dt>
          <dd className="font-medium">{academicYear ?? "—"}</dd>
        </div>
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0">
            <dt className="text-[11px] text-muted">{fact.label}</dt>
            <dd className="truncate font-medium">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-1 border-t border-border p-3">
        {profileHref ? (
          <Link
            href={profileHref}
            onClick={onClose}
            className="rounded-[var(--radius-base)] px-3 py-2 text-sm font-medium text-muted-strong transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            {profileLabel}
          </Link>
        ) : null}
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-[var(--radius-base)] px-3 py-2 text-left text-sm font-medium text-danger transition-colors hover:bg-danger-soft"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current">
              <path d="M17 7l-1.4 1.4L18.2 11H8v2h10.2l-2.6 2.6L17 17l5-5-5-5zM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4V5z" />
            </svg>
            Sign out
          </button>
        </form>
      </div>
    </SlideOver>
  );
}

export function AccountAvatar({
  initials,
  avatarUrl,
  large,
}: {
  initials: string;
  avatarUrl: string | null;
  large?: boolean;
}) {
  const size = large ? "h-11 w-11 text-base" : "h-8 w-8 text-xs";
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        loading="lazy"
        className={cn("shrink-0 rounded-full object-cover", size)}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand",
        size,
      )}
    >
      {initials}
    </span>
  );
}
