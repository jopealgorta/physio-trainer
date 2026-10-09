"use client";

import type { ReactNode } from "react";

import { BackLink } from "@/components/back-link";
import { PageActionsMenu, PageNotices, useInPageActions } from "@/components/page-actions";

/**
 * Every physio page's header: the way back, the title (with what sits beside it, e.g. an avatar,
 * and under it: badges, the age, a description) and the page's actions on the right.
 *
 * `primary` is the page's one main action (a filled button: New, Share, Save), shown at every
 * size. `actions` are the rest, outline buttons in the order Edit, templates, History, Export,
 * Share. Inside `PageActions` (detail pages) `actions` give way to the "⋯" menu below `sm`, the
 * menu also holding the menu-only actions (Archive, Delete) at every size.
 */
export function PageHeader({
  back,
  title,
  leading,
  meta,
  description,
  actions,
  primary,
}: {
  back?: { href: string; label: string };
  /** A string becomes the `h1`; an element (a title renamed in place) is shown as it is. */
  title: ReactNode;
  /** Before the title, e.g. the customer's avatar. */
  leading?: ReactNode;
  /** Under the title: badges, the age, "From template". */
  meta?: ReactNode;
  description?: string;
  actions?: ReactNode;
  primary?: ReactNode;
}) {
  const withMenu = useInPageActions();
  const hasActions = Boolean(actions || primary || withMenu);
  return (
    <div className="grid gap-3">
      {back ? <BackLink href={back.href} label={back.label} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        {/* On phones the actions get their own row, so a status beside Save never moves it. */}
        <div className="flex min-w-0 basis-full items-center gap-4 sm:flex-[1_1_12rem]">
          {leading}
          <div className="grid min-w-0 gap-1">
            {typeof title === "string" ? (
              <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere">{title}</h1>
            ) : (
              title
            )}
            {meta ? (
              <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
                {meta}
              </div>
            ) : null}
            {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
          </div>
        </div>
        {hasActions ? (
          <div
            data-testid="page-header-actions"
            className="ml-auto flex flex-wrap items-center justify-end gap-2"
          >
            {actions ? (
              withMenu ? (
                <div
                  data-testid="page-header-secondary"
                  className="hidden flex-wrap items-center gap-2 sm:flex"
                >
                  {actions}
                </div>
              ) : (
                actions
              )
            ) : null}
            {primary}
            {withMenu ? <PageActionsMenu /> : null}
          </div>
        ) : null}
      </div>
      {withMenu ? <PageNotices /> : null}
    </div>
  );
}
