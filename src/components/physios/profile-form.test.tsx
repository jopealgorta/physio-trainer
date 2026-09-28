import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";

import { ProfileForm } from "./profile-form";

type Props = ComponentProps<typeof ProfileForm>;

function renderForm(overrides: Partial<Props> = {}) {
  const checkHandle = vi.fn(async () => true);
  const props: Props = {
    mode: "onboarding",
    action: vi.fn(async () => ({ status: "idle" as const })),
    checkHandle,
    defaults: { displayName: "Maria Lopez", handle: "maria-lopez", locale: "en", timezone: "UTC" },
    savedHandle: "physio-1a2b3c4d",
    linkBase: "physiotrainer.app",
    timeZones: [
      { value: "UTC", label: "UTC (GMT)" },
      { value: "Europe/Madrid", label: "Europe/Madrid (GMT+1)" },
    ],
    languages: [{ value: "en", label: "English" }],
    ...overrides,
  };
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <ProfileForm {...props} />
    </NextIntlClientProvider>,
  );
  return { checkHandle: props.checkHandle as typeof checkHandle };
}

describe("ProfileForm", () => {
  it("derives the handle from the name until the handle is edited (onboarding)", async () => {
    const user = userEvent.setup();
    renderForm();
    const name = screen.getByLabelText("Display name");
    const handle = screen.getByLabelText("Handle");

    await user.clear(name);
    await user.type(name, "Ana Ruiz");
    expect(handle).toHaveValue("ana-ruiz");

    await user.clear(handle);
    await user.type(handle, "ana-physio");
    await user.type(name, "z");
    expect(handle).toHaveValue("ana-physio");
  });

  it("keeps the suggested handle when the name has no Latin letters", async () => {
    const user = userEvent.setup();
    renderForm();
    const name = screen.getByLabelText("Display name");
    await user.clear(name);
    await user.type(name, "李伟");
    expect(screen.getByLabelText("Handle")).toHaveValue("maria-lopez");
  });

  it("does not follow the name in settings", async () => {
    const user = userEvent.setup();
    renderForm({ mode: "settings", savedHandle: "maria-lopez" });
    await user.type(screen.getByLabelText("Display name"), " Garcia");
    expect(screen.getByLabelText("Handle")).toHaveValue("maria-lopez");
  });

  it("explains unusable handles without asking the server", async () => {
    const user = userEvent.setup();
    const { checkHandle } = renderForm({
      defaults: { displayName: "", handle: "", locale: "en", timezone: "UTC" },
    });
    const handle = screen.getByLabelText("Handle");

    await user.type(handle, "Dashboard");
    expect(handle).toHaveValue("dashboard");
    expect(screen.getByText("That handle is reserved. Pick another.")).toBeInTheDocument();

    await user.clear(handle);
    await user.type(handle, "ab");
    expect(screen.getByText("Use at least 3 characters.")).toBeInTheDocument();
    expect(checkHandle).not.toHaveBeenCalled();
  });

  it("checks availability once typing stops", async () => {
    const user = userEvent.setup();
    const checkHandle = vi.fn(async (value: string) => value !== "taken-one");
    renderForm({ checkHandle });
    const handle = screen.getByLabelText("Handle");

    await user.clear(handle);
    await user.type(handle, "taken-one");
    expect(screen.getByText("Checking availability…")).toBeInTheDocument();
    expect(await screen.findByText("That handle is already taken.")).toBeInTheDocument();
    expect(checkHandle).toHaveBeenLastCalledWith("taken-one");
    expect(checkHandle).not.toHaveBeenCalledWith("t");

    await user.clear(handle);
    await user.type(handle, "free-one");
    expect(await screen.findByText("Available")).toBeInTheDocument();
  });

  it("shows the link preview with the current handle", () => {
    renderForm();
    expect(
      screen.getByText("Patient links will look like physiotrainer.app/maria-lopez/ana-7k2m9qpx"),
    ).toBeInTheDocument();
  });

  it("warns about changing the handle only in settings", async () => {
    const user = userEvent.setup();
    renderForm({ mode: "settings", savedHandle: "maria-lopez" });
    const notice = "Links you already shared keep working and will show your new handle.";
    expect(screen.queryByText(notice)).not.toBeInTheDocument();

    const handle = screen.getByLabelText("Handle");
    await user.clear(handle);
    await user.type(handle, "maria-physio");
    expect(screen.getByText(notice)).toBeInTheDocument();
  });

  it("shows a server-side 'taken' error for the submitted handle", async () => {
    const action = vi.fn(async () => ({
      status: "error" as const,
      fieldErrors: { handle: "taken" as const },
      submittedHandle: "maria-lopez",
    }));
    const user = userEvent.setup();
    renderForm({ action });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(screen.getByText("That handle is already taken.")).toBeInTheDocument(),
    );
  });

  it("announces a server-side display name error to screen readers", async () => {
    const action = vi.fn(async () => ({
      status: "error" as const,
      fieldErrors: { displayName: "displayNameRequired" as const },
      submittedHandle: "maria-lopez",
    }));
    const user = userEvent.setup();
    renderForm({ action });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Enter your name.")).toHaveAttribute("aria-live", "polite");
  });
});
