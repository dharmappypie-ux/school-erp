import Link from "next/link";

import { getSessionContext } from "@/lib/auth";
import { env } from "@/lib/env";
import { resolveHomeRoute } from "@/lib/permissions";

/**
 * Public marketing chrome. Sits outside the authenticated `(app)` shell, so
 * these pages render with no session and no sidebar. The sign-in button becomes
 * "Go to dashboard" when a session already exists, so a logged-in visitor who
 * lands on the marketing site is not asked to sign in again.
 */

const NAV = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
];

const FOOTER = {
  Product: [
    { href: "/features", label: "Features" },
    { href: "/pricing", label: "Pricing" },
    { href: "/login", label: "Sign in" },
  ],
  Modules: [
    { href: "/features#academics", label: "Academics & LMS" },
    { href: "/features#finance", label: "Fees & payroll" },
    { href: "/features#intelligence", label: "AI insight" },
  ],
  Company: [
    { href: "/contact", label: "Contact us" },
    { href: "mailto:hello@vidyalaya.example", label: "Request a demo" },
  ],
};

export default async function MarketingLayout({ children }: LayoutProps<"/">) {
  const session = await getSessionContext();
  const ctaHref = session ? resolveHomeRoute(session.roleKeys) : "/login";
  const ctaLabel = session ? "Go to dashboard" : "Sign in";

  return (
    <div className="flex min-h-screen flex-col bg-surface text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-base)] bg-brand text-sm font-bold text-brand-foreground">
              V
            </span>
            <span className="text-base font-semibold tracking-tight">{env.appName}</span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-muted-strong transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Link
            href={ctaHref}
            className="inline-flex h-9.5 items-center rounded-[var(--radius-base)] bg-brand px-4 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-hover"
          >
            {ctaLabel}
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border bg-surface-muted">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-base)] bg-brand text-sm font-bold text-brand-foreground">
                V
              </span>
              <span className="text-base font-semibold">{env.appName}</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted">
              The complete operating system for modern schools — admissions to
              alumni, on one platform.
            </p>
          </div>

          {Object.entries(FOOTER).map(([heading, links]) => (
            <div key={heading}>
              <p className="text-xs font-semibold tracking-wide text-muted-strong uppercase">
                {heading}
              </p>
              <ul className="mt-3 space-y-2">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-muted hover:text-foreground">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} {env.appName}. All rights reserved.</p>
            <p>Made for schools in India · GST-ready · CBSE / ICSE / State boards</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
