import Link from "next/link";

import { env } from "@/lib/env";

export const metadata = {
  title: "Pricing",
  description:
    "Simple per-student pricing for Vidyalaya ERP — from a free trial to an enterprise plan for school networks.",
};

const PLANS: {
  name: string;
  price: string;
  unit: string;
  blurb: string;
  featured?: boolean;
  cta: string;
  features: string[];
}[] = [
  {
    name: "Trial",
    price: "Free",
    unit: "for 30 days",
    blurb: "Explore the whole platform with sample data.",
    cta: "Start free",
    features: [
      "All core modules",
      "Up to 50 students",
      "Parent & student portal",
      "Email support",
    ],
  },
  {
    name: "Standard",
    price: "₹40",
    unit: "per student / year",
    blurb: "Everything a single school needs to run day to day.",
    featured: true,
    cta: "Request a demo",
    features: [
      "All modules incl. LMS",
      "Transport & hostel",
      "WhatsApp / SMS broadcasts",
      "Analytics dashboards",
      "Priority support",
    ],
  },
  {
    name: "Premium",
    price: "₹65",
    unit: "per student / year",
    blurb: "Add AI insight and deeper reporting.",
    cta: "Request a demo",
    features: [
      "Everything in Standard",
      "AI dropout-risk prediction",
      "Ask-your-data reporting",
      "Biometric attendance",
      "Custom report builder",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    unit: "for school networks",
    blurb: "Multi-school management under one platform owner.",
    cta: "Talk to sales",
    features: [
      "Everything in Premium",
      "Multi-school console",
      "Central administration",
      "SSO & custom onboarding",
      "Dedicated success manager",
    ],
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="border-b border-border bg-gradient-to-b from-brand-soft/40 to-surface">
        <div className="mx-auto max-w-6xl px-5 py-16 text-center sm:py-20">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Pricing that scales with your school.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-strong">
            Pay for the students you have. No setup fees, no per-module add-ons —
            every plan includes the full portal for parents and students.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-5 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`flex flex-col rounded-[var(--radius-lg,0.75rem)] border bg-surface p-6 ${
                plan.featured ? "border-brand ring-1 ring-brand" : "border-border"
              }`}
            >
              {plan.featured ? (
                <span className="mb-3 inline-flex w-fit rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand">
                  Most popular
                </span>
              ) : null}
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              <p className="mt-1 text-sm text-muted">{plan.blurb}</p>
              <div className="mt-5">
                <span className="text-3xl font-semibold tracking-tight">{plan.price}</span>
                <span className="ml-1.5 text-sm text-muted">{plan.unit}</span>
              </div>

              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-muted-strong">
                    <svg viewBox="0 0 24 24" aria-hidden className="mt-0.5 h-4 w-4 shrink-0 fill-brand">
                      <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              <a
                href="mailto:hello@vidyalaya.example?subject=Vidyalaya%20ERP%20enquiry"
                className={`mt-6 inline-flex h-10 items-center justify-center rounded-[var(--radius-base)] px-4 text-sm font-medium transition-colors ${
                  plan.featured
                    ? "bg-brand text-brand-foreground hover:bg-brand-hover"
                    : "border border-border-strong bg-surface text-foreground hover:bg-surface-hover"
                }`}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-muted">
          Prices are indicative and billed annually. Volume discounts apply for
          large schools —{" "}
          <Link href="/contact" className="font-medium text-brand hover:underline">
            contact us
          </Link>{" "}
          for a quote.
        </p>
      </section>

      <section className="border-t border-border bg-surface-muted">
        <div className="mx-auto max-w-3xl px-5 py-16">
          <h2 className="text-center text-2xl font-semibold tracking-tight">Common questions</h2>
          <dl className="mt-8 space-y-6">
            {[
              ["Is there a setup fee?", `No. ${env.appName} includes onboarding and data import in every paid plan.`],
              ["Can parents and students use it for free?", "Yes — the portal is included in every plan at no extra cost."],
              ["What boards do you support?", "CBSE, ICSE and State boards, with GST-compliant invoicing."],
              ["Can we run multiple schools?", "Yes — the Enterprise plan adds a multi-school console under one owner."],
            ].map(([q, a]) => (
              <div key={q} className="rounded-[var(--radius-lg,0.75rem)] border border-border bg-surface p-5">
                <dt className="font-semibold">{q}</dt>
                <dd className="mt-1.5 text-sm text-muted-strong">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
