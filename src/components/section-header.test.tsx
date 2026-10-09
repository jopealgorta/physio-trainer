import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionHeader } from "./section-header";

describe("SectionHeader", () => {
  it("names its section with the heading, and shows the description and actions", () => {
    render(
      <section aria-labelledby="notes-title">
        <SectionHeader
          id="notes-title"
          title="Visit notes"
          description="One note per visit."
          actions={<button type="button">New note</button>}
        />
      </section>,
    );
    expect(screen.getByRole("region", { name: "Visit notes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Visit notes" })).toBeInTheDocument();
    expect(screen.getByText("One note per visit.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New note" })).toBeInTheDocument();
  });
});
