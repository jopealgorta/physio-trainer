import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import { RpeScale } from "./rpe-scale";

function setup(value: number | null = null, onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RpeScale name="rpe" value={value} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

describe("RpeScale", () => {
  it("renders radios 0 to 10 in the Effort (RPE) group with three anchors", () => {
    setup();
    const group = screen.getByRole("group", { name: "Effort (RPE)" });
    expect(
      within(group)
        .getAllByRole("radio")
        .map((r) => r.getAttribute("value")),
    ).toEqual(Array.from({ length: 11 }, (_, i) => String(i)));
    for (const anchor of ["Rest", "Hard", "Max"])
      expect(within(group).getByText(anchor)).toBeInTheDocument();
  });

  it("reports the chosen rating and clears to null", async () => {
    const user = userEvent.setup();
    const onChange = setup(6);
    await user.click(screen.getByRole("radio", { name: "8" }));
    expect(onChange).toHaveBeenCalledWith(8);
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
