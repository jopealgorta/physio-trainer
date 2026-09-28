import { beforeEach, describe, expect, it, vi } from "vitest";

import { setLocaleAction } from "./actions";

const { setLocaleCookie } = vi.hoisted(() => ({ setLocaleCookie: vi.fn() }));

vi.mock("./locale-cookie", () => ({ setLocaleCookie }));

beforeEach(() => {
  setLocaleCookie.mockReset();
});

describe("setLocaleAction", () => {
  it.each(["en", "es"])("remembers %s", async (locale) => {
    await expect(setLocaleAction(locale)).resolves.toEqual({ ok: true });
    expect(setLocaleCookie).toHaveBeenCalledWith(locale);
  });

  // Server actions are public endpoints: callers can send anything.
  it.each(["fr", "es-AR", "", null, 42, { locale: "es" }])(
    "rejects %j without touching the cookie",
    async (input) => {
      await expect(setLocaleAction(input)).resolves.toEqual({ ok: false });
      expect(setLocaleCookie).not.toHaveBeenCalled();
    },
  );
});
