import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { PinGate } from "./pin-gate";

const m = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@/server/patient/actions", () => ({ verifyPinAction: m.verify }));

function setup(locale: "en" | "es" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : es}>
      <PinGate code="7k2m9qpx" clinicName="Maria Physio" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => m.verify.mockReset());

describe("PinGate", () => {
  it("asks for a four-digit PIN with a numeric keypad", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Enter your PIN" })).toBeInTheDocument();
    expect(
      screen.getByText("Maria Physio protected this page with a 4-digit PIN."),
    ).toBeInTheDocument();
    const input = screen.getByLabelText("PIN");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("maxlength", "4");
    expect(input).toHaveAttribute("pattern", "[0-9]{4}");
  });

  it("binds the link code and sends only the typed PIN", async () => {
    m.verify.mockResolvedValue({ status: "idle" });
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText("PIN"), "4821");
    await user.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(m.verify).toHaveBeenCalled());
    const [code, , formData] = m.verify.mock.calls[0]!;
    expect(code).toBe("7k2m9qpx");
    expect(Object.fromEntries(formData as FormData)).toEqual({ pin: "4821" });
  });

  it("shows a wrong-PIN message and marks the field invalid", async () => {
    m.verify.mockResolvedValue({ status: "wrong" });
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText("PIN"), "1111");
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That PIN is not right. Try again.");
    expect(screen.getByLabelText("PIN")).toHaveAttribute("aria-invalid", "true");
  });

  it("speaks Spanish when the customer's language is Spanish", () => {
    setup("es");
    expect(screen.getByRole("heading", { name: "Ingresá tu PIN" })).toBeInTheDocument();
  });
});
