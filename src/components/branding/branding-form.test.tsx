import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resizeLogo } from "@/lib/resize-image";

import messages from "../../../messages/en.json";

import { BrandingForm } from "./branding-form";

vi.mock("@/lib/resize-image", () => ({
  resizeLogo: vi.fn(async () => new File([new Uint8Array([1])], "logo.png", { type: "image/png" })),
}));

type Props = ComponentProps<typeof BrandingForm>;

const baseDefaults: Props["defaults"] = {
  displayName: "María López",
  clinicName: null,
  logoUrl: null,
  accentColor: null,
  contactEmail: null,
  contactPhone: null,
  website: null,
  showContactToPatients: true,
};

function renderForm(overrides: Partial<Props> = {}) {
  const props: Props = {
    action: vi.fn(async () => ({ status: "idle" as const })),
    defaults: baseDefaults,
    linkHost: "physiotrainer.app",
    ...overrides,
  };
  const { container } = render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <BrandingForm {...props} />
    </NextIntlClientProvider>,
  );
  return {
    action: props.action as ReturnType<typeof vi.fn<Props["action"]>>,
    previewStyle: () => container.querySelector('[data-brand="preview"] style'),
    accentInput: () => container.querySelector<HTMLInputElement>('input[name="accentColor"]'),
  };
}

const patientPage = () => screen.getByRole("figure", { name: "Patient page" });

beforeEach(() => {
  Object.assign(URL, {
    createObjectURL: vi.fn(() => "blob:preview"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.mocked(resizeLogo).mockClear();
});

describe("BrandingForm", () => {
  it("applies a palette swatch to the preview and the submitted value", async () => {
    const user = userEvent.setup();
    const { previewStyle, accentInput } = renderForm();
    const group = screen.getByRole("radiogroup", { name: "Accent colour" });
    const teal = within(group).getByRole("radio", { name: "Teal" });

    await user.click(teal);
    expect(teal).toHaveAttribute("aria-checked", "true");
    expect(within(group).getByRole("radio", { name: "Default" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(previewStyle()?.textContent).toContain("--primary:#0f766e");
    expect(accentInput()).toHaveValue("#0f766e");
    expect(screen.getByLabelText("Hex code")).toHaveValue("#0f766e");
    expect(screen.getByLabelText("Custom colour")).toHaveValue("#0f766e");
  });

  it("notes when a typed colour had to be adjusted for contrast", async () => {
    const user = userEvent.setup();
    const { accentInput } = renderForm();
    const hex = screen.getByLabelText("Hex code");
    const note = "Adjusted slightly so buttons stay readable in light and dark mode.";

    await user.type(hex, "#ffff");
    expect(screen.getByText("Enter a colour like #0f766e.")).toBeInTheDocument();
    await user.type(hex, "00");
    expect(hex).toHaveValue("#ffff00");
    expect(accentInput()).toHaveValue("#ffff00");
    expect(screen.getByText(note)).toBeInTheDocument();
    expect(screen.queryByText("Enter a colour like #0f766e.")).not.toBeInTheDocument();
  });

  it("goes back to the app default colour", async () => {
    const user = userEvent.setup();
    const { previewStyle, accentInput } = renderForm({
      defaults: { ...baseDefaults, accentColor: "#2563eb" },
    });
    expect(screen.getByRole("radio", { name: "Blue" })).toHaveAttribute("aria-checked", "true");
    expect(previewStyle()).not.toBeNull();

    await user.click(screen.getByRole("radio", { name: "Default" }));
    expect(screen.getByRole("radio", { name: "Default" })).toHaveAttribute("aria-checked", "true");
    expect(previewStyle()).toBeNull();
    expect(accentInput()).toHaveValue("");
  });

  it("shows the clinic name in the preview, falling back to the display name", async () => {
    const user = userEvent.setup();
    renderForm();
    const name = screen.getByLabelText("Clinic or practice name");
    expect(within(patientPage()).getByText("María López")).toBeInTheDocument();

    await user.type(name, "Kine Sur");
    expect(within(patientPage()).getByText("Kine Sur")).toBeInTheDocument();
    expect(
      within(screen.getByRole("figure", { name: "Shared link" })).getByText(
        "Your exercises from Kine Sur",
      ),
    ).toBeInTheDocument();

    await user.clear(name);
    expect(within(patientPage()).getByText("María López")).toBeInTheDocument();
  });

  it("shows contact buttons only when they are shared with patients", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Phone"), "+5491112345678");
    expect(within(patientPage()).getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/5491112345678",
    );
    expect(within(patientPage()).getByRole("link", { name: "Call" })).toHaveAttribute(
      "href",
      "tel:+5491112345678",
    );

    await user.click(screen.getByLabelText("Show contact details to patients"));
    expect(within(patientPage()).queryByRole("link", { name: "WhatsApp" })).not.toBeInTheDocument();
  });

  it("rejects files that are not PNG, WebP or JPEG without resizing them", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderForm();
    await user.upload(
      screen.getByLabelText("Logo", { exact: true }),
      new File(["hello"], "notes.txt", { type: "text/plain" }),
    );
    expect(await screen.findByText("Choose a PNG, WebP or JPEG image.")).toBeInTheDocument();
    expect(resizeLogo).not.toHaveBeenCalled();
  });

  it("uploads the resized logo with the other fields", async () => {
    const action = vi.fn<Props["action"]>(async () => ({
      status: "saved",
      logoUrl: "https://cdn.example/logo.png",
    }));
    const user = userEvent.setup();
    renderForm({ action });

    await user.type(screen.getByLabelText("Clinic or practice name"), "Kine Sur");
    await user.click(screen.getByRole("radio", { name: "Teal" }));
    await user.upload(
      screen.getByLabelText("Logo", { exact: true }),
      new File([new Uint8Array([0x89, 0x50])], "logo.png", { type: "image/png" }),
    );
    await waitFor(() =>
      expect(within(patientPage()).getByRole("img", { name: "Kine Sur logo" })).toHaveAttribute(
        "src",
        "blob:preview",
      ),
    );

    await user.click(screen.getByRole("button", { name: "Save branding" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const formData = action.mock.calls[0][1];
    const logo = formData.get("logo");
    expect(logo).toBeInstanceOf(File);
    expect((logo as File).type).toBe("image/png");
    expect(formData.get("clinicName")).toBe("Kine Sur");
    expect(formData.get("accentColor")).toBe("#0f766e");
    expect(formData.get("showContactToPatients")).toBe("on");
    expect(formData.get("removeLogo")).toBeNull();

    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    expect(within(patientPage()).getByRole("img", { name: "Kine Sur logo" })).toHaveAttribute(
      "src",
      "https://cdn.example/logo.png",
    );
  });

  it("removes the current logo", async () => {
    const action = vi.fn<Props["action"]>(async () => ({ status: "idle" }));
    const user = userEvent.setup();
    renderForm({
      action,
      defaults: { ...baseDefaults, clinicName: "Kine Sur", logoUrl: "https://cdn.example/a.png" },
    });
    expect(within(patientPage()).getByRole("img", { name: "Kine Sur logo" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove logo" }));
    expect(within(patientPage()).queryByRole("img")).not.toBeInTheDocument();
    expect(within(patientPage()).getByText("K")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove logo" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save branding" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action.mock.calls[0][1].get("removeLogo")).toBe("1");
  });

  it("shows field errors from the server", async () => {
    const action = vi.fn<Props["action"]>(async () => ({
      status: "error",
      fieldErrors: { contactPhone: "phoneInvalid" },
    }));
    const user = userEvent.setup();
    renderForm({ action });
    await user.click(screen.getByRole("button", { name: "Save branding" }));
    expect(
      await screen.findByText("Include the country code, e.g. +54 9 11 1234 5678."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Phone")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows form-level errors in an alert", async () => {
    const action = vi.fn<Props["action"]>(async () => ({
      status: "error",
      fieldErrors: {},
      formError: "uploadFailed",
    }));
    const user = userEvent.setup();
    renderForm({ action });
    await user.click(screen.getByRole("button", { name: "Save branding" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The logo could not be uploaded. Try again.",
    );
  });
});
