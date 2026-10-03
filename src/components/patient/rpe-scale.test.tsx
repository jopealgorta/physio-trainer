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
  it("renders radios 0 to 10 in the Effort (RPE) group ", () => {
    setup();
    const group = screen.getByRole("group", { name: "Effort (RPE)" });
    expect(
      within(group)
        .getAllByRole("radio")
        .map((r) => r.getAttribute("value")),
    ).toEqual(Array.from({ length: 11 }, (_, i) => String(i)));
  });

  it("describes the selected rating with its CR10 descriptor, linked to the group", () => {
    setup(6);
    const group = screen.getByRole("group", { name: "Effort (RPE)" });
    expect(screen.getByText("6 · Hard")).toBeInTheDocument();
    expect(group).toHaveAccessibleDescription(/6 · Hard/);
  });

  it("names 0 as rest and shows only the hint when nothing is selected", () => {
    const { unmount } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <RpeScale name="rpe" value={0} onChange={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("0 · Rest")).toBeInTheDocument();
    unmount();
    setup();
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Effort (RPE)" })).toHaveAccessibleDescription(
      "How hard was it? 0 = rest, 10 = maximal.",
    );
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
