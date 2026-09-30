import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RoutineStatus } from "@/lib/routines";

const VARIANT = { draft: "outline", active: "default", archived: "secondary" } as const;

/** A routine's lifecycle status: draft (outlined), active (accent) or archived (muted). */
export function StatusBadge({ status }: { status: RoutineStatus }) {
  const t = useTranslations("Routines.status");
  return (
    <Badge
      variant={VARIANT[status]}
      className={cn(status === "archived" && "text-muted-foreground")}
    >
      {t(status)}
    </Badge>
  );
}
