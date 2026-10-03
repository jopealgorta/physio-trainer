// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const load = async () => (await import("./env")).env;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("SKIP_ENV_VALIDATION", "");
  vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres");
  vi.stubEnv("SUPABASE_SECRET_KEY", "secret");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("WORKOUT_MODE_ENABLED", () => {
  it("defaults to hidden", async () => {
    vi.stubEnv("WORKOUT_MODE_ENABLED", "");
    expect((await load()).WORKOUT_MODE_ENABLED).toBe(false);
  });

  it.each([
    ["true", true],
    ["false", false],
  ])("reads %s", async (value, expected) => {
    vi.stubEnv("WORKOUT_MODE_ENABLED", value);
    expect((await load()).WORKOUT_MODE_ENABLED).toBe(expected);
  });
});
