import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { chooseMenuAction, InPageActions, menuActions } from "@/test/page-actions";

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
      <InPageActions>
        <ExerciseActions id="ex1" name="Bridge" archived={archived} />
      </InPageActions>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setArchived.mockResolvedValue({ ok: true, data: null });
});

describe("ExerciseActions", () => {
  it("lives in the More actions menu at every size, Delete in red", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More actions" })).not.toHaveClass("sm:hidden");
    expect(await menuActions(user)).toEqual(["Archive", "Delete"]);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("menuitem", { name: "Delete" })).toHaveAttribute(
      "data-variant",
      "destructive",
    );
  });

  it("archives and refreshes", async () => {
    const user = userEvent.setup();
    setup();
    await chooseMenuAction(user, "Archive");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setArchived).toHaveBeenCalledWith("ex1", true);
  });

  it("restores an archived exercise", async () => {
    const user = userEvent.setup();
    setup(true);
    await chooseMenuAction(user, "Restore");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setArchived).toHaveBeenCalledWith("ex1", false);
  });

  it("confirms before deleting", async () => {
    const user = userEvent.setup();
    remove.mockResolvedValue({ ok: true, data: null });
    setup();
    await chooseMenuAction(user, "Delete");
    expect(
      await screen.findByRole("alertdialog", { name: "Delete this exercise?" }),
    ).toHaveTextContent("“Bridge”");
    expect(remove).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Delete exercise" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("ex1"));
  });

  it("shows an error when the exercise is gone", async () => {
    const user = userEvent.setup();
    remove.mockResolvedValue({ ok: false, error: "notFound" });
    setup();
    await chooseMenuAction(user, "Delete");
    await user.click(await screen.findByRole("button", { name: "Delete exercise" }));
    expect(await screen.findByText("This exercise no longer exists.")).toBeInTheDocument();
  });

  it("explains that an exercise used in a routine can only be archived", async () => {
    const user = userEvent.setup();
    remove.mockResolvedValue({ ok: false, error: "inUse" });
    setup();
    await chooseMenuAction(user, "Delete");
    await user.click(await screen.findByRole("button", { name: "Delete exercise" }));
    expect(
      await screen.findByText(
        "This exercise is used in a routine, so it can't be deleted. Archive it instead.",
      ),
    ).toBeInTheDocument();
    expect(await menuActions(user)).toContain("Archive");
  });

  it("shows an error when archiving fails", async () => {
    const user = userEvent.setup();
    setArchived.mockResolvedValue({ ok: false, error: "notFound" });
    setup();
    await chooseMenuAction(user, "Archive");
    expect(await screen.findByText("This exercise no longer exists.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
