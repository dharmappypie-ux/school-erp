import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const metadata = { title: "Access denied" };

export default async function ForbiddenPage({
  searchParams,
}: PageProps<"/forbidden">) {
  const session = await requireAuth();
  const params = await searchParams;
  const requiredRaw = typeof params.required === "string" ? params.required : "";
  const required = requiredRaw.split(",").filter(Boolean);

  return (
    <>
      <PageHeader
        title="You don't have access to that page"
        description="Your account is signed in, but this area needs a permission you haven't been granted."
      />

      <Card className="max-w-xl px-5 py-5">
        {required.length > 0 ? (
          <>
            <p className="text-sm text-muted-strong">
              This page requires:
            </p>
            <ul className="mt-2 space-y-1.5">
              {required.map((key) => (
                <li key={key} className="text-sm">
                  <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs">
                    {key}
                  </code>
                  <span className="ml-2 text-muted">
                    {PERMISSIONS[key as keyof typeof PERMISSIONS] ?? "Custom permission"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <p className="mt-5 border-t border-border pt-4 text-sm text-muted">
          You are signed in as <strong className="text-foreground">{session.email}</strong>.
          Ask an administrator at {session.school.name} to grant the permission, or
          switch to an account that has it.
        </p>

        <div className="mt-5 flex gap-2">
          <ButtonLink href="/dashboard">Back to dashboard</ButtonLink>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="inline-flex h-9.5 items-center rounded-[var(--radius-base)] border border-border-strong px-4 text-sm font-medium hover:bg-surface-hover"
            >
              Sign out
            </button>
          </form>
        </div>
      </Card>
    </>
  );
}
