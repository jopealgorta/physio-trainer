import { describe, expect, it, vi } from "vitest";

import type { ShareLink } from "@/db/schema";
import { endOfDay } from "@/lib/calendar-date";

import type { ShareContext } from "./mutations";
import { linkStatus, toLinkView, toShareState } from "./view";

// Unit tests run without the int config's server-only alias; the real package throws here.
vi.mock("server-only", () => ({}));

const NOW = new Date("2026-10-07T12:00:00Z");

const link = (patch: Partial<ShareLink> = {}): ShareLink => ({
  id: "l1",
  physioId: "p1",
  customerId: "c1",
  target: "customer",
  routineId: null,
  weeklyPlanId: null,
  slug: "ana",
  code: "7k2m9qpx",
  pinHash: null,
  expiresAt: null,
  revokedAt: null,
  lastOpenedAt: null,
  openCount: 0,
  createdAt: NOW,
  updatedAt: NOW,
  ...patch,
});

const context = (patch: Partial<ShareContext["customer"]> = {}): ShareContext => ({
  physioId: "p1",
  handle: "maria-lopez",
  timeZone: "America/Montevideo",
  customer: {
    id: "c1",
    firstName: "Ana",
    phone: "+598 99 123 456",
    email: "ana@example.com",
    locale: "en",
    archived: false,
    ...patch,
  },
  itemName: "Ana",
  itemStatus: null,
});

describe("linkStatus", () => {
  it("is revoked, expired or active", () => {
    expect(linkStatus(link(), NOW)).toBe("active");
    expect(linkStatus(link({ revokedAt: NOW }), NOW)).toBe("revoked");
    expect(linkStatus(link({ expiresAt: new Date("2026-10-07T11:59:59Z") }), NOW)).toBe("expired");
    expect(linkStatus(link({ expiresAt: new Date("2026-10-07T12:00:01Z") }), NOW)).toBe("active");
    // Revoked wins over expired.
    expect(linkStatus(link({ revokedAt: NOW, expiresAt: new Date(0) }), NOW)).toBe("revoked");
  });
});

describe("toLinkView", () => {
  it("builds the public URL and never exposes the PIN hash", () => {
    const view = toLinkView(
      link({ pinHash: "secret-hash" }),
      context(),
      "https://app.example/",
      NOW,
    );
    expect(view).toMatchObject({
      url: "https://app.example/maria-lopez/ana-7k2m9qpx",
      hasPin: true,
      status: "active",
      expiresOn: null,
    });
    expect(JSON.stringify(view)).not.toContain("secret-hash");
    expect(view.qr.size).toBeGreaterThanOrEqual(21);
  });

  it("reports the expiry as the last working day in the physio's time zone", () => {
    const expiresAt = endOfDay("America/Montevideo", "2026-10-31");
    expect(toLinkView(link({ expiresAt }), context(), "https://a", NOW).expiresOn).toBe(
      "2026-10-31",
    );
  });
});

describe("toShareState", () => {
  const message = { subject: "Your exercises", body: "Hi Ana! {url}" };

  it("puts the URL into WhatsApp and email messages", () => {
    const state = toShareState(link(), context(), "https://app.example", message, NOW);
    const url = encodeURIComponent("https://app.example/maria-lopez/ana-7k2m9qpx");
    expect(state.whatsappHref).toBe(`https://wa.me/59899123456?text=Hi%20Ana!%20${url}`);
    expect(state.mailtoHref).toBe(
      `mailto:ana@example.com?subject=Your%20exercises&body=Hi%20Ana!%20${url}`,
    );
    expect(state.today).toBe("2026-10-07");
  });

  it("falls back to the WhatsApp chooser and an empty mailto without contact details", () => {
    const state = toShareState(
      link(),
      context({ phone: null, email: null }),
      "https://a",
      message,
      NOW,
    );
    expect(state.whatsappHref.startsWith("https://wa.me/?text=")).toBe(true);
    expect(state.mailtoHref.startsWith("mailto:?subject=")).toBe(true);
  });

  it("describes the card the link unfurls into, with a versioned image path", () => {
    const preview = { title: "Your exercise plan · Maria", description: "Open it.", version: "v9" };
    const state = toShareState(link(), context(), "https://app.example", message, NOW, preview);
    expect(state.preview).toEqual({
      imagePath: "/maria-lopez/ana-7k2m9qpx/og?v=v9",
      title: "Your exercise plan · Maria",
      description: "Open it.",
      host: "app.example",
    });
  });

  it("has no preview for a revoked link or without a link", () => {
    const preview = { title: "t", description: "d", version: "v" };
    const revoked = link({ revokedAt: NOW });
    expect(toShareState(revoked, context(), "https://a", message, NOW, preview).preview).toBeNull();
    expect(toShareState(null, context(), "https://a", message, NOW, preview).preview).toBeNull();
    expect(toShareState(link(), context(), "https://a", message, NOW).preview).toBeNull();
  });

  it("has no link yet when there is none", () => {
    expect(toShareState(null, context(), "https://a", message, NOW).link).toBeNull();
  });
});
