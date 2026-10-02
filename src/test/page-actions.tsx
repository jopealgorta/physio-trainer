import { screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";

import { PageActions, PageActionsMenu, PageNotices } from "@/components/page-actions";

/** Renders controls the way the routine and plan pages do: with the "⋯" menu and its notices. */
export function InPageActions({ children }: { children: ReactNode }) {
  return (
    <PageActions>
      {children}
      <PageActionsMenu />
      <PageNotices />
    </PageActions>
  );
}

/** Opens the page's "More actions" menu and picks an item by its visible name. */
export async function chooseMenuAction(user: UserEvent, name: string | RegExp) {
  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(await screen.findByRole("menuitem", { name }));
}

/** The item names in the page's "More actions" menu (opens it; Escape closes it again). */
export async function menuActions(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "More actions" }));
  const menu = await screen.findByRole("menu");
  const names = [...menu.querySelectorAll('[role^="menuitem"]')].map((item) => item.textContent);
  await user.keyboard("{Escape}");
  return names;
}
