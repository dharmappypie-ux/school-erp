import { SubscriptionPlan } from "@/generated/prisma/enums";

/**
 * Subscription-plan feature gating — the single source of truth for what each
 * plan may use.
 *
 * Plans are cumulative tiers: every plan includes everything the plan below it
 * has, plus its own additions. That mirrors how the pricing page is written
 * ("Everything in Standard, plus…") and is enforced here by a simple rank
 * comparison, so a feature only ever needs to name the *lowest* plan that
 * unlocks it.
 *
 * The web app (`@/lib/auth` → `requireFeature`), the mobile API
 * (`@/lib/mobile-auth` → `planGate`) and the Flutter client (via the feature
 * list returned from `/api/mobile/v1/me`) all read from this file, so a tier
 * change happens in exactly one place.
 */

export { SubscriptionPlan };

/** A gated capability. Anything NOT listed here is "core" and always available. */
export type Feature =
  | "lms" // courses & quizzes authoring/publishing
  | "transport"
  | "hostel"
  | "broadcasts" // WhatsApp / SMS broadcasts
  | "analytics" // analytics dashboards
  | "ai_insights" // AI dropout-risk prediction
  | "ask_ai" // ask-your-data natural-language reporting
  | "reports"; // custom report builder

/** Ordering of the tiers, lowest to highest. Drives the cumulative inclusion. */
const PLAN_RANK: Record<SubscriptionPlan, number> = {
  TRIAL: 0,
  BASIC: 1,
  STANDARD: 2,
  PREMIUM: 3,
  ENTERPRISE: 4,
};

/**
 * The lowest plan that unlocks each feature. Taken straight from the pricing
 * page: LMS, transport, hostel, broadcasts and analytics arrive at Standard;
 * the AI/reporting layer (dropout risk, Ask-your-data, custom report builder)
 * arrives at Premium.
 *
 * TRIAL and BASIC therefore get the core modules only. They differ by the
 * student cap below — TRIAL is the time-limited, 50-student taster; BASIC is the
 * entry paid tier with the same core modules but no cap.
 */
const FEATURE_MIN_PLAN: Record<Feature, SubscriptionPlan> = {
  lms: "STANDARD",
  transport: "STANDARD",
  hostel: "STANDARD",
  broadcasts: "STANDARD",
  analytics: "STANDARD",
  ai_insights: "PREMIUM",
  ask_ai: "PREMIUM",
  reports: "PREMIUM",
};

/** Human labels, for upgrade prompts and the platform console. */
export const FEATURE_LABEL: Record<Feature, string> = {
  lms: "Learning management (courses & quizzes)",
  transport: "Transport",
  hostel: "Hostel",
  broadcasts: "WhatsApp / SMS broadcasts",
  analytics: "Analytics dashboards",
  ai_insights: "AI dropout-risk insights",
  ask_ai: "Ask-your-data reporting",
  reports: "Custom report builder",
};

export const PLAN_LABEL: Record<SubscriptionPlan, string> = {
  TRIAL: "Trial",
  BASIC: "Basic",
  STANDARD: "Standard",
  PREMIUM: "Premium",
  ENTERPRISE: "Enterprise",
};

/** Maximum students a plan may enrol, or `null` for unlimited. */
const STUDENT_CAP: Partial<Record<SubscriptionPlan, number>> = {
  TRIAL: 50,
};

export const ALL_FEATURES = Object.keys(FEATURE_MIN_PLAN) as Feature[];
export const ALL_PLANS = Object.keys(PLAN_RANK) as SubscriptionPlan[];

/** Does `plan` include `feature`? */
export function hasFeature(plan: SubscriptionPlan, feature: Feature): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[FEATURE_MIN_PLAN[feature]];
}

/** The lowest plan that would unlock `feature` — used in upgrade prompts. */
export function requiredPlanFor(feature: Feature): SubscriptionPlan {
  return FEATURE_MIN_PLAN[feature];
}

/** Every feature a plan can use, in declaration order. */
export function featuresFor(plan: SubscriptionPlan): Feature[] {
  return ALL_FEATURES.filter((feature) => hasFeature(plan, feature));
}

/** The student cap for a plan, or `null` when unlimited. */
export function studentCap(plan: SubscriptionPlan): number | null {
  return STUDENT_CAP[plan] ?? null;
}

/** Could a school on `plan` enrol one more student given its current count? */
export function planAllowsAnotherStudent(
  plan: SubscriptionPlan,
  currentStudentCount: number,
): boolean {
  const cap = studentCap(plan);
  return cap === null || currentStudentCount < cap;
}

/** The message shown when a plan's student cap is reached. */
export function studentCapMessage(plan: SubscriptionPlan): string {
  const cap = studentCap(plan);
  return `Your ${PLAN_LABEL[plan]} plan is limited to ${cap} students. Upgrade the plan to enrol more.`;
}
