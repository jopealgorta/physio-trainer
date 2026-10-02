"use client";

import { CopyIcon, UserPlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { usePageAction, usePageNotice } from "@/components/page-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { TemplateKind } from "@/lib/templates";
import { duplicateTemplateAction } from "@/server/templates/actions";

import { AssignTemplateDialog } from "./assign-template-dialog";

const PATHS = { routine: "/routines", plan: "/plans" } as const;

/** "Assign to customer…" and "Duplicate" on a template's own page. */
export function TemplateActions({
  kind,
  template,
  customers,
}: {
  kind: TemplateKind;
  template: { id: string; name: string };
  /** Active customers to assign to; with none, there is nothing to assign to. */
  customers: { id: string; name: string }[];
}) {
  const t = useTranslations("Templates.list");
  const router = useRouter();
  const [assigning, setAssigning] = useState(false);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  const duplicate = () => {
    setFailed(false);
    startTransition(async () => {
      const result = await duplicateTemplateAction({ kind, templateId: template.id });
      if (result.ok) router.push(`${PATHS[kind]}/${result.data.id}`);
      else setFailed(true);
    });
  };

  const { onCloseAutoFocus } = usePageAction(
    "assign",
    customers.length > 0
      ? {
          label: t("assign"),
          order: 60,
          icon: <UserPlusIcon aria-hidden />,
          opensDialog: true,
          onSelect: () => setAssigning(true),
        }
      : null,
  );
  usePageAction("duplicate", {
    label: t("duplicate"),
    order: 61,
    icon: <CopyIcon aria-hidden />,
    pending,
    onSelect: duplicate,
  });
  usePageNotice("duplicate", failed ? { text: t("duplicateFailed"), tone: "error" } : null);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {customers.length > 0 ? (
          <Button type="button" variant="outline" onClick={() => setAssigning(true)}>
            <UserPlusIcon aria-hidden /> {t("assign")}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={duplicate} disabled={pending}>
          <CopyIcon aria-hidden /> {t("duplicate")}
        </Button>
      </div>
      {failed ? (
        <Alert variant="destructive">
          <AlertDescription>{t("duplicateFailed")}</AlertDescription>
        </Alert>
      ) : null}
      <AssignTemplateDialog
        kind={kind}
        template={template}
        customers={customers}
        open={assigning}
        onOpenChange={setAssigning}
        onCloseAutoFocus={onCloseAutoFocus}
      />
    </div>
  );
}
