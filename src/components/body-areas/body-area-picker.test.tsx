import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { BodyAreaSelection } from "@/lib/body-areas";

import messages from "../../../messages/en.json";

import { BodyAreaPicker, type BodyAreaPickerProps } from "./body-area-picker";

function renderInForm(props: BodyAreaPickerProps) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <form aria-label="test form">
        <BodyAreaPicker {...props} />
      </form>
    </NextIntlClientProvider>,
  );
  const form = screen.getByRole("form", { name: "test form" }) as HTMLFormElement;
  return { formData: () => new FormData(form) };
}

const frontMap = () => screen.getByRole("group", { name: "Front" });
const backMap = () => screen.getByRole("group", { name: "Back" });
const region = (map: HTMLElement, name: string) => within(map).getByRole("checkbox", { name });

describe("BodyAreaPicker multi", () => {
  it("toggles an area from the map and syncs the list and hidden inputs", async () => {
    const user = userEvent.setup();
    const { formData } = renderInForm({ mode: "multi", name: "areas" });

    await user.click(region(frontMap(), "Knee · Left"));
    expect(screen.getByRole("checkbox", { name: "Knee" })).toBeChecked();
    // Multi mode has no side: both knees, on both views, light up.
    expect(region(frontMap(), "Knee · Right")).toHaveAttribute("aria-checked", "true");
    expect(region(backMap(), "Knee · Left")).toHaveAttribute("aria-checked", "true");

    // Neck is a midline area: it has no side, so its map region on both views shares the
    // plain "Neck" name with the list checkbox (unlike "Knee · Left"/"Knee · Right" above).
    // Scope to the list to exercise that input path unambiguously.
    await user.click(within(screen.getByRole("list")).getByRole("checkbox", { name: "Neck" }));
    expect(region(backMap(), "Neck")).toHaveAttribute("aria-checked", "true");
    expect(formData().getAll("areas")).toEqual(["neck", "knee"]);

    await user.click(region(backMap(), "Knee · Right"));
    expect(formData().getAll("areas")).toEqual(["neck"]);
  });

  it("offers full body in the list only", () => {
    renderInForm({ mode: "multi", name: "areas" });
    expect(screen.getByRole("checkbox", { name: "Full body" })).toBeInTheDocument();
    expect(document.querySelector('[data-region*="full_body"]')).toBeNull();
  });

  it("submits only the named fields", async () => {
    const user = userEvent.setup();
    const { formData } = renderInForm({ mode: "multi", name: "areas" });
    await user.click(screen.getByRole("checkbox", { name: "Elbow" }));
    expect([...formData().keys()]).toEqual(["areas"]);
  });
});

describe("BodyAreaPicker single with side", () => {
  it("combines both sides into both and cycles back", async () => {
    const user = userEvent.setup();
    const { formData } = renderInForm({ mode: "single", withSide: true, name: "area" });

    await user.click(region(frontMap(), "Knee · Left"));
    expect(formData().get("area")).toBe("knee");
    expect(formData().get("areaSide")).toBe("left");
    expect(screen.getByRole("radio", { name: "Knee" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Left" })).toBeChecked();

    await user.click(region(frontMap(), "Knee · Right"));
    expect(formData().get("areaSide")).toBe("both");
    expect(region(backMap(), "Knee · Right")).toHaveAttribute("aria-checked", "true");

    await user.click(region(frontMap(), "Knee · Left"));
    expect(formData().get("areaSide")).toBe("right");
    expect(region(frontMap(), "Knee · Left")).toHaveAttribute("aria-checked", "false");
  });

  it("drops the side when switching to a midline area", async () => {
    const user = userEvent.setup();
    const { formData } = renderInForm({ mode: "single", withSide: true, name: "area" });
    await user.click(region(frontMap(), "Knee · Left"));
    await user.click(region(frontMap(), "Neck"));
    expect(formData().get("area")).toBe("neck");
    expect(formData().get("areaSide")).toBe("");
    expect(screen.queryByRole("radiogroup", { name: "Side" })).not.toBeInTheDocument();
  });

  it("works from the list and the keyboard", async () => {
    const user = userEvent.setup();
    const { formData } = renderInForm({ mode: "single", withSide: true, name: "area" });
    await user.click(screen.getByRole("radio", { name: "Neck" }));
    // Radix's RadioGroup defers the arrow-key focus move to a macrotask (setTimeout) so it can
    // read the "was this focus caused by an arrow key" flag, which is cleared on keyup. A real
    // key press always has the keyup land after that macrotask; pressing and releasing as two
    // separate keyboard() calls with a tick in between reproduces that instead of racing it.
    await user.keyboard("{ArrowDown>}");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await user.keyboard("{/ArrowDown}");
    expect(screen.getByRole("radio", { name: "Shoulder" })).toBeChecked();
    expect(formData().get("area")).toBe("shoulder");
    expect(formData().get("areaSide")).toBe("");

    await user.click(screen.getByRole("radio", { name: "Right" }));
    expect(formData().get("areaSide")).toBe("right");
    expect(region(frontMap(), "Shoulder · Right")).toHaveAttribute("aria-checked", "true");
    expect(region(frontMap(), "Shoulder · Left")).toHaveAttribute("aria-checked", "false");
  });

  it("never offers full body and can be cleared", async () => {
    const user = userEvent.setup();
    const { formData } = renderInForm({
      mode: "single",
      withSide: true,
      name: "area",
      defaultValue: { area: "elbow", side: "left" },
    });
    expect(screen.queryByRole("radio", { name: "Full body" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(formData().get("area")).toBe("");
    expect(formData().get("areaSide")).toBe("");
    expect([...formData().keys()].sort()).toEqual(["area", "areaSide"]);
  });
});

describe("BodyAreaPicker single without side", () => {
  it("records the area only", async () => {
    const user = userEvent.setup();
    const { formData } = renderInForm({ mode: "single", name: "area" });
    await user.click(region(frontMap(), "Knee · Left"));
    expect(formData().get("area")).toBe("knee");
    expect(formData().has("areaSide")).toBe(false);
    expect(region(frontMap(), "Knee · Right")).toHaveAttribute("aria-checked", "true");
  });
});

describe("BodyAreaPicker controlled", () => {
  it("reports the next value and shows what the parent passes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderInForm({ mode: "single", withSide: true, value: null, onChange });
    await user.click(region(frontMap(), "Knee · Left"));
    expect(onChange).toHaveBeenCalledWith({ area: "knee", side: "left" });
    // The parent ignored the change, so nothing is selected.
    expect(region(frontMap(), "Knee · Left")).toHaveAttribute("aria-checked", "false");
  });

  it("follows parent state", async () => {
    const user = userEvent.setup();
    function Parent() {
      const [value, setValue] = useState<BodyAreaSelection | null>({ area: "neck", side: null });
      return <BodyAreaPicker mode="single" withSide value={value} onChange={setValue} />;
    }
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <Parent />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("radio", { name: "Neck" })).toBeChecked();
    await user.click(region(frontMap(), "Elbow · Right"));
    expect(screen.getByRole("radio", { name: "Elbow" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Right" })).toBeChecked();
  });
});
