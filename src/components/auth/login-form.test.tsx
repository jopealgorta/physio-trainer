import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import { sendMagicLink } from "@/server/auth/actions";

import { LoginForm } from "./login-form";

vi.mock("@/server/auth/actions", () => ({ sendMagicLink: vi.fn(), signInWithGoogle: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const sendMagicLinkMock = vi.mocked(sendMagicLink);

function renderForm({ emailEnabled = true, googleEnabled = false } = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <LoginForm
        next="/dashboard"
        emailEnabled={emailEnabled}
        googleEnabled={googleEnabled}
        error={null}
      />
    </NextIntlClientProvider>,
  );
}

async function submitEmail(value: string) {
  const user = userEvent.setup();
  const email = screen.getByLabelText("Email");
  await user.type(email, value);
  await user.click(screen.getByRole("button", { name: "Send link" }));
  return email;
}

describe("LoginForm", () => {
  beforeEach(() => {
    sendMagicLinkMock.mockReset();
  });

  it("keeps the typed email and marks the field invalid after an invalid-email error", async () => {
    sendMagicLinkMock.mockImplementation(async (_state, formData) => ({
      status: "error",
      error: "emailInvalid",
      email: String(formData.get("email")),
    }));
    renderForm();
    const email = await submitEmail("maria@clinic");

    const error = await screen.findByText("Enter a valid email address.");
    expect(email).toHaveValue("maria@clinic");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("aria-describedby", error.id);
  });

  it("keeps the email after a send failure without calling the field invalid", async () => {
    sendMagicLinkMock.mockImplementation(async (_state, formData) => ({
      status: "error",
      error: "sendFailed",
      email: String(formData.get("email")),
    }));
    renderForm();
    const email = await submitEmail("maria@clinic.example");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't send the link. Wait a moment and try again.",
    );
    expect(email).toHaveValue("maria@clinic.example");
    expect(email).toHaveAttribute("aria-invalid", "false");
    expect(email).not.toHaveAttribute("aria-describedby");
  });

  it("shows only Google sign-in when email sign-in is disabled", () => {
    renderForm({ emailEnabled: false, googleEnabled: true });

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByText("Continue with your Google account.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send link" })).not.toBeInTheDocument();
    expect(screen.queryByText("or")).not.toBeInTheDocument();
    expect(
      screen.queryByText("We'll email you a link. No password needed."),
    ).not.toBeInTheDocument();
  });

  it("shows both sign-in options with a divider when both are enabled", () => {
    renderForm({ emailEnabled: true, googleEnabled: true });

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send link" })).toBeInTheDocument();
    expect(screen.getByText("or")).toBeInTheDocument();
  });
});
