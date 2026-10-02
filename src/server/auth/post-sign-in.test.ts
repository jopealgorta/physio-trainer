import { beforeEach, describe, expect, it, vi } from "vitest";

import { postSignInPath } from "./post-sign-in";

const { runAsPhysio, setLocaleCookie, setAvatarUrl } = vi.hoisted(() => ({
  runAsPhysio: vi.fn(),
  setLocaleCookie: vi.fn(),
  setAvatarUrl: vi.fn(),
}));

// Unit tests run without the int config's server-only alias; the real package throws here.
vi.mock("server-only", () => ({}));
vi.mock("@/db/rls", () => ({ runAsPhysio }));
vi.mock("@/server/physios/queries", () => ({ getProfile: vi.fn() }));
vi.mock("@/server/physios/mutations", () => ({ setAvatarUrl }));
vi.mock("@/server/i18n/locale-cookie", () => ({ setLocaleCookie }));

const PHOTO = "https://lh3.googleusercontent.com/a/new=s96-c";

function supabase(userMetadata: Record<string, unknown> = {}) {
  return {
    auth: {
      getClaims: vi.fn(async () => ({
        data: { claims: { sub: "physio-1", user_metadata: userMetadata } },
        error: null,
      })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  } as never;
}

/** The first runAsPhysio call loads the profile; later ones run their callback for real. */
function profile(row: Record<string, unknown>) {
  runAsPhysio.mockResolvedValueOnce(row);
  runAsPhysio.mockImplementation(async (_claims, fn) => fn("tx", "physio-1"));
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("postSignInPath", () => {
  it("restores an onboarded physio's language and continues to next", async () => {
    profile({ locale: "es", onboardedAt: new Date(), avatarUrl: null });
    await expect(postSignInPath(supabase(), "token", "/customers")).resolves.toBe("/customers");
    expect(setLocaleCookie).toHaveBeenCalledWith("es");
  });

  // The new row still has the column default ("en"): keep what they picked while signed out.
  it("leaves the language alone for a physio who has not onboarded", async () => {
    profile({ locale: "en", onboardedAt: null, avatarUrl: null });
    await expect(postSignInPath(supabase(), "token", "/dashboard")).resolves.toBe(
      "/onboarding?next=%2Fdashboard",
    );
    expect(setLocaleCookie).not.toHaveBeenCalled();
  });
});

describe("postSignInPath profile photo", () => {
  it("stores a new photo from the provider's metadata", async () => {
    profile({ locale: "en", onboardedAt: new Date(), avatarUrl: "https://old.test/a" });
    await postSignInPath(supabase({ avatar_url: PHOTO }), "token", "/dashboard");
    expect(setAvatarUrl).toHaveBeenCalledWith("tx", "physio-1", PHOTO);
  });

  it("uses 'picture' when there is no avatar_url", async () => {
    profile({ locale: "en", onboardedAt: new Date(), avatarUrl: null });
    await postSignInPath(supabase({ picture: PHOTO }), "token", "/dashboard");
    expect(setAvatarUrl).toHaveBeenCalledWith("tx", "physio-1", PHOTO);
  });

  it("skips the write when the photo has not changed", async () => {
    profile({ locale: "en", onboardedAt: new Date(), avatarUrl: PHOTO });
    await postSignInPath(supabase({ avatar_url: PHOTO }), "token", "/dashboard");
    expect(setAvatarUrl).not.toHaveBeenCalled();
  });

  // Magic-link users have no photo in their metadata: never clear one Google set earlier.
  it("keeps the stored photo when the metadata has none", async () => {
    profile({ locale: "en", onboardedAt: new Date(), avatarUrl: PHOTO });
    await postSignInPath(supabase({ email_verified: true }), "token", "/dashboard");
    expect(setAvatarUrl).not.toHaveBeenCalled();
  });

  it("ignores a non-https photo", async () => {
    profile({ locale: "en", onboardedAt: new Date(), avatarUrl: null });
    await postSignInPath(supabase({ avatar_url: "http://x.test/a.png" }), "token", "/dashboard");
    expect(setAvatarUrl).not.toHaveBeenCalled();
  });

  it("still signs in when saving the photo fails, and logs why", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    profile({ locale: "es", onboardedAt: new Date(), avatarUrl: null });
    const failure = new Error("db down");
    setAvatarUrl.mockRejectedValue(failure);
    const client = supabase({ avatar_url: PHOTO });
    await expect(postSignInPath(client, "token", "/customers")).resolves.toBe("/customers");
    expect(setLocaleCookie).toHaveBeenCalledWith("es");
    expect((client as { auth: { signOut: unknown } }).auth.signOut).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("photo"), failure);
    logged.mockRestore();
  });
});
