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

function renderForm() {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <LoginForm next="/dashboard" googleEnabled={false} error={null} />
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
});
