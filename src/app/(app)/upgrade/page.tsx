import { ButtonLink, Badge, Card, PageHeader } from "@/components/ui";
import { requireAuth } from "@/lib/auth";
import {
  ALL_FEATURES,
  FEATURE_LABEL,
  PLAN_LABEL,
  requiredPlanFor,
  type Feature,
} from "@/lib/entitlements";

export const metadata = { title: "Upgrade required" };

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const params = await searchParams;
  const raw = typeof params.feature === "string" ? params.feature : "";
  const feature = (ALL_FEATURES as string[]).includes(raw)
    ? (raw as Feature)
    : null;

  const currentPlan = session.school.plan;
  const neededPlan = feature ? requiredPlanFor(feature) : null;

  return (
    <>
      <PageHeader
        title="That feature isn't on your plan"
        description="Your account has access, but this module needs a higher subscription tier."
      />

      <Card className="max-w-xl px-5 py-5">
        {feature ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{FEATURE_LABEL[feature]}</span>
            <Badge tone="neutral">{PLAN_LABEL[currentPlan]} — current</Badge>
            {neededPlan ? <Badge tone="success">Needs {PLAN_LABEL[neededPlan]}</Badge> : null}
          </div>
        ) : (
          <p className="text-sm text-muted-strong">
            This area needs a higher subscription tier than your current plan,{" "}
            <strong className="text-foreground">{PLAN_LABEL[currentPlan]}</strong>.
          </p>
        )}

        <p className="mt-5 border-t border-border pt-4 text-sm text-muted">
          {feature && neededPlan ? (
            <>
              <strong className="text-foreground">{FEATURE_LABEL[feature]}</strong> is
              included from the <strong className="text-foreground">{PLAN_LABEL[neededPlan]}</strong>{" "}
              plan upward. {session.school.name} is currently on{" "}
              <strong className="text-foreground">{PLAN_LABEL[currentPlan]}</strong>.
            </>
          ) : null}{" "}
          Plans are managed by the platform owner — ask them to upgrade{" "}
          {session.school.name} to unlock it.
        </p>

        <div className="mt-5 flex gap-2">
          <ButtonLink href="/dashboard">Back to dashboard</ButtonLink>
        </div>
      </Card>
    </>
  );
}
