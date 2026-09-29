import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { EMPTY_PRESCRIPTION, type Prescription } from "@/lib/prescription";

import messages from "../../../messages/en.json";

import { PrescriptionFields } from "./prescription-fields";

const value: Prescription = {
  sets: 3,
  reps: 8,
  repsMax: 12,
  durationSeconds: 60,
  holdSeconds: 5,
  restSeconds: 30,
  load: "5 kg",
  side: "left",
  notes: "Slow",
};

function renderFields(
  defaultValue: Prescription,
  errors?: Partial<Record<keyof Prescription, string>>,
) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <PrescriptionFields defaultValue={defaultValue} errors={errors} />
    </NextIntlClientProvider>,
  );
}

describe("PrescriptionFields", () => {
  it("renders every field with its default value", () => {
    renderFields(value);
    expect(screen.getByLabelText("Sets")).toHaveValue("3");
    expect(screen.getByLabelText("Reps")).toHaveValue("8");
    expect(screen.getByLabelText("Reps (max)")).toHaveValue("12");
    expect(screen.getByLabelText("Duration (s)")).toHaveValue("60");
    expect(screen.getByLabelText("Hold (s)")).toHaveValue("5");
    expect(screen.getByLabelText("Rest (s)")).toHaveValue("30");
    expect(screen.getByLabelText("Load")).toHaveValue("5 kg");
    expect(screen.getByLabelText("Side")).toHaveValue("left");
    expect(screen.getByLabelText("Notes")).toHaveValue("Slow");
    expect(screen.getByLabelText("Sets")).toHaveAttribute("name", "sets");
    expect(screen.getByLabelText("Reps (max)")).toHaveAttribute("name", "repsMax");
  });

  it("offers Not set plus the four sides", () => {
    renderFields(EMPTY_PRESCRIPTION);
    const options = within(screen.getByLabelText("Side")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "Not set",
      "Left",
      "Right",
      "Both sides",
      "Alternating",
    ]);
    expect(screen.getByLabelText("Side")).toHaveValue("");
  });

  it("shows translated errors and marks inputs invalid", () => {
    renderFields(EMPTY_PRESCRIPTION, {
      reps: "outOfRange",
      load: "tooLong",
      repsMax: "repsMaxNotAboveReps",
    });
    expect(screen.getByText("Enter a number from 1 to 999.")).toBeInTheDocument();
    expect(screen.getByText("Use at most 40 characters.")).toBeInTheDocument();
    expect(screen.getByText("Must be more than reps.")).toBeInTheDocument();
    expect(screen.getByLabelText("Reps")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Load")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Reps (max)")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Sets")).toHaveAttribute("aria-invalid", "false");
  });
});
