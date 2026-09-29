import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { chooseOption } from "@/test/select";

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

  it("warns about changing the handle only in settings, without interrupting", async () => {
    const user = userEvent.setup();
    renderForm({ mode: "settings", savedHandle: "maria-lopez" });
    const notice = "Links you already shared keep working and will show your new handle.";
    expect(screen.queryByText(notice)).not.toBeInTheDocument();

    const handle = screen.getByLabelText("Handle");
    await user.clear(handle);
    await user.type(handle, "maria-physio");
    expect(screen.getByRole("status")).toHaveTextContent(notice);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the chosen selects after a successful save and submits them again", async () => {
    const action = vi.fn<Props["action"]>(async () => ({ status: "saved" }));
    const user = userEvent.setup();
    renderForm({
      mode: "settings",
      savedHandle: "maria-lopez",
      action,
      languages: [
        { value: "en", label: "English" },
        { value: "es", label: "Español" },
      ],
    });
    const timezone = screen.getByLabelText("Timezone");
    const language = screen.getByLabelText("Language");
    const save = screen.getByRole("button", { name: "Save changes" });

    await chooseOption(user, timezone, "Europe/Madrid (GMT+1)");
    await chooseOption(user, language, "Español");
    await user.click(save);
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(action).toHaveBeenCalledTimes(1);
    expect(timezone).toHaveTextContent("Europe/Madrid (GMT+1)");
    expect(language).toHaveTextContent("Español");

    await user.click(save);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    const secondSubmit = action.mock.calls[1][1];
    expect(secondSubmit.get("timezone")).toBe("Europe/Madrid");
    expect(secondSubmit.get("locale")).toBe("es");
  });

  it("shows a saved timezone that is missing from the options", () => {
    renderForm({
      mode: "settings",
      savedHandle: "maria-lopez",
      defaults: {
        displayName: "Maria Lopez",
        handle: "maria-lopez",
        locale: "en",
        timezone: "Asia/Ho_Chi_Minh",
      },
    });
    expect(screen.getByLabelText("Timezone")).toHaveTextContent("Asia/Ho Chi Minh");
    expect(document.querySelector('input[name="timezone"]')).toHaveValue("Asia/Ho_Chi_Minh");
  });

  it("defaults onboarding to the browser's zone even when it is missing from the options", () => {
    const resolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    const spy = vi
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockImplementation(function (this: Intl.DateTimeFormat) {
        return { ...resolvedOptions.call(this), timeZone: "Asia/Ho_Chi_Minh" };
      });
    try {
      renderForm();
      expect(screen.getByLabelText("Timezone")).toHaveTextContent("Asia/Ho Chi Minh");
    } finally {
      spy.mockRestore();
    }
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
