import { redirect } from "next/navigation";

import { clearExpiredSession } from "@/app/(auth)/session-expired/actions";
import { Button } from "@/components/ui";
import { getSessionContext } from "@/lib/auth";
import { env } from "@/lib/env";
import { resolveHomeRoute } from "@/lib/permissions";

export const metadata = { title: "Session expired" };

const REASSURANCES = [
  {
    title: "Nothing was lost",
    body: "Saved work is saved. Only this browser session ended.",
  },
  {
    title: "Records stay protected",
    body: "Student, fee and staff data is never left open on an idle screen.",
  },
  {
    title: "Signing in again is quick",
    body: "Your account and permissions are unchanged.",
  },
];

export default async function SessionExpiredPage() {
  // Someone who already signed in again — a second tab, or the back button —
  // should not be shown a timeout notice for a session that is now live.
  const session = await getSessionContext();
  if (session) redirect(resolveHomeRoute(session.roleKeys));

  return (
    <main className="flex min-h-screen">
      <section className="hidden w-1/2 flex-col justify-between bg-brand p-12 text-white lg:flex">
        <div>
          <p className="text-lg font-semibold">{env.appName}</p>
          <p className="mt-1 text-sm text-white/70">Integrated school management</p>
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl leading-tight font-semibold">
            Your session was closed for safety.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/80">
            Sessions end automatically after {env.sessionTtlHours} hours. School
            systems are used on shared staffroom and front-office machines, so a
            screen left unattended should not stay signed in.
          </p>

          <ul className="mt-8 space-y-4">
            {REASSURANCES.map((item) => (
              <li key={item.title}>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-0.5 text-sm text-white/70">{item.body}</p>
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
          <div
            aria-hidden
            className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-warning-soft text-warning"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </div>

          <h2 className="text-xl font-semibold tracking-tight">Session expired</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            You have been signed out after {env.sessionTtlHours} hours. Sign in
            again to pick up where you left off.
          </p>

          {/* A form rather than a link: the stale cookie has to be cleared on
              the server, or the next protected page sends them back here. */}
          <form action={clearExpiredSession} className="mt-6">
            <Button type="submit" className="w-full">
              Sign in again
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted">
            Not expecting this? Your school administrator can check recent
            sign-ins.
          </p>
        </div>
      </section>
    </main>
  );
}
