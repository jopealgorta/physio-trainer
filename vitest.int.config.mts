import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Integration tests run against local Supabase (`pnpm db:start`) using .env.local.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // `server-only` throws outside React Server Components; tests are server code.
      "server-only": fileURLToPath(new URL("./src/test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.int.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
