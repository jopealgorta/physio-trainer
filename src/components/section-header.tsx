import type { ReactNode } from "react";

/**
 * A section's heading inside a page (a customer's Routines, Plans, Notes…): title and description
 * on the left, the section's actions on the right. `id` names the section (`aria-labelledby`).
 */
export function SectionHeader({
  id,
  title,
  description,
  actions,
}: {
  id: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid gap-1">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
