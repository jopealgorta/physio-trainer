import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import messages from "../../../messages/en.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/customers/actions", () => ({ setCustomerArchivedAction: vi.fn() }));
vi.mock("@/server/sharing/actions", () => ({
  loadShareAction: vi.fn(),
  renewShareLinkAction: vi.fn(),
  revokeShareLinkAction: vi.fn(),
  setSharePinAction: vi.fn(),
  updateShareLinkAction: vi.fn(),
}));

import { CustomerHeader, type HeaderCustomer } from "./customer-header";

const base: HeaderCustomer = {
  id: "c1",
  firstName: "Ana",
  lastName: "Pérez",
  email: null,
  phone: null,
  archivedAt: null,
};

function setup(customer: Partial<HeaderCustomer> = {}, age: number | null = null) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <CustomerHeader customer={{ ...base, ...customer }} age={age} />
    </NextIntlClientProvider>,
  );
}

describe("CustomerHeader", () => {
  it("shows the full name as the page heading with a decorative avatar", () => {
    const { container } = setup();
    expect(screen.getByRole("heading", { level: 1, name: "Ana Pérez" })).toBeInTheDocument();
    expect(container.querySelector("[aria-hidden='true']")).toHaveTextContent("AP");
  });

  it("uses just the first name when there is no last name", () => {
    setup({ lastName: null });
    expect(screen.getByRole("heading", { level: 1, name: "Ana" })).toBeInTheDocument();
  });

  it("shows the age, pluralised, only when known", () => {
    const { unmount } = setup({}, 36);
    expect(screen.getByText("36 years old")).toBeInTheDocument();
    unmount();
    const again = setup({}, 1);
    expect(screen.getByText("1 year old")).toBeInTheDocument();
    again.unmount();
    setup({}, null);
    expect(screen.queryByText(/year/)).not.toBeInTheDocument();
  });

  it("offers no contact actions when there are no contact details", () => {
    setup();
    expect(screen.queryByRole("link", { name: "Call" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Email" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "WhatsApp" })).not.toBeInTheDocument();
  });

  it("offers Call and Email when a local phone and an email exist, but no WhatsApp", () => {
    setup({ phone: "099 123 456", email: "ana@example.com" });
    expect(screen.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:099123456");
    expect(screen.getByRole("link", { name: "Email" })).toHaveAttribute(
      "href",
      "mailto:ana@example.com",
    );
    expect(screen.queryByRole("link", { name: "WhatsApp" })).not.toBeInTheDocument();
  });

  it("offers WhatsApp in a new tab for an international number", () => {
    setup({ phone: "+598 99 123 456" });
    const whatsapp = screen.getByRole("link", { name: "WhatsApp" });
    expect(whatsapp).toHaveAttribute("href", "https://wa.me/59899123456");
    expect(whatsapp).toHaveAttribute("target", "_blank");
    expect(whatsapp).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:+59899123456");
  });

  it("never links garbage phone text", () => {
    setup({ phone: "javascript:alert(1)" });
    expect(screen.queryByRole("link", { name: "Call" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "WhatsApp" })).not.toBeInTheDocument();
  });

  it("links to the edit page", () => {
    setup();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/customers/c1/edit",
    );
  });

  it("shows Archive for active customers and Restore for archived ones", () => {
    const { unmount } = setup();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    unmount();
    setup({ archivedAt: new Date("2026-02-01T00:00:00Z") });
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  it("offers sharing, except for an archived customer (their links are revoked)", () => {
    const { unmount } = setup();
    expect(screen.getByRole("button", { name: "Share all active" })).toBeInTheDocument();
    unmount();
    setup({ archivedAt: new Date("2026-10-01T00:00:00Z") });
    expect(screen.queryByRole("button", { name: "Share all active" })).not.toBeInTheDocument();
  });
});
