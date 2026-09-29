import { screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/** Opens a shadcn Select and picks an option by its visible name. */
export async function chooseOption(user: UserEvent, trigger: HTMLElement, name: string | RegExp) {
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name }));
}
