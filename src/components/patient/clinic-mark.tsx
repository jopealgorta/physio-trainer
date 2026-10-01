import { cn } from "@/lib/utils";

/** The clinic's logo, or a circle with its initial in the accent colour. Plain markup: no hooks. */
export function ClinicMark({
  name,
  logoUrl,
  alt,
  className,
}: {
  name: string;
  logoUrl: string | null;
  alt: string;
  className?: string;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- ≤512 px logo from a public bucket; next/image refuses local Supabase (private IP).
      <img
        src={logoUrl}
        alt={alt}
        className={cn("shrink-0 rounded-md object-contain", className)}
      />
    );
  }
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "";
  return (
    <span
      aria-hidden
      className={cn(
        "bg-primary text-primary-foreground inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        className,
      )}
    >
      {initial}
    </span>
  );
}
