import { env } from "@/lib/env";

export const metadata = {
  title: "Contact",
  description: "Get in touch with the Vidyalaya ERP team for a demo, a quote or support.",
};

const CHANNELS: { label: string; value: string; href: string; note: string }[] = [
  {
    label: "Sales & demos",
    value: "hello@vidyalaya.example",
    href: "mailto:hello@vidyalaya.example?subject=Vidyalaya%20ERP%20demo%20request",
    note: "See the platform with your school's workflows.",
  },
  {
    label: "Support",
    value: "support@vidyalaya.example",
    href: "mailto:support@vidyalaya.example",
    note: "For schools already using Vidyalaya ERP.",
  },
  {
    label: "Phone",
    value: "+91 98765 43210",
    href: "tel:+919876543210",
    note: "Mon–Sat, 9:00 – 18:00 IST.",
  },
];

export default function ContactPage() {
  return (
    <>
      <section className="border-b border-border bg-gradient-to-b from-brand-soft/40 to-surface">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Talk to us.</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-strong">
            Whether you&apos;re comparing platforms or ready to move your school onto
            {" "}{env.appName}, we&apos;re here to help.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Get in touch</h2>
            <p className="mt-2 text-muted-strong">
              Reach the right team directly. We usually reply within one working day.
            </p>

            <div className="mt-8 space-y-4">
              {CHANNELS.map((channel) => (
                <a
                  key={channel.label}
                  href={channel.href}
                  className="block rounded-[var(--radius-lg,0.75rem)] border border-border bg-surface p-5 transition-colors hover:border-brand"
                >
                  <p className="text-xs font-semibold tracking-wide text-muted-strong uppercase">
                    {channel.label}
                  </p>
                  <p className="mt-1 text-lg font-medium text-brand">{channel.value}</p>
                  <p className="mt-1 text-sm text-muted">{channel.note}</p>
                </a>
              ))}
            </div>
          </div>

          <div className="rounded-[var(--radius-lg,0.75rem)] border border-border bg-surface-muted p-6">
            <h2 className="text-lg font-semibold">Request a demo</h2>
            <p className="mt-2 text-sm text-muted-strong">
              Tell us a little about your school and we&apos;ll set up a walkthrough.
              Email us with:
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted-strong">
              {[
                "School name and city",
                "Board (CBSE / ICSE / State)",
                "Approximate number of students",
                "The modules you're most interested in",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  {item}
                </li>
              ))}
            </ul>
            <a
              href="mailto:hello@vidyalaya.example?subject=Vidyalaya%20ERP%20demo%20request&body=School%20name%3A%0ACity%3A%0ABoard%3A%0AStudents%3A%0AModules%20of%20interest%3A"
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-base)] bg-brand px-6 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-hover"
            >
              Compose demo request
            </a>
            <p className="mt-3 text-xs text-muted">
              This opens your email app with the details pre-filled — nothing is
              sent until you press send.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
