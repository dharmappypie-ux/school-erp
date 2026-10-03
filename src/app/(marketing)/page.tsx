import Link from "next/link";

import { env } from "@/lib/env";
import { ICONS } from "@/lib/navigation";

export const metadata = {
  title: "School management, all in one place",
  description:
    "Vidyalaya ERP runs every part of your school — admissions, attendance, fees, exams, transport, hostel, library, payroll, an LMS and AI insight — on a single platform.",
};

const MODULES: { icon: keyof typeof ICONS; title: string; body: string }[] = [
  { icon: "admissions", title: "Admissions", body: "Enquiry to enrolment, with online applications and a decision pipeline." },
  { icon: "attendance", title: "Attendance", body: "Daily and period attendance, biometric devices and absentee alerts." },
  { icon: "fees", title: "Fees & billing", body: "Structures, invoices, online collection, concessions and refunds." },
  { icon: "exams", title: "Exams & report cards", body: "Grading schemes, mark entry, auto-graded worksheets and report cards." },
  { icon: "courses", title: "Courses & LMS", body: "Digital lessons, resources and per-student progress in the portal." },
  { icon: "transport", title: "Transport", body: "Routes, vehicles, student assignments and live bus tracking." },
  { icon: "library", title: "Library", body: "Catalogue, copies and circulation with issue and return." },
  { icon: "hostel", title: "Hostel", body: "Blocks, rooms and allocations with warden oversight." },
  { icon: "hr", title: "HR & payroll", body: "Staff records, leave, salary structures and payslips." },
  { icon: "comms", title: "Communication", body: "Notices, direct messages and WhatsApp / SMS / email broadcasts." },
  { icon: "analytics", title: "Analytics", body: "Dashboards for leadership across every part of the school." },
  { icon: "ai", title: "AI insight", body: "Dropout-risk prediction and natural-language questions on your data." },
];

function ModuleIcon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 fill-brand">
      <path d={ICONS[name]} />
    </svg>
  );
}

export default function MarketingHome() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-brand-soft/40 to-surface">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-strong">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" /> New — built-in LMS & AI insight
            </span>
            <h1 className="mt-5 text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl">
              Every part of your school, in one system.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-strong">
              {env.appName} brings admissions, academics, fees, examinations,
              transport, hostel, library, payroll, a learning platform and AI
              insight together — so your team stops juggling spreadsheets and
              starts running the school.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="inline-flex h-11 items-center rounded-[var(--radius-base)] bg-brand px-6 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-hover"
              >
                Sign in
              </Link>
              <a
                href="mailto:hello@vidyalaya.example?subject=Vidyalaya%20ERP%20demo%20request"
                className="inline-flex h-11 items-center rounded-[var(--radius-base)] border border-border-strong bg-surface px-6 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
              >
                Request a demo
              </a>
            </div>
            <p className="mt-4 text-xs text-muted">
              CBSE, ICSE and State board ready · GST-compliant invoicing · Works on any device
            </p>
          </div>
        </div>
      </section>

      {/* Stat band */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-12 sm:grid-cols-4">
          {[
            { value: "12+", label: "Integrated modules" },
            { value: "1", label: "Login for the whole school" },
            { value: "24/7", label: "Parent & student portal" },
            { value: "AI", label: "At-risk student alerts" },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-3xl font-semibold tracking-tight text-brand">{stat.value}</p>
              <p className="mt-1 text-sm text-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Modules grid */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight">One platform, every department</h2>
          <p className="mt-3 text-muted-strong">
            Purpose-built modules that share the same data, so a student admitted
            in the morning is on the class roll, the fee ledger and the bus route
            by the afternoon.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((module) => (
            <div
              key={module.title}
              className="rounded-[var(--radius-lg,0.75rem)] border border-border bg-surface p-5 transition-colors hover:border-brand"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-base)] bg-brand-soft">
                <ModuleIcon name={module.icon} />
              </div>
              <h3 className="mt-4 text-base font-semibold">{module.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{module.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Intelligence highlight */}
      <section className="border-y border-border bg-surface-muted">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-20 lg:grid-cols-2">
          <div>
            <span className="text-xs font-semibold tracking-wide text-brand uppercase">
              Intelligence
            </span>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              The students who need attention, first.
            </h2>
            <p className="mt-4 text-muted-strong">
              {env.appName} watches attendance, marks and fees together to flag
              students at risk of falling behind — and lets your leadership ask
              plain-English questions of the whole school&apos;s data.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Dropout-risk prediction with clear, explainable signals",
                "Ask-your-data: natural-language reporting, no SQL",
                "Leadership dashboards across academics, finance and operations",
                "Auto-graded worksheets that save teachers marking time",
              ].map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm">
                  <svg viewBox="0 0 24 24" aria-hidden className="mt-0.5 h-5 w-5 shrink-0 fill-brand">
                    <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                  </svg>
                  <span className="text-muted-strong">{point}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[var(--radius-lg,0.75rem)] border border-border bg-surface p-6 shadow-sm">
            <div className="space-y-4">
              {[
                { label: "At-risk students", value: "7", tone: "text-danger" },
                { label: "Attendance this week", value: "94%", tone: "text-brand" },
                { label: "Fees collected", value: "₹42.6L", tone: "text-foreground" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between border-b border-border pb-4 last:border-0 last:pb-0">
                  <span className="text-sm text-muted">{row.label}</span>
                  <span className={`text-2xl font-semibold ${row.tone}`}>{row.value}</span>
                </div>
              ))}
            </div>
            <p className="mt-5 rounded-[var(--radius-base)] bg-surface-muted px-3 py-2.5 text-xs text-muted">
              &ldquo;Which class 9 students have both dropping attendance and
              unpaid fees?&rdquo; → answered instantly.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="rounded-[var(--radius-lg,0.75rem)] bg-brand px-8 py-14 text-center text-brand-foreground">
          <h2 className="text-3xl font-semibold tracking-tight">Ready to run your school on one platform?</h2>
          <p className="mx-auto mt-3 max-w-xl text-brand-foreground/80">
            See {env.appName} with your own school&apos;s workflows. Book a walkthrough
            with our team.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="mailto:hello@vidyalaya.example?subject=Vidyalaya%20ERP%20demo%20request"
              className="inline-flex h-11 items-center rounded-[var(--radius-base)] bg-surface px-6 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
            >
              Request a demo
            </a>
            <Link
              href="/pricing"
              className="inline-flex h-11 items-center rounded-[var(--radius-base)] border border-brand-foreground/30 px-6 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-hover"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
