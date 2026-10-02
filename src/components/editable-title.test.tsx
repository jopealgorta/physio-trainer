import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { EditableTitle } from "./editable-title";

const validate = (name: string) =>
  name === "" ? "Enter a name." : name.length > 10 ? "Use at most 10 characters." : null;

function Harness({
  onConfirm = vi.fn(),
  initial = "Knee rehab",
}: {
  onConfirm?: (name: string) => void | Promise<string | null>;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <EditableTitle
        value={value}
        label="Routine name"
        editLabel="Rename routine"
        validate={validate}
        onConfirm={async (name) => {
          const error = await onConfirm(name);
          if (!error) setValue(name);
          return error ?? null;
        }}
      />
      <button type="button">Elsewhere</button>
    </>
  );
}

const pencil = () => screen.getByRole("button", { name: "Rename routine" });
const input = () => screen.getByRole("textbox", { name: "Routine name" });

describe("EditableTitle", () => {
  it("shows the title as a heading with a rename button, not as an input", () => {
    render(<Harness />);
    expect(screen.getByRole("heading", { level: 1, name: "Knee rehab" })).toBeInTheDocument();
    expect(pencil()).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("swaps to a focused input with the text selected", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(pencil());
    const field = input() as HTMLInputElement;
    expect(field).toHaveFocus();
    expect(field).toHaveValue("Knee rehab");
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, "Knee rehab".length]);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("confirms with Enter, trimmed, and returns focus to the rename button", async () => {
    const onConfirm = vi.fn().mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(pencil());
    await user.clear(input());
    await user.type(input(), "  Hip  {Enter}");
    expect(onConfirm).toHaveBeenCalledWith("Hip");
    expect(await screen.findByRole("heading", { name: "Hip" })).toBeInTheDocument();
    expect(pencil()).toHaveFocus();
  });

  it("confirms on blur", async () => {
    const onConfirm = vi.fn().mockReturnValue(null);
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(pencil());
    await user.clear(input());
    await user.type(input(), "Hip");
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(onConfirm).toHaveBeenCalledWith("Hip");
    expect(await screen.findByRole("heading", { name: "Hip" })).toBeInTheDocument();
  });

  it("cancels with Escape, keeping the old title", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(pencil());
    await user.type(input(), " and hip{Escape}");
    expect(screen.getByRole("heading", { name: "Knee rehab" })).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(pencil()).toHaveFocus();
  });

  it("does not confirm an unchanged title", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(pencil());
    await user.keyboard("{Enter}");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Knee rehab" })).toBeInTheDocument();
  });

  it("keeps editing and says why when the name is blank or too long", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(pencil());
    await user.clear(input());
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a name.");
    expect(input()).toHaveAttribute("aria-invalid", "true");
    expect(input()).toHaveAccessibleDescription("Enter a name.");

    await user.type(input(), "Much too long a name");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Use at most 10 characters.");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows the error the save returned and keeps the input", async () => {
    const onConfirm = vi.fn().mockResolvedValue("Couldn't save. Try again.");
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(pencil());
    await user.clear(input());
    await user.type(input(), "Hip{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save. Try again.");
    expect(input()).toHaveValue("Hip");
  });

  it("holds the input read-only while an asynchronous save is pending", async () => {
    let finish!: (error: string | null) => void;
    const onConfirm = vi.fn(() => new Promise<string | null>((done) => (finish = done)));
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(pencil());
    await user.clear(input());
    await user.type(input(), "Hip{Enter}");
    expect(input()).toHaveAttribute("readonly");
    // Blurring meanwhile does not confirm twice.
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    finish(null);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Hip" })).toBeInTheDocument());
  });
});
