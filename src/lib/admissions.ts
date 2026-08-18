import type { ApplicationStatus } from "@/generated/prisma/enums";

/**
 * Admission funnel rules.
 *
 * Pure constants and predicates with no database access, so the client-side
 * decision panel can share the same stage labels and transition rules the
 * server enforces — deliberately not marked `server-only`.
 *
 * Transitions are whitelisted rather than free-form: an application that jumps
 * from SUBMITTED straight to ENROLLED would skip the fee and document checks
 * the office relies on, and the audit trail would no longer explain how a
 * child got a seat.
 */

export const APPLICATION_FLOW: Record<ApplicationStatus, ApplicationStatus[]> = {
  DRAFT: ["SUBMITTED", "WITHDRAWN"],
  SUBMITTED: ["UNDER_REVIEW", "REJECTED", "WITHDRAWN"],
  UNDER_REVIEW: ["SHORTLISTED", "TEST_SCHEDULED", "REJECTED", "WITHDRAWN"],
  SHORTLISTED: ["TEST_SCHEDULED", "INTERVIEW_SCHEDULED", "OFFERED", "REJECTED", "WITHDRAWN"],
  TEST_SCHEDULED: ["INTERVIEW_SCHEDULED", "OFFERED", "REJECTED", "WITHDRAWN"],
  INTERVIEW_SCHEDULED: ["OFFERED", "REJECTED", "WITHDRAWN"],
  OFFERED: ["ACCEPTED", "REJECTED", "WITHDRAWN"],
  // ENROLLED is reached only by the conversion action, never by a plain
  // status change — it has to create the student record atomically.
  ACCEPTED: ["ENROLLED", "WITHDRAWN"],
  REJECTED: ["UNDER_REVIEW"],
  WITHDRAWN: ["UNDER_REVIEW"],
  ENROLLED: [],
};

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  SHORTLISTED: "Shortlisted",
  TEST_SCHEDULED: "Test scheduled",
  INTERVIEW_SCHEDULED: "Interview scheduled",
  OFFERED: "Offer made",
  ACCEPTED: "Offer accepted",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  ENROLLED: "Enrolled",
};

/** Ordered stages for the pipeline view; terminal outcomes are excluded. */
export const PIPELINE_STAGES: ApplicationStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "SHORTLISTED",
  "TEST_SCHEDULED",
  "INTERVIEW_SCHEDULED",
  "OFFERED",
  "ACCEPTED",
];

export function canTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  return APPLICATION_FLOW[from]?.includes(to) ?? false;
}

/**
 * Next admission number for a school, e.g. GIS20260361.
 *
 * Derived from the highest existing number rather than a counter table so it
 * stays correct when records are imported from a previous system.
 */
export function nextAdmissionNumber(
  prefix: string,
  existing: string | null,
): string {
  if (!existing || !existing.startsWith(prefix)) return `${prefix}0001`;
  const sequence = Number.parseInt(existing.slice(prefix.length), 10);
  const next = Number.isFinite(sequence) ? sequence + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}
