import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendMagicLink, signInWithGoogle, signOut } from "./actions";

const { auth, env } = vi.hoisted(() => ({
  auth: { signInWithOtp: vi.fn(), signInWithOAuth: vi.fn(), signOut: vi.fn() },
  env: { NEXT_PUBLIC_APP_URL: "https://physio.example" },
}));

vi.mock("@/env", () => ({ env }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

beforeEach(() => {
  vi.resetAllMocks();
  env.NEXT_PUBLIC_APP_URL = "https://physio.example";
});

describe("sendMagicLink", () => {
  it.each(["https://physio.example", "https://physio.example/"])(
    "links to /auth/confirm with next (app URL %s)",
    async (appUrl) => {
      env.NEXT_PUBLIC_APP_URL = appUrl;
      auth.signInWithOtp.mockResolvedValue({ error: null });
      const state = await sendMagicLink(
        { status: "idle" },
        form({ email: " Maria@Clinic.example ", next: "/customers" }),
      );
      expect(state).toEqual({ status: "sent", email: "maria@clinic.example" });
      expect(auth.signInWithOtp).toHaveBeenCalledWith({
        email: "maria@clinic.example",
        options: { emailRedirectTo: "https://physio.example/auth/confirm?next=%2Fcustomers" },
      });
    },
  );

  it("returns the submitted email with an invalid-email error", async () => {
    const state = await sendMagicLink({ status: "idle" }, form({ email: "not-an-email" }));
    expect(state).toEqual({ status: "error", error: "emailInvalid", email: "not-an-email" });
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("returns the submitted email when sending fails", async () => {
    auth.signInWithOtp.mockResolvedValue({ error: new Error("rate limited") });
    const state = await sendMagicLink({ status: "idle" }, form({ email: "maria@clinic.example" }));
    expect(state).toEqual({ status: "error", error: "sendFailed", email: "maria@clinic.example" });
  });
});

describe("signInWithGoogle", () => {
  it("returns to /auth/callback with next, without a double slash", async () => {
    env.NEXT_PUBLIC_APP_URL = "https://physio.example/";
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.example/o" },
      error: null,
    });
    await expect(signInWithGoogle(form({ next: "/customers" }))).rejects.toThrow(
      "redirect:https://accounts.google.example/o",
    );
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://physio.example/auth/callback?next=%2Fcustomers" },
    });
  });

  it("keeps next on the error redirect when the flow cannot start", async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: new Error("off") });
    await expect(signInWithGoogle(form({ next: "/customers" }))).rejects.toThrow(
      "redirect:/login?error=oauthFailed&next=%2Fcustomers",
    );
  });
});

describe("signOut", () => {
  it("signs out this device only", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    await expect(signOut()).rejects.toThrow("redirect:/");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
