import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                    */
/* -------------------------------------------------------------------------- */

export function Card({
  className,
  children,
  ...rest
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-sm)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex gap-2">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                     */
/* -------------------------------------------------------------------------- */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-hover border border-transparent shadow-[var(--shadow-sm)]",
  secondary:
    "bg-surface text-foreground border border-border-strong hover:bg-surface-hover",
  ghost: "bg-transparent text-muted-strong hover:bg-surface-hover border border-transparent",
  danger: "bg-danger text-white hover:opacity-90 border border-transparent",
  success: "bg-success text-white hover:opacity-90 border border-transparent",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9.5 px-4 text-sm",
};

function buttonClass(variant: Variant, size: Size, className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-base)] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...rest} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                               */
/* -------------------------------------------------------------------------- */

const FIELD_BASE =
  "w-full rounded-[var(--radius-base)] border border-border-strong bg-surface px-3 text-sm text-foreground placeholder:text-muted disabled:opacity-60";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cn(FIELD_BASE, "h-9.5", className)} {...rest} />;
}

export function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select className={cn(FIELD_BASE, "h-9.5", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cn(FIELD_BASE, "py-2", className)} {...rest} />;
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-strong">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Data display                                                                */
/* -------------------------------------------------------------------------- */

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-muted text-muted-strong border-border-strong/60",
  brand: "bg-brand-soft text-brand border-transparent",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  info: "bg-info-soft text-info border-transparent",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Table({ className, ...rest }: ComponentProps<"table">) {
  return (
    <div className="scroll-slim w-full overflow-x-auto">
      <table className={cn("w-full min-w-[40rem] text-sm", className)} {...rest} />
    </div>
  );
}

export function Th({ className, ...rest }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "th-label border-b border-border bg-surface-sunken/60 px-4 py-2.5 text-left",
        className,
      )}
      {...rest}
    />
  );
}

export function Td({ className, ...rest }: ComponentProps<"td">) {
  return (
    <td
      className={cn("border-b border-border px-4 py-2.5 align-middle", className)}
      {...rest}
    />
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  sublabel,
  tone = "neutral",
  href,
}: {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <Card
      className={cn(
        "h-full px-5 py-4 transition-colors",
        href && "hover:bg-surface-hover",
      )}
    >
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="numeric mt-1.5 text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      {sublabel ? (
        <div className="mt-1.5 text-xs text-muted">
          {typeof sublabel === "string" ? (
            <Badge tone={tone}>{sublabel}</Badge>
          ) : (
            sublabel
          )}
        </div>
      ) : null}
    </Card>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-base)] border px-4 py-3 text-sm",
        TONES[tone],
      )}
    >
      {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
      <div className="text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Charts — dependency-free SVG, so they render on the server                   */
/* -------------------------------------------------------------------------- */

/** Ordinal rungs 1–5 of the single-hue data ramp, light end first. */
export type ChartStep = 1 | 2 | 3 | 4 | 5;

const STATUS_COLOR: Record<Tone, string> = {
  neutral: "var(--muted)",
  brand: "var(--brand)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
};

/**
 * A bar chart for one series.
 *
 * Bars default to the data ramp, not the brand colour and not a status colour:
 * a bar's height already carries the magnitude, and painting it red would say
 * "problem" where the data only says "low". Pass `step` to place a bar on the
 * ordinal ramp, or `tone` in the genuine state cases (a compliance chart, where
 * the colour is the point).
 */
export function BarChart({
  data,
  height = 160,
  format = (value: number) => String(value),
}: {
  data: { label: string; value: number; tone?: Tone; step?: ChartStep }[];
  height?: number;
  format?: (value: number) => string;
}) {
  const max = Math.max(1, ...data.map((entry) => entry.value));

  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((entry) => (
        <div key={entry.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className="numeric text-[10px] font-medium tabular-nums text-muted-strong">
            {format(entry.value)}
          </span>
          <div
            className="w-full transition-[height] duration-300 ease-out"
            style={{
              height: `${Math.max(3, (entry.value / max) * (height - 42))}px`,
              background: entry.tone
                ? STATUS_COLOR[entry.tone]
                : `var(--chart-${entry.step ?? 3})`,
              // Rounded only at the data end; the baseline stays square so the
              // bar reads as measured from zero.
              borderRadius: "4px 4px 0 0",
            }}
            title={`${entry.label}: ${format(entry.value)}`}
          />
          <span className="w-full truncate text-center text-[10px] text-muted">
            {entry.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  tone = "brand",
}: {
  value: number;
  max?: number;
  tone?: Tone;
}) {
  const percent = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
      role="meter"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300 ease-out"
        style={{ width: `${percent}%`, background: STATUS_COLOR[tone] }}
      />
    </div>
  );
}
