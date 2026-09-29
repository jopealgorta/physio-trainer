import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";

const refresh = vi.fn();
const setArchived = vi.fn();
const remove = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/server/library/actions", () => ({
  setExerciseArchivedAction: (...args: unknown[]) => setArchived(...args),
  deleteExerciseAction: (...args: unknown[]) => remove(...args),
}));

import { ExerciseActions } from "./exercise-actions";

function setup(archived = false) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ExerciseActions id="ex1" name="Bridge" archived={archived} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setArchived.mockResolvedValue({ ok: true, data: null });
});

describe("ExerciseActions", () => {
  it("archives and refreshes", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setArchived).toHaveBeenCalledWith("ex1", true);
  });

  it("restores an archived exercise", async () => {
    const user = userEvent.setup();
    setup(true);
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setArchived).toHaveBeenCalledWith("ex1", false);
  });

  it("confirms before deleting", async () => {
    const user = userEvent.setup();
    remove.mockResolvedValue({ ok: true, data: null });
    setup();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("alertdialog", { name: "Delete this exercise?" })).toHaveTextContent(
      "“Bridge”",
    );
    expect(remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete exercise" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("ex1"));
  });

  it("shows an error when the exercise is gone", async () => {
    const user = userEvent.setup();
    remove.mockResolvedValue({ ok: false, error: "notFound" });
    setup();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete exercise" }));
    expect(await screen.findByText("This exercise no longer exists.")).toBeInTheDocument();
  });

  it("shows an error when archiving fails", async () => {
    const user = userEvent.setup();
    setArchived.mockResolvedValue({ ok: false, error: "notFound" });
    setup();
    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(await screen.findByText("This exercise no longer exists.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
