import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isProtectedPath, routeGuard } from "./route-guard";

describe("routeGuard", () => {
  it("sends signed-out visitors of protected pages to login with a next param", () => {
    expect(routeGuard("/customers", "", false)).toBe("/login?next=%2Fcustomers");
    expect(routeGuard("/customers/42", "?tab=plans", false)).toBe(
      "/login?next=%2Fcustomers%2F42%3Ftab%3Dplans",
    );
    expect(routeGuard("/onboarding", "", false)).toBe("/login?next=%2Fonboarding");
  });

  it.each(["/", "/login", "/maria-lopez/ana-7k2m9qpx", "/auth/confirm", "/customersx"])(
    "lets signed-out visitors through to %s",
    (pathname) => {
      expect(routeGuard(pathname, "", false)).toBeNull();
    },
  );

  it("sends signed-in physios away from the login page", () => {
    expect(routeGuard("/login", "", true)).toBe("/dashboard");
    expect(routeGuard("/login", "?next=%2Fcustomers", true)).toBe("/customers");
    expect(routeGuard("/login", "?next=%2F%2Fevil.example", true)).toBe("/dashboard");
  });

  it("lets a signed-in physio see the login page when it carries an error", () => {
    expect(routeGuard("/login", "?error=unknown", true)).toBeNull();
  });

  it("lets signed-in physios through to protected pages", () => {
    expect(routeGuard("/customers", "", true)).toBeNull();
  });
});

describe("PROTECTED_PREFIXES", () => {
  // Every page in the physio workspace must be behind the login redirect.
  it("covers every route folder in src/app/(app)", () => {
    const appDir = path.resolve(__dirname, "../../app/(app)");
    const folders = readdirSync(appDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(folders.length).toBeGreaterThan(0);
    for (const folder of folders) {
      expect(isProtectedPath(`/${folder}`), `/${folder} must be protected`).toBe(true);
    }
  });
});
