"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";

import { cn } from "@/components/ui";
import { ICONS, type NavGroup } from "@/lib/navigation";

function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("h-4.5 w-4.5 shrink-0 fill-current", className)}
    >
      <path d={ICONS[name] ?? ICONS.dashboard} />
    </svg>
  );
}

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The theme lives on `<html>`, set by an inline script before first paint.
 * That element is the source of truth, so it is read through
 * `useSyncExternalStore` rather than mirrored into React state — which would
 * mean writing state from an effect and re-rendering twice on every mount.
 */
function subscribeToTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribeToTheme,
    () => document.documentElement.classList.contains("dark"),
    () => false, // The server cannot know the visitor's theme.
  );

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Private browsing can block localStorage; the toggle still works for
      // this page view.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="rounded-[var(--radius-base)] border border-border p-2 text-muted-strong hover:bg-surface-hover"
    >
      <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current">
        {dark ? (
          <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5v3m0 14v3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M2 12h3m14 0h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
        ) : (
          <path d="M12.3 2a9 9 0 1 0 9.7 11.5A7.5 7.5 0 0 1 12.3 2z" />
        )}
      </svg>
    </button>
  );
}

export function AppShell({
  navigation,
  user,
  school,
  academicYear,
  children,
}: {
  navigation: NavGroup[];
  user: { name: string; email: string; initials: string; roles: string[] };
  school: { name: string; slug: string };
  academicYear: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const sidebar = (
    <nav className="scroll-slim flex h-full flex-col overflow-y-auto">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-white">
          {school.name.charAt(0)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">
            {school.name}
          </span>
          <span className="block truncate text-[11px] text-muted">
            {academicYear ? `AY ${academicYear}` : "No academic year set"}
          </span>
        </span>
      </div>

      <div className="flex-1 space-y-5 px-2.5 pb-6">
        {navigation.map((group) => (
          <div key={group.label}>
            <p className="px-2.5 pb-1.5 text-[10px] font-semibold tracking-wider text-muted uppercase">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href, item.exact);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      // Dismiss the mobile drawer on navigation. Handled here
                      // rather than in an effect on `pathname`.
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-[var(--radius-base)] px-2.5 py-2 text-[13px] transition-colors",
                        active
                          ? "bg-brand-soft font-medium text-brand"
                          : "text-muted-strong hover:bg-surface-hover hover:text-foreground",
                      )}
                    >
                      <Icon name={item.icon} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 border-r border-border bg-surface lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border bg-surface">
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            className="rounded-[var(--radius-base)] border border-border p-2 text-muted-strong lg:hidden"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current">
              <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
            </svg>
          </button>

          <div className="min-w-0 flex-1" />

          <ThemeToggle />

          <div className="flex items-center gap-2.5 border-l border-border pl-3">
            <div className="hidden text-right sm:block">
              <p className="text-[13px] leading-tight font-medium">{user.name}</p>
              <p className="text-[11px] leading-tight text-muted">
                {user.roles.join(", ")}
              </p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
              {user.initials}
            </span>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                title="Sign out"
                aria-label="Sign out"
                className="rounded-[var(--radius-base)] border border-border p-2 text-muted-strong hover:bg-surface-hover"
              >
                <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current">
                  <path d="M17 7l-1.4 1.4L18.2 11H8v2h10.2l-2.6 2.6L17 17l5-5-5-5zM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4V5z" />
                </svg>
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
