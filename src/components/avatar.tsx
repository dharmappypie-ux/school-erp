import { cn } from "@/components/ui";
import { initials } from "@/lib/format";

const SIZES = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-8 w-8 text-[11px]",
  lg: "h-10 w-10 text-sm",
  xl: "h-20 w-20 text-xl",
} as const;

/**
 * A person's photo, falling back to their initials.
 *
 * Plain `<img>` rather than `next/image`: uploads are served straight from
 * `public/uploads` at unknown dimensions, and the optimiser adds nothing for
 * an avatar already constrained to a fixed box.
 */
export function Avatar({
  firstName,
  lastName,
  photoUrl,
  size = "md",
  className,
}: {
  firstName: string;
  lastName?: string | null;
  photoUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const label = `${firstName} ${lastName ?? ""}`.trim();

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={label}
        loading="lazy"
        className={cn(
          "shrink-0 rounded-full object-cover",
          SIZES[size],
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden
      title={label}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand",
        SIZES[size],
        className,
      )}
    >
      {initials(firstName, lastName)}
    </span>
  );
}
