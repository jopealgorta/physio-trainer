import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { BodyAreaSelection } from "@/lib/body-areas";

import messages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";

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
  return { form, formData: () => new FormData(form) };
}

const openPicker = (user: UserEvent, name: RegExp = /^Body area/) =>
  user.click(screen.getByRole("button", { name }));
const panel = () => screen.getByRole("dialog");
const map = (view: "Front" | "Back" = "Front") =>
  within(panel()).getByRole("group", { name: view });
const region = (name: string, view: "Front" | "Back" = "Front") =>
  within(map(view)).getByRole("checkbox", { name });
/** Multi mode: chips are toggle buttons. */
const chip = (name: string) => within(panel()).getByRole("button", { name });
/** Single mode: chips are radios in one group. */
const radio = (name: string) => within(panel()).getByRole("radio", { name });

describe("BodyAreaPicker multi", () => {
  it("is a compact field until opened", async () => {
    const user = userEvent.setup();
    renderInForm({ mode: "multi", name: "areas" });
    expect(screen.getByRole("button", { name: "Body areas Choose body areas" })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await openPicker(user);
    expect(map()).toBeInTheDocument();
    for (const group of ["Upper body", "Trunk", "Lower body", "Other"]) {
      expect(within(panel()).getByRole("group", { name: group })).toBeInTheDocument();
    }
  });

  it("toggles an area from the map and syncs the chips, field and hidden inputs", async () => {
    const user = userEvent.setup();
    const { formData } = renderInForm({ mode: "multi", name: "areas" });
    await openPicker(user);

    await user.click(region("Knee · Left"));
    expect(chip("Knee")).toHaveAttribute("aria-pressed", "true");
    // Multi mode has no side: both knees light up.
    expect(region("Knee · Right")).toHaveAttribute("aria-checked", "true");

    await user.click(chip("Neck"));
    expect(region("Neck")).toHaveAttribute("aria-checked", "true");
    expect(formData().getAll("areas")).toEqual(["neck", "knee"]);
    expect(screen.getByRole("button", { name: "Body areas Neck, Knee" })).toBeInTheDocument();

    await user.click(region("Knee · Right"));
    expect(formData().getAll("areas")).toEqual(["neck"]);
  });

  it("switches to the back view", async () => {
    const user = userEvent.setup();
    const { formData } = renderInForm({ mode: "multi", name: "areas" });
    await openPicker(user);
    expect(within(panel()).queryByRole("group", { name: "Back" })).not.toBeInTheDocument();

    await user.click(within(panel()).getByRole("radio", { name: "Back" }));
    await user.click(region("Glute · Left", "Back"));
    expect(formData().getAll("areas")).toEqual(["glute"]);
    expect(within(panel()).queryByRole("group", { name: "Front" })).not.toBeInTheDocument();
  });

  it("offers full body as a chip only", async () => {
    const user = userEvent.setup();
    const { formData } = renderInForm({ mode: "multi", name: "areas" });
    await openPicker(user);
    expect(document.querySelector('[data-region*="full_body"]')).toBeNull();
    await user.click(chip("Full body"));
    expect(formData().getAll("areas")).toEqual(["full_body"]);
  });

  it("keeps a controlled value's hidden inputs in canonical order", () => {
    const { formData } = renderInForm({ mode: "multi", name: "areas", value: ["knee", "neck"] });
    expect(formData().getAll("areas")).toEqual(["neck", "knee"]);
  });

  it("submits only the named fields", async () => {
    const user = userEvent.setup();
    const { formData } = renderInForm({ mode: "multi", name: "areas" });
    await openPicker(user);
    await user.click(chip("Elbow"));
    expect([...formData().keys()]).toEqual(["areas"]);
  });

  it("closes with Done", async () => {
    const user = userEvent.setup();
    renderInForm({ mode: "multi", name: "areas", label: "Areas" });
    await openPicker(user, /^Areas/);
    await user.click(within(panel()).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("toggles chips from the keyboard", async () => {
    const user = userEvent.setup();
    const { formData } = renderInForm({ mode: "multi", name: "areas" });
    await openPicker(user);
    chip("Head and jaw").focus();
    await user.keyboard("{ArrowRight}");
    expect(chip("Neck")).toHaveFocus();
    await user.keyboard(" ");
    expect(formData().getAll("areas")).toEqual(["neck"]);
  });

  it("puts focus on the chips when opened", async () => {
    const user = userEvent.setup();
    renderInForm({ mode: "multi", name: "areas", defaultValue: ["knee", "neck"] });
    await openPicker(user);
    // Radix's roving focus keeps one tab stop: the first chosen chip.
    expect(chip("Neck")).toHaveFocus();
  });

  it("clears every area", async () => {
    const user = userEvent.setup();
    const { formData } = renderInForm({ mode: "multi", name: "areas", defaultValue: ["neck"] });
    await openPicker(user);
    await user.click(within(panel()).getByRole("button", { name: "Clear" }));
    expect(formData().getAll("areas")).toEqual([]);
    expect(within(panel()).queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("ties the field to its error message", () => {
    renderInForm({ mode: "multi", name: "areas", invalid: true, describedBy: "areas-error" });
    const field = screen.getByRole("button", { name: /^Body areas/ });
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", "areas-error");
  });

  it("keeps the selection after a React form action resets the form", async () => {
    const user = userEvent.setup();
    const submitted: FormDataEntryValue[][] = [];
    let resets = 0;
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <form
          aria-label="test form"
          action={async (formData: FormData) => {
            submitted.push(formData.getAll("areas"));
          }}
        >
          <BodyAreaPicker mode="multi" name="areas" defaultValue={["neck", "knee"]} />
          <button type="submit">Save</button>
        </form>
      </NextIntlClientProvider>,
    );
    const form = screen.getByRole("form", { name: "test form" }) as HTMLFormElement;
    form.addEventListener("reset", () => resets++);
    await user.click(screen.getByRole("button", { name: "Save" }));

    // React 19 resets a <form action={fn}> once the action settles.
    await waitFor(() => expect(resets).toBe(1));
    expect(submitted).toEqual([["neck", "knee"]]);
    expect(new FormData(form).getAll("areas")).toEqual(["neck", "knee"]);
    expect(screen.getByRole("button", { name: "Body areas Neck, Knee" })).toBeInTheDocument();
  });
});

describe("BodyAreaPicker single with side", () => {
  it("combines both sides into both and cycles back", async () => {
    const user = userEvent.setup();
    const { formData } = renderInForm({ mode: "single", withSide: true, name: "area" });
    expect(screen.getByRole("button", { name: "Body area Choose a body area" })).toBeVisible();
    await openPicker(user);

    await user.click(region("Knee · Left"));
    expect(formData().get("area")).toBe("knee");
    expect(formData().get("areaSide")).toBe("left");
    expect(radio("Knee")).toBeChecked();
    expect(radio("Left")).toBeChecked();
    expect(screen.getByRole("button", { name: "Body area Knee · Left" })).toBeInTheDocument();

    await user.click(region("Knee · Right"));
    expect(formData().get("areaSide")).toBe("both");
    expect(radio("Both")).toBeChecked();

    await user.click(region("Knee · Left"));
    expect(formData().get("areaSide")).toBe("right");
    expect(region("Knee · Left")).toHaveAttribute("aria-checked", "false");
  });

  it("drops the side when switching to a midline area", async () => {
    const user = userEvent.setup();
    const { formData } = renderInForm({ mode: "single", withSide: true, name: "area" });
    await openPicker(user);
    await user.click(region("Knee · Left"));
    await user.click(region("Neck"));
    expect(formData().get("area")).toBe("neck");
    expect(formData().get("areaSide")).toBe("");
    expect(within(panel()).queryByRole("group", { name: "Side" })).not.toBeInTheDocument();
  });

  it("works from the chips", async () => {
    const user = userEvent.setup();
    const { formData } = renderInForm({ mode: "single", withSide: true, name: "area" });
    await openPicker(user);
    await user.click(radio("Shoulder"));
    expect(formData().get("area")).toBe("shoulder");
    expect(formData().get("areaSide")).toBe("");

    await user.click(radio("Right"));
    expect(formData().get("areaSide")).toBe("right");
    expect(region("Shoulder · Right")).toHaveAttribute("aria-checked", "true");
    expect(region("Shoulder · Left")).toHaveAttribute("aria-checked", "false");

    // Choosing the selected chip again clears it.
    await user.click(radio("Shoulder"));
    expect(formData().get("area")).toBe("");
  });

  it("drops the side when the chosen side is chosen again", async () => {
    const user = userEvent.setup();
    const { formData } = renderInForm({ mode: "single", withSide: true, name: "area" });
    await openPicker(user);
    await user.click(region("Knee · Left"));
    await user.click(radio("Left"));
    expect(formData().get("area")).toBe("knee");
    expect(formData().get("areaSide")).toBe("");
  });

  it("works from the keyboard across groups and into the side", async () => {
    const user = userEvent.setup();
    const { formData } = renderInForm({ mode: "single", withSide: true, name: "area" });
    await openPicker(user);
    expect(radio("Head and jaw")).toHaveFocus();
    // Arrow keys move across group boundaries: Forearm… is the last upper-body chip.
    await user.keyboard("{ArrowLeft}");
    expect(radio("Ankle and foot")).toHaveFocus();
    await user.keyboard(" ");
    expect(formData().get("area")).toBe("ankle_foot");
    await user.tab();
    expect(radio("Left")).toHaveFocus();
    await user.keyboard("{ArrowRight}{ArrowRight} ");
    expect(formData().get("areaSide")).toBe("right");
  });

  it("never offers full body and can be cleared", async () => {
    const user = userEvent.setup();
    const { formData } = renderInForm({
      mode: "single",
      withSide: true,
      name: "area",
      defaultValue: { area: "elbow", side: "left" },
    });
    await openPicker(user);
    expect(within(panel()).queryByRole("radio", { name: "Full body" })).not.toBeInTheDocument();
    await user.click(within(panel()).getByRole("button", { name: "Clear" }));
    expect(formData().get("area")).toBe("");
    expect(formData().get("areaSide")).toBe("");
    expect([...formData().keys()].sort()).toEqual(["area", "areaSide"]);
  });

  it("keeps the area and side when the form is reset", async () => {
    const user = userEvent.setup();
    const { form, formData } = renderInForm({ mode: "single", withSide: true, name: "area" });
    await openPicker(user);
    await user.click(region("Knee · Left"));

    act(() => form.reset());

    expect(formData().getAll("area")).toEqual(["knee"]);
    expect(formData().getAll("areaSide")).toEqual(["left"]);
  });
});

describe("BodyAreaPicker single without side", () => {
  it("records the area only", async () => {
    const user = userEvent.setup();
    const { formData } = renderInForm({ mode: "single", name: "area" });
    await openPicker(user);
    await user.click(region("Knee · Left"));
    expect(formData().get("area")).toBe("knee");
    expect(formData().has("areaSide")).toBe(false);
    expect(region("Knee · Right")).toHaveAttribute("aria-checked", "true");
    expect(within(panel()).queryByRole("group", { name: "Side" })).not.toBeInTheDocument();
  });
});

describe("BodyAreaPicker controlled", () => {
  it("reports the next value and shows what the parent passes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderInForm({ mode: "single", withSide: true, value: null, onChange });
    await openPicker(user);
    await user.click(region("Knee · Left"));
    expect(onChange).toHaveBeenCalledWith({ area: "knee", side: "left" });
    // The parent ignored the change, so nothing is selected.
    expect(region("Knee · Left")).toHaveAttribute("aria-checked", "false");
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
    await openPicker(user);
    expect(radio("Neck")).toBeChecked();
    await user.click(region("Elbow · Right"));
    expect(radio("Elbow")).toBeChecked();
    expect(radio("Right")).toBeChecked();
  });
});

describe("BodyAreaPicker localised", () => {
  it("names sided map regions so the side agrees with any area", async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="es" messages={esMessages} timeZone="UTC">
        <BodyAreaPicker mode="multi" />
      </NextIntlClientProvider>,
    );
    await openPicker(user, /^Zonas del cuerpo/);
    const front = within(panel()).getByRole("group", { name: "Frente" });
    expect(within(front).getByRole("checkbox", { name: "Rodilla · lado izquierdo" })).toBeVisible();
    expect(
      within(front).getByRole("checkbox", { name: "Cadera e ingle · lado derecho" }),
    ).toBeVisible();
  });
});
