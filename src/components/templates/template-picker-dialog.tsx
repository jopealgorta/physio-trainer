"use client";

import { ArrowLeftIcon, LayersIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ROUTINE_SEARCH_MAX_LENGTH } from "@/lib/routines";
import type { TemplateKind } from "@/lib/templates";
import { searchTemplatesAction } from "@/server/templates/actions";
import type { TemplateOption } from "@/server/templates/queries";

import { AssignTemplateForm } from "./assign-template-dialog";

const SEARCH_DEBOUNCE_MS = 250;

type Customer = { id: string; name: string };
type Case = { id: string; title: string };

/**
 * "From template…" on a customer's page: search the active templates, pick one, then fill in the
 * assign form (customer fixed) in the same dialog.
 */
export function TemplatePickerDialog({
  kind,
  customer,
  cases,
}: {
  kind: TemplateKind;
  customer: Customer;
  cases: Case[];
}) {
  const t = useTranslations("Templates.picker");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <LayersIcon aria-hidden /> {t(`button.${kind}`)}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <PickerBody kind={kind} customer={customer} cases={cases} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

type Fetched = { key: string; options: TemplateOption[] | null };

function PickerBody({
  kind,
  customer,
  cases,
  onClose,
}: {
  kind: TemplateKind;
  customer: Customer;
  cases: Case[];
  onClose: () => void;
}) {
  const t = useTranslations("Templates.picker");
  const tAssign = useTranslations("Templates.assign");
  const [q, setQ] = useState("");
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [chosen, setChosen] = useState<TemplateOption | null>(null);
  const sequence = useRef(0);
  const first = useRef(true);

  const term = q.trim();

  // The first load (the dialog just opened) is immediate; typing is debounced. Whatever is pending
  // or in flight when the query changes (or the dialog closes) is stale and dropped.
  useEffect(() => {
    const request = sequence.current;
    const delay = first.current ? 0 : SEARCH_DEBOUNCE_MS;
    first.current = false;
    const timer = setTimeout(async () => {
      let options: TemplateOption[] | null;
      try {
        options = await searchTemplatesAction({ kind, q: term });
      } catch {
        options = null;
      }
      if (request === sequence.current) setFetched({ key: term, options });
    }, delay);
    return () => {
      clearTimeout(timer);
      sequence.current++;
    };
  }, [kind, term]);

  if (chosen) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{tAssign("title")}</DialogTitle>
          <DialogDescription>{tAssign("description", { name: chosen.name })}</DialogDescription>
        </DialogHeader>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-self-start"
          onClick={() => setChosen(null)}
        >
          <ArrowLeftIcon aria-hidden /> {t("back")}
        </Button>
        <AssignTemplateForm
          kind={kind}
          template={{ id: chosen.id, name: chosen.name }}
          customer={customer}
          cases={cases}
          onCancel={onClose}
        />
      </>
    );
  }

  // While a search is pending or in flight the previous results stay on screen.
  const busy = fetched?.key !== term;
  const failed = !busy && fetched?.options === null;
  const options = fetched?.options ?? [];

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t(`description.${kind}`, { name: customer.name })}</DialogDescription>
      </DialogHeader>
      <Input
        type="search"
        aria-label={t("search")}
        placeholder={t("search")}
        maxLength={ROUTINE_SEARCH_MAX_LENGTH}
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />
      <div aria-busy={busy} className="grid max-h-80 gap-2 overflow-y-auto">
        {fetched === null ? (
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        ) : failed ? (
          <p role="alert" className="text-destructive text-sm">
            {t("failed")}
          </p>
        ) : options.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {fetched.key === "" ? t(`none.${kind}`) : t("empty")}
          </p>
        ) : (
          <ul className="grid gap-2">
            {options.map((option) => (
              <li key={option.id}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setChosen(option)}
                  className="h-auto w-full justify-between gap-3 px-3 py-2 text-left whitespace-normal"
                >
                  <span className="min-w-0 truncate font-medium">{option.name}</span>
                  <span className="text-muted-foreground shrink-0 text-xs font-normal">
                    {t(`detail.${kind}`, { count: option.detail })}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
