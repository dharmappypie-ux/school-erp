/** Shared display formatting. Server and client safe. */

const DEFAULT_LOCALE = "en-IN";

export function formatMoney(
  value: number | string | { toString(): string } | null | undefined,
  currency = "INR",
  locale = DEFAULT_LOCALE,
): string {
  const amount = toNumber(value);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

/** Indian numbering for large counts: 1,23,456. */
export function formatNumber(
  value: number | string | null | undefined,
  locale = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(locale).format(toNumber(value));
}

export function formatPercent(
  value: number | string | null | undefined,
  digits = 1,
): string {
  const amount = toNumber(value);
  return `${amount.toFixed(digits)}%`;
}

export function formatDate(
  value: Date | string | null | undefined,
  style: "short" | "long" | "month" = "short",
  locale = DEFAULT_LOCALE,
): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  if (style === "long") {
    return date.toLocaleDateString(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  if (style === "month") {
    return date.toLocaleDateString(locale, { month: "short", year: "numeric" });
  }
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(
  value: Date | string | null | undefined,
  locale = DEFAULT_LOCALE,
): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeDays(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  const days = Math.round((date.getTime() - Date.now()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}

export function initials(first: string, last?: string | null): string {
  return `${first.charAt(0)}${last?.charAt(0) ?? ""}`.toUpperCase();
}

export function fullName(
  first: string,
  middle?: string | null,
  last?: string | null,
): string {
  return [first, middle, last].filter(Boolean).join(" ");
}

/** Converts Prisma Decimal, string, or number into a plain number. */
export function toNumber(
  value: number | string | { toString(): string } | null | undefined,
): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[\s_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
