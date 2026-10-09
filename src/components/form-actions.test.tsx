import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FormActions } from "./form-actions";

describe("FormActions", () => {
  it("shows the submit button and its status in an always-present live region", () => {
    const { rerender } = render(<FormActions label="Save" status={null} />);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "submit");
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();
    rerender(<FormActions label="Save" status="Saved" />);
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("Saved");
  });

  it("disables the button while saving", () => {
    render(<FormActions label="Saving…" pending status={null} />);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });
});
