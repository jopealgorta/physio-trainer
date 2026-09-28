import { beforeEach, describe, expect, it, vi } from "vitest";

import { postSignInPath } from "./post-sign-in";

const { runAsPhysio, setLocaleCookie } = vi.hoisted(() => ({
  runAsPhysio: vi.fn(),
  setLocaleCookie: vi.fn(),
}));

// Unit tests run without the int config's server-only alias; the real package throws here.
vi.mock("server-only", () => ({}));
vi.mock("@/db/rls", () => ({ runAsPhysio }));
vi.mock("@/server/physios/queries", () => ({}));
vi.mock("@/server/i18n/locale-cookie", () => ({ setLocaleCookie }));

function supabase() {
  return {
    auth: {
      getClaims: vi.fn(async () => ({ data: { claims: { sub: "physio-1" } }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  } as never;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("postSignInPath", () => {
  it("restores an onboarded physio's language and continues to next", async () => {
    runAsPhysio.mockResolvedValue({ locale: "es", onboardedAt: new Date() });
    await expect(postSignInPath(supabase(), "token", "/customers")).resolves.toBe("/customers");
    expect(setLocaleCookie).toHaveBeenCalledWith("es");
  });

  // The new row still has the column default ("en"): keep what they picked while signed out.
  it("leaves the language alone for a physio who has not onboarded", async () => {
    runAsPhysio.mockResolvedValue({ locale: "en", onboardedAt: null });
    await expect(postSignInPath(supabase(), "token", "/dashboard")).resolves.toBe(
      "/onboarding?next=%2Fdashboard",
    );
    expect(setLocaleCookie).not.toHaveBeenCalled();
  });
});
