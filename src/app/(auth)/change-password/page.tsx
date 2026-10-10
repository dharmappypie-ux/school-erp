import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/app/(auth)/change-password/change-password-form";
import { requireAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { resolveHomeRoute } from "@/lib/permissions";

export const metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const session = await requireAuth();

  // Reachable on purpose by anyone who wants to change their password, so it
  // does not bounce people whose flag is already clear.
  const forced = session.mustChangePassword;

  // Nothing to force and nothing to do is only true of a signed-out visitor,
  // whom requireAuth has already redirected.
  if (!session.userId) redirect(resolveHomeRoute(session.roleKeys));

  return (
    <main className="flex min-h-screen">
      <section className="hidden w-1/2 flex-col justify-between bg-brand p-12 text-white lg:flex">
        <div>
          <p className="text-lg font-semibold">{env.appName}</p>
          <p className="mt-1 text-sm text-white/70">
            Integrated school management
          </p>
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl leading-tight font-semibold">
            {forced
              ? "Choose your own password."
              : "Change your password."}
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/80">
            {forced
              ? "Your account was created with a temporary password that somebody else typed. Replace it before you go any further."
              : "Pick something you do not use anywhere else. Signing in again afterwards confirms it works."}
          </p>

          <ul className="mt-8 space-y-4">
            <li>
              <p className="text-sm font-medium">Only you will know it</p>
              <p className="mt-0.5 text-sm text-white/70">
                Administrators can reset a password; they cannot read one.
              </p>
            </li>
            <li>
              <p className="text-sm font-medium">Other sessions end</p>
              <p className="mt-0.5 text-sm text-white/70">
                Anyone signed in as you elsewhere is signed out.
              </p>
            </li>
          </ul>
        </div>

        <p className="text-xs text-white/50">
          © {new Date().getFullYear()} {env.appName}
        </p>
      </section>

      <section className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-xl font-semibold tracking-tight">
              {forced ? "Set your password" : "Change password"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              Signed in as {session.email}.
            </p>
          </div>

          <ChangePasswordForm />
        </div>
      </section>
    </main>
  );
}
