import { Alert, ButtonLink, Card, CardHeader, PageHeader } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import { NAV_GROUPS } from "@/lib/navigation";

export const metadata = { title: "Not built yet" };

/**
 * Honest placeholder for routes that are in the navigation and the data model
 * but do not have a UI yet.
 *
 * This is a catch-all inside the authenticated shell, so it also answers
 * mistyped URLs. It never pretends the feature works — it states plainly what
 * exists and what does not.
 */

/** Modules whose schema, seed data and permissions exist but whose UI is pending. */
const PENDING: Record<string, { title: string; ready: string[] }> = {
};

export default async function NotBuiltPage({
  params,
}: PageProps<"/[...notBuilt]">) {
  await requireAuth();
  const { notBuilt } = await params;
  const segments = Array.isArray(notBuilt) ? notBuilt : [notBuilt];
  const root = segments[0] ?? "";
  const known = PENDING[root];

  const navLabel = NAV_GROUPS.flatMap((group) => group.items).find(
    (item) => item.href === `/${root}`,
  )?.label;

  if (!known) {
    return (
      <>
        <PageHeader
          title="Page not found"
          description={`Nothing is routed at /${segments.join("/")}.`}
        />
        <ButtonLink href="/dashboard">Back to dashboard</ButtonLink>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={navLabel ?? known.title}
        description="This module's data layer is complete; its screens are not built yet."
      />

      <Alert tone="warning" title="No user interface yet">
        The database tables, permissions, navigation entry and demo data for
        this module all exist and are populated. What is missing is the set of
        pages for viewing and editing it.
      </Alert>

      <Card className="mt-4 max-w-2xl">
        <CardHeader
          title="Already in place"
          description="Available through the Prisma client and the seeded database"
        />
        <ul className="space-y-1.5 px-5 py-4 text-sm text-muted-strong">
          {known.ready.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
              {item}
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-5 py-4">
          <p className="text-xs text-muted">
            Inspect or edit the records directly with{" "}
            <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono">
              npm run db:studio
            </code>
            .
          </p>
        </div>
      </Card>

      <div className="mt-4 flex gap-2">
        <ButtonLink href="/dashboard">Back to dashboard</ButtonLink>
      </div>
    </>
  );
}
