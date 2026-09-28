import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";

import { BodyMap } from "./body-map";

function renderMap(props: Partial<Parameters<typeof BodyMap>[0]> = {}) {
  const onRegionClick = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <BodyMap
        view="front"
        isSelected={(region) => region.area === "knee" && region.side === "left"}
        onRegionClick={onRegionClick}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onRegionClick };
}

describe("BodyMap", () => {
  it("names the view and every region, with sides for paired areas", () => {
    renderMap();
    const map = screen.getByRole("group", { name: "Front" });
    expect(within(map).getByRole("checkbox", { name: "Neck" })).toBeInTheDocument();
    expect(within(map).getByRole("checkbox", { name: "Knee · Left" })).toBeInTheDocument();
    expect(within(map).queryByRole("checkbox", { name: /Glute/ })).not.toBeInTheDocument();
  });

  it("reflects selection with aria-checked", () => {
    renderMap();
    expect(screen.getByRole("checkbox", { name: "Knee · Left" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("checkbox", { name: "Knee · Right" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("reports the clicked region", async () => {
    const user = userEvent.setup();
    const { onRegionClick } = renderMap({ view: "back" });
    await user.click(screen.getByRole("checkbox", { name: "Glute · Right" }));
    expect(onRegionClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "back-glute-right", area: "glute", side: "right" }),
    );
  });

  it("keeps regions out of the tab order", () => {
    renderMap();
    for (const region of screen.getAllByRole("checkbox")) {
      expect(region).not.toHaveAttribute("tabindex", "0");
    }
  });
});
