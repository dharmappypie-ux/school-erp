"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  AccountAvatar,
  AccountDrawer,
  type AccountFact,
} from "@/components/account-menu";
import { cn } from "@/components/ui";
import { ICONS, type NavGroup } from "@/lib/navigation";

const COLLAPSE_KEY = "sidebar-collapsed";
const COLLAPSE_EVENT = "sidebar-collapse-change";

function subscribeToCollapse(onChange: () => void): () => void {
  window.addEventListener(COLLAPSE_EVENT, onChange);
  window.addEventListener("storage", onChange); // other tabs
  return () => {
    window.removeEventListener(COLLAPSE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readCollapse(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function toggleCollapse(): void {
  const next = !readCollapse();
  try {
    localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  } catch {
    // Private browsing can block localStorage; the toggle still works for this
    // page view via the dispatched event below.
  }
  window.dispatchEvent(new Event(COLLAPSE_EVENT));
}

// Which nav accordions are collapsed. Stored as a comma-joined list of group
// labels; read as a stable primitive string so useSyncExternalStore is happy,
// then parsed into a Set in the component.
const NAV_GROUPS_KEY = "nav-collapsed-groups";
const NAV_GROUPS_EVENT = "nav-collapsed-groups-change";

function subscribeToNavGroups(onChange: () => void): () => void {
  window.addEventListener(NAV_GROUPS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(NAV_GROUPS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readNavGroupsRaw(): string {
  try {
    return localStorage.getItem(NAV_GROUPS_KEY) ?? "";
  } catch {
    return "";
  }
}

function toggleNavGroup(label: string): void {
  const set = new Set(readNavGroupsRaw().split(",").filter(Boolean));
  if (set.has(label)) set.delete(label);
  else set.add(label);
  try {
    localStorage.setItem(NAV_GROUPS_KEY, [...set].join(","));
  } catch {
    // Ignore — the toggle still works for this page view.
  }
  window.dispatchEvent(new Event(NAV_GROUPS_EVENT));
}

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
  account,
  school,
  academicYear,
  children,
}: {
  navigation: NavGroup[];
  user: {
    name: string;
    email: string;
    initials: string;
    roleLabel: string;
    avatarUrl: string | null;
  };
  account: {
    facts: AccountFact[];
    profileHref: string | null;
    profileLabel: string | null;
  };
  school: { name: string; slug: string };
  academicYear: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  // The collapse preference lives in localStorage, read through
  // useSyncExternalStore — the same idiom this shell uses for the theme. That
  // keeps the source of truth outside React state (so there's no setState in an
  // effect) and lets the server snapshot default to expanded without a
  // hydration mismatch.
  const collapsed = useSyncExternalStore(
    subscribeToCollapse,
    readCollapse,
    () => false,
  );

  // Accordion state for the nav groups — a primitive string from the store,
  // parsed once per change into a Set the render can test against.
  const navGroupsRaw = useSyncExternalStore(
    subscribeToNavGroups,
    readNavGroupsRaw,
    () => "",
  );
  const collapsedGroups = useMemo(
    () => new Set(navGroupsRaw.split(",").filter(Boolean)),
    [navGroupsRaw],
  );

  // Stable so the drawer's focus-restore effect doesn't re-run every render.
  const closeAccount = useCallback(() => setAccountOpen(false), []);

  // `mini` collapses the sidebar to icons; only the desktop rail uses it, the
  // mobile drawer always shows the full sidebar.
  const renderSidebar = (mini: boolean) => (
    <nav className="scroll-slim flex h-full flex-col overflow-y-auto">
      <div
        className={cn(
          "flex items-center gap-2.5 px-4 py-4",
          mini ? "justify-center px-0" : "",
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-white">
          {school.name.charAt(0)}
        </span>
        {!mini ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {school.name}
            </span>
            <span className="block truncate text-[11px] text-muted">
              {academicYear ? `AY ${academicYear}` : "No academic year set"}
            </span>
          </span>
        ) : null}
      </div>

      <div className={cn("flex-1 space-y-5 pb-6", mini ? "px-2" : "px-2.5")}>
        {navigation.map((group) => {
          // Accordions only apply to the expanded rail; the collapsed icon rail
          // has no group headers to toggle, so its items always show.
          const groupCollapsed = !mini && collapsedGroups.has(group.label);
          return (
          <div key={group.label}>
            {!mini ? (
              <button
                type="button"
                onClick={() => toggleNavGroup(group.label)}
                aria-expanded={!groupCollapsed}
                className="flex w-full items-center justify-between rounded-[var(--radius-base)] px-2.5 pb-1.5 pt-0.5 text-left transition-colors hover:text-muted-strong"
              >
                <span className="text-[10px] font-semibold tracking-wider text-muted uppercase">
                  {group.label}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  className={cn(
                    "h-3 w-3 fill-current text-muted transition-transform",
                    groupCollapsed ? "-rotate-90" : "",
                  )}
                >
                  <path d="M7 10l5 5 5-5z" />
                </svg>
              </button>
            ) : (
              <div className="mx-2 mb-1.5 border-t border-border" aria-hidden />
            )}
            <ul className={cn("space-y-0.5", groupCollapsed ? "hidden" : "")}>
              {group.items.map((item) => {
                const active = isActive(pathname, item.href, item.exact);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setNavOpen(false)}
                      aria-current={active ? "page" : undefined}
                      // In the collapsed rail the label is visual-only-hidden,
                      // so the accessible name comes from the title + aria-label.
                      title={mini ? item.label : undefined}
                      aria-label={mini ? item.label : undefined}
                      className={cn(
                        "flex items-center rounded-[var(--radius-base)] text-[13px] transition-colors",
                        mini ? "justify-center px-0 py-2.5" : "gap-2.5 px-2.5 py-2",
                        active
                          ? "bg-brand-soft font-medium text-brand"
                          : "text-muted-strong hover:bg-surface-hover hover:text-foreground",
                      )}
                    >
                      <Icon name={item.icon} />
                      {!mini ? <span className="truncate">{item.label}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
          );
        })}
      </div>

      {/* Account, pinned at the foot of the sidebar (Zoho-style). Opens the
          same drawer as the mobile header avatar. */}
      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={() => {
            setNavOpen(false);
            setAccountOpen(true);
          }}
          aria-label="Account menu"
          aria-haspopup="dialog"
          className={cn(
            "flex w-full items-center rounded-[var(--radius-base)] transition-colors hover:bg-surface-hover",
            mini ? "justify-center p-1.5" : "gap-2.5 p-2",
          )}
        >
          <AccountAvatar initials={user.initials} avatarUrl={user.avatarUrl} />
          {!mini ? (
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[13px] font-medium">
                {user.name}
              </span>
              <span className="block truncate text-[11px] text-muted">
                {user.roleLabel}
              </span>
            </span>
          ) : null}
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "no-print sticky top-0 hidden h-screen shrink-0 border-r border-border bg-surface transition-[width] duration-200 lg:block",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className="relative h-full">
          {renderSidebar(collapsed)}
          {/* Collapse toggle — sits on the rail's edge, desktop only. */}
          <button
            type="button"
            onClick={toggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
            className="absolute -right-3 top-5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-muted-strong shadow-[var(--shadow-sm)] hover:bg-surface-hover"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              className={cn("h-3.5 w-3.5 fill-current transition-transform", collapsed ? "rotate-180" : "")}
            >
              <path d="M14 7l-5 5 5 5z" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {navOpen ? (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/40"
            onClick={() => setNavOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border bg-surface">
            {renderSidebar(false)}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            className="rounded-[var(--radius-base)] border border-border p-2 text-muted-strong lg:hidden"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current">
              <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
            </svg>
          </button>

          <div className="min-w-0 flex-1" />

          <ThemeToggle />

          {/* Account is reachable from the top-right on every viewport — the
              quickest place to reach it — and also from the sidebar foot; both
              open the same drawer. */}
          <button
            type="button"
            onClick={() => setAccountOpen(true)}
            aria-label="Account menu"
            aria-haspopup="dialog"
            className="flex items-center gap-2 rounded-full py-0.5 pr-0.5 pl-2 transition-colors hover:bg-surface-hover"
          >
            <span className="hidden text-right sm:block">
              <span className="block text-[13px] leading-tight font-medium">
                {user.name}
              </span>
              <span className="block text-[11px] leading-tight text-muted">
                {user.roleLabel}
              </span>
            </span>
            <AccountAvatar initials={user.initials} avatarUrl={user.avatarUrl} />
          </button>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>

      <AccountDrawer
        open={accountOpen}
        onClose={closeAccount}
        name={user.name}
        email={user.email}
        initials={user.initials}
        avatarUrl={user.avatarUrl}
        roleLabel={user.roleLabel}
        facts={account.facts}
        profileHref={account.profileHref}
        profileLabel={account.profileLabel}
        school={{ name: school.name }}
        academicYear={academicYear}
      />
    </div>
  );
}
