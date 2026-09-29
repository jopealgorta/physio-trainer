"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { reopenCaseAction } from "@/server/customers/actions";

import { CloseCaseDialog } from "./close-case-dialog";

type ReopenError = "notFound" | "notClosed" | "unknown";

/**
 * Buttons of one case card: Close (opens the closing dialog) while open, Reopen while closed.
 * `children` (the edit sheet) joins the button row; errors render below it at full width.
 */
export function CaseActions({
  caseId,
  title,
  status,
  today,
  children,
}: {
  caseId: string;
  /** The case title, so each button's accessible name tells cards apart. */
  title: string;
  status: "open" | "closed";
  today: string;
  children?: ReactNode;
}) {
  const t = useTranslations("Cases");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ReopenError | null>(null);

  function reopen() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await reopenCaseAction(caseId);
        if (result.ok) router.refresh();
        else setError(result.error);
      } catch {
        setError("unknown");
      }
    });
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {children}
        {status === "open" ? (
          <CloseCaseDialog caseId={caseId} title={title} today={today} />
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            aria-label={pending ? undefined : t("reopenFor", { title })}
            onClick={reopen}
          >
            {pending ? t("reopening") : t("reopen")}
          </Button>
        )}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
