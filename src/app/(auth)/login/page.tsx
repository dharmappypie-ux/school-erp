import { redirect } from "next/navigation";

import { LoginForm } from "@/app/(auth)/login/login-form";
import { getSessionContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { resolveHomeRoute } from "@/lib/permissions";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await getSessionContext();
  if (session) redirect(resolveHomeRoute(session.roleKeys));

  const schools = await prisma.school.findMany({
    where: { isActive: true },
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <main className="flex min-h-screen">
      {/* Brand panel — hidden on small screens where it would only push the form down. */}
      <section className="hidden w-1/2 flex-col justify-between bg-brand p-12 text-white lg:flex">
        <div>
          <p className="text-lg font-semibold">{env.appName}</p>
          <p className="mt-1 text-sm text-white/70">
            Integrated school management
          </p>
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl leading-tight font-semibold">
            Every part of your school, in one system.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/80">
            Admissions, attendance, fees, examinations, transport, hostel,
            library and payroll — with AI insight on the students who need
            attention first.
          </p>
          <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm text-white/80">
            {[
              "Online admissions",
              "Biometric attendance",
              "Online fee collection",
              "Report cards",
              "Live bus tracking",
              "WhatsApp & SMS alerts",
              "Payroll",
              "Dropout-risk prediction",
            ].map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                <span aria-hidden className="text-white/50">
                  •
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/50">
          © {new Date().getFullYear()} {env.appName}
        </p>
      </section>

      <section className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
            <p className="mt-1 text-sm text-muted">
              Use the account issued by your school.
            </p>
          </div>

          <LoginForm schools={schools} />
        </div>
      </section>
    </main>
  );
}
