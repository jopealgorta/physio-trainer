import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

// E2E helpers talk to local Supabase with the keys in .env.local (`pnpm db:start`).
config({ path: [".env.local", ".env"], quiet: true });

const port = Number(process.env.PORT ?? 3100);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    // Pages now follow Accept-Language; existing specs assert English copy.
    locale: "en-US",
    trace: "on-first-retry",
    // Use a preinstalled Chromium when the bundled one is not available (e.g. sandboxes).
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Patients open links on their phones: keep a mobile project from day one.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // Links in emails and OAuth redirects must point at the e2e server, not :3000.
    env: { NEXT_PUBLIC_APP_URL: baseURL },
  },
});
