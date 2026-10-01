import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Versions the service worker (docs/specs/18-pwa.md): a new id per deploy installs a new worker.
const buildId =
  process.env.NEXT_PUBLIC_BUILD_ID || process.env.VERCEL_GIT_COMMIT_SHA || Date.now().toString(36);

const nextConfig: NextConfig = {
  typedRoutes: true,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  // The link-preview image reads its font at runtime (spec 11); tracing cannot see that.
  outputFileTracingIncludes: {
    "/\\[handle\\]/\\[slug\\]/og": ["./src/assets/fonts/**/*"],
  },
  experimental: {
    // Branding logos are posted to a Server Action (≤ 2 MB after the browser resizes them,
    // plus multipart overhead). Default is 1 MB.
    serverActions: { bodySizeLimit: "3mb" },
  },
  async headers() {
    return [
      {
        // Browsers must always revalidate the worker script, or updates stall.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
