import type { CourseResourceType, CourseStatus } from "@/generated/prisma/enums";

import type { Tone } from "@/components/ui";

/**
 * Learning-management helpers shared by the staff course screens and the
 * student portal. Kept free of `server-only` and of any Prisma client access so
 * the labels and pure calculations can be used on both sides.
 */

export const COURSE_STATUS_LABEL: Record<CourseStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export const COURSE_STATUS_TONE: Record<CourseStatus, Tone> = {
  DRAFT: "neutral",
  PUBLISHED: "success",
  ARCHIVED: "warning",
};

export const RESOURCE_TYPE_LABEL: Record<CourseResourceType, string> = {
  LINK: "Link",
  PDF: "PDF",
  VIDEO: "Video",
  DOCUMENT: "Document",
  IMAGE: "Image",
  OTHER: "File",
};

/** A single glyph per resource type, so the lists need no icon library. */
export const RESOURCE_TYPE_GLYPH: Record<CourseResourceType, string> = {
  LINK: "🔗",
  PDF: "📄",
  VIDEO: "🎬",
  DOCUMENT: "📝",
  IMAGE: "🖼️",
  OTHER: "📎",
};

export const COURSE_RESOURCE_TYPES: CourseResourceType[] = [
  "LINK",
  "PDF",
  "VIDEO",
  "DOCUMENT",
  "IMAGE",
  "OTHER",
];

export const COURSE_STATUSES: CourseStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

/**
 * Completion percentage for a course, rounded to a whole number. Returns 0 for
 * a course with no lessons so the caller never divides by zero.
 */
export function courseProgress(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((Math.min(completed, total) / total) * 100);
}

/** "1h 05m" / "45m" / "—" for a null or zero duration. */
export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return mins === 0 ? `${hours}h` : `${hours}h ${String(mins).padStart(2, "0")}m`;
}

/** Total teaching time across a set of lessons, formatted. */
export function totalDuration(
  lessons: { durationMinutes: number | null }[],
): string {
  const sum = lessons.reduce((acc, l) => acc + (l.durationMinutes ?? 0), 0);
  return formatDuration(sum);
}

/**
 * A permissive-but-safe URL check for resource links and video embeds. Only
 * http(s) URLs are accepted, so a resource can never smuggle a `javascript:`
 * or `data:` URI into an anchor the portal renders.
 */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
