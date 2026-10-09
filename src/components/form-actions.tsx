import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A form's footer: the submit button and what happened ("Saved", "Unsaved changes"). The status is
 * always mounted: screen readers only announce changes to a live region that already exists.
 */
export function FormActions({
  label,
  pending = false,
  disabled = false,
  status,
  className,
}: {
  label: ReactNode;
  pending?: boolean;
  disabled?: boolean;
  status: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Button type="submit" disabled={pending || disabled}>
        {label}
      </Button>
      <p role="status" className="text-muted-foreground text-sm">
        {status}
      </p>
    </div>
  );
}
