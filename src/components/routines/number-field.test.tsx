import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { PRESCRIPTION_LIMITS, setShape } from "@/lib/prescription";

import messages from "../../../messages/en.json";
import { NumberField } from "./number-field";

let stored: number | null = null;
let setExternally: (value: number | null) => void = () => {};

function Harness({ initial }: { initial: number | null }) {
  const [value, setValue] = useState(initial);
  stored = value;
  setExternally = setValue;
  return (
    <>
      <NumberField
        aria-label="Reps"
        value={value}
        onValueChange={setValue}
        schema={setShape.reps}
        limits={PRESCRIPTION_LIMITS.reps}
      />
      <button type="button">elsewhere</button>
    </>
  );
}

function setup(initial: number | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <Harness initial={initial} />
    </NextIntlClientProvider>,
  );
}

const box = () => screen.getByRole("textbox", { name: "Reps" });

describe("NumberField", () => {
  it("stores valid numbers as you type and blank as null", async () => {
    const user = userEvent.setup();
    setup(null);
    await user.type(box(), "12");
    expect(stored).toBe(12);
    await user.clear(box());
    expect(stored).toBeNull();
  });

  it("shows the error while the text is invalid, then reverts to the stored value on blur", async () => {
    const user = userEvent.setup();
    setup(8);
    await user.clear(box());
    await user.type(box(), "1x");
    expect(screen.getByText("Enter a whole number.")).toBeInTheDocument();
    expect(box()).toHaveValue("1x");
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByText("Enter a whole number.")).not.toBeInTheDocument();
    expect(box()).toHaveValue(stored === null ? "" : String(stored));
    expect(box()).not.toHaveAttribute("aria-invalid", "true");
  });

  it("normalises valid text on blur", async () => {
    const user = userEvent.setup();
    setup(null);
    await user.type(box(), "007");
    await user.tab();
    expect(box()).toHaveValue("7");
  });

  it("drops a stale invalid draft when the stored value changes from outside", async () => {
    const user = userEvent.setup();
    setup(8);
    await user.clear(box());
    await user.type(box(), "abc");
    expect(screen.getByText("Enter a whole number.")).toBeInTheDocument();
    await act(async () => setExternally(20));
    expect(box()).toHaveValue("20");
    expect(screen.queryByText("Enter a whole number.")).not.toBeInTheDocument();
  });

  it("keeps a draft that still parses to the new stored value", async () => {
    const user = userEvent.setup();
    setup(null);
    await user.type(box(), "05");
    expect(box()).toHaveValue("05");
  });
});
