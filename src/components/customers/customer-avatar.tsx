import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-16 text-xl",
} as const;

/** Decorative initials circle: the customer's name is always rendered next to it. */
export function CustomerAvatar({
  firstName,
  lastName,
  size = "md",
}: {
  firstName: string;
  lastName: string | null;
  size?: keyof typeof SIZES;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-muted text-muted-foreground inline-flex shrink-0 items-center justify-center rounded-full font-medium select-none",
        SIZES[size],
      )}
    >
      {initials(firstName, lastName)}
    </span>
  );
}
