import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { AddSection } from "./add-section";

function setup({ full = false, locale = "en" as "en" | "es" } = {}) {
  const onAdd = vi.fn();
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en} timeZone="UTC">
      <AddSection full={full} onAdd={onAdd} />
    </NextIntlClientProvider>,
  );
  return onAdd;
}

describe("AddSection", () => {
  it("offers the suggestion chips and adds one on click", async () => {
    const user = userEvent.setup();
    const onAdd = setup();
    const group = within(screen.getByRole("group", { name: "Add section" }));
    expect(
      ["Warm-up", "Mobility (ROM)", "Main", "Cool-down"].map((name) =>
        group.getByRole("button", { name }),
      ),
    ).toHaveLength(4);
    await user.click(group.getByRole("button", { name: "Mobility (ROM)" }));
    expect(onAdd).toHaveBeenCalledWith("Mobility (ROM)");
  });

  it("localizes the chips", () => {
    setup({ locale: "es" });
    for (const name of ["Entrada en calor", "Movilidad (ROM)", "Principal", "Vuelta a la calma"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("adds a typed name, trimmed, with the button and clears the field", async () => {
    const user = userEvent.setup();
    const onAdd = setup();
    const input = screen.getByRole("textbox", { name: "New section name" });
    const add = screen.getByRole("button", { name: "Add section" });
    expect(add).toBeDisabled();
    await user.type(input, "   ");
    expect(add).toBeDisabled();
    await user.type(input, "Balance ");
    await user.click(add);
    expect(onAdd).toHaveBeenCalledWith("Balance");
    expect(input).toHaveValue("");
  });

  it("caps the name at 60 characters", () => {
    setup();
    expect(screen.getByRole("textbox", { name: "New section name" })).toHaveAttribute(
      "maxLength",
      "60",
    );
  });

  it("disables everything at the limit and says why", () => {
    setup({ full: true });
    expect(screen.getByText("A routine can have up to 12 sections.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "New section name" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cool-down" })).toBeDisabled();
  });
});
