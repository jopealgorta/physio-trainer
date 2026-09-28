import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["e2e/**"],
    rules: {
      // Playwright fixtures take a `use` callback; eslint-plugin-react-hooks (which added
      // support for React 19's `use()`) treats any call to a function named `use` as a hook,
      // a false positive here.
      "react-hooks/rules-of-hooks": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "supabase/**",
  ]),
]);

export default eslintConfig;
