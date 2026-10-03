import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Button } from "./button";
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "./drawer";

describe("Drawer", () => {
  it("moves focus into the drawer when it opens", async () => {
    const user = userEvent.setup();
    render(
      <Drawer>
        <DrawerTrigger asChild>
          <Button>Open</Button>
        </DrawerTrigger>
        <DrawerContent aria-describedby={undefined}>
          <DrawerTitle>Sheet</DrawerTitle>
          <Button>Inside</Button>
        </DrawerContent>
      </Drawer>,
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = await screen.findByRole("dialog", { name: "Sheet" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });
});
