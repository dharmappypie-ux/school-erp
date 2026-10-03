import Link from "next/link";

import { env } from "@/lib/env";

export const metadata = {
  title: "Features",
  description:
    "Every module in Vidyalaya ERP — people, academics, an LMS, finance, operations, engagement and AI intelligence.",
};

const GROUPS: { id: string; title: string; blurb: string; items: [string, string][] }[] = [
  {
    id: "people",
    title: "People",
    blurb: "The records everything else is built on.",
    items: [
      ["Students & guardians", "Full profiles, documents, custom fields and family links."],
      ["Staff & HR", "Employee records, departments, designations and leave."],
      ["Admissions", "Online enquiry and application, with a decision pipeline and offer letters."],
    ],
  },
  {
    id: "academics",
    title: "Academics & LMS",
    blurb: "From the class roll to the report card — and now, digital learning.",
    items: [
      ["Classes & subjects", "Class levels, sections, curriculum mapping and teaching loads."],
      ["Attendance", "Daily and period attendance, biometric devices and absentee alerts."],
      ["Timetable", "Period grids, substitutions and clash-free generation."],
      ["Exams & report cards", "Grading schemes, mark entry and published report cards."],
      ["Homework & worksheets", "Assignments and auto-graded online worksheets."],
      ["Courses (LMS)", "Structured lessons, resources and per-student progress in the portal."],
    ],
  },
  {
    id: "finance",
    title: "Finance",
    blurb: "Money in, money out — audit-ready.",
    items: [
      ["Fees & invoicing", "Structures, concessions, online collection, receipts and refunds."],
      ["Expenses", "Vouchers, categories and approvals."],
      ["Payroll", "Salary structures, payslips and statutory components."],
    ],
  },
  {
    id: "operations",
    title: "Operations",
    blurb: "The day-to-day logistics of a campus.",
    items: [
      ["Transport", "Routes, vehicles, assignments and live bus tracking."],
      ["Library", "Catalogue, copies and issue / return circulation."],
      ["Hostel", "Blocks, rooms, allocations and warden oversight."],
      ["Leave", "Requests, approvals and balances for staff."],
    ],
  },
  {
    id: "engagement",
    title: "Engagement",
    blurb: "Keep parents and students in the loop.",
    items: [
      ["Notices", "Targeted announcements to classes, roles or the whole school."],
      ["Messaging", "Secure one-to-one and group conversations."],
      ["Broadcasts", "WhatsApp, SMS and email at scale."],
      ["Parent & student portal", "Attendance, results, fees, homework and courses, 24/7."],
    ],
  },
  {
    id: "intelligence",
    title: "Intelligence",
    blurb: "Turn the school's data into decisions.",
    items: [
      ["Analytics", "Leadership dashboards across every module."],
      ["AI insight", "Dropout-risk prediction with explainable signals."],
      ["Ask your data", "Natural-language questions, answered without SQL."],
      ["Custom reports", "Build, save and schedule the reports you need."],
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <section className="border-b border-border bg-gradient-to-b from-brand-soft/40 to-surface">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Everything a school runs on, in one place.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-strong">
            {env.appName} is not a bundle of disconnected tools. Every module
            shares the same data, so information entered once is correct
            everywhere.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 py-16">
        {GROUPS.map((group, index) => (
          <section
            key={group.id}
            id={group.id}
            className={`scroll-mt-20 ${index > 0 ? "mt-16 border-t border-border pt-16" : ""}`}
          >
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight">{group.title}</h2>
              <p className="mt-2 text-muted-strong">{group.blurb}</p>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map(([title, body]) => (
                <div key={title} className="rounded-[var(--radius-lg,0.75rem)] border border-border bg-surface p-5">
                  <h3 className="text-base font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="border-t border-border bg-surface-muted">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-16 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">See it with your own data</h2>
          <p className="max-w-xl text-muted-strong">
            Book a walkthrough and we&apos;ll show you {env.appName} configured for
            your school&apos;s workflows.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <a
              href="mailto:hello@vidyalaya.example?subject=Vidyalaya%20ERP%20demo%20request"
              className="inline-flex h-11 items-center rounded-[var(--radius-base)] bg-brand px-6 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
            >
              Request a demo
            </a>
            <Link
              href="/pricing"
              className="inline-flex h-11 items-center rounded-[var(--radius-base)] border border-border-strong bg-surface px-6 text-sm font-medium hover:bg-surface-hover"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
