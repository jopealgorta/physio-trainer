import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Visit notes are private clinical notes (spec 16): patient-facing code (`src/server/patient/`,
 * the `(patient)` routes) and exports (`src/app/api/**`) must never read them. Instead of
 * listing today's patient and export directories, this allow-lists every place that may mention
 * visit notes, so any new file that does fails here and has to be justified.
 */
const SRC = path.resolve(__dirname, "../..");
const MENTIONS = /visit[-_]?notes?|visitNote/i;
const THIS_FILE = path.basename(__filename);

const ALLOWED = [
  "db/", // schema and enums
  "lib/visit-note", // pure helpers
  "server/visit-notes/",
  "components/visit-notes/",
  "components/customers/customer-overview", // renders the latest-note card
  "app/(app)/customers/", // the customer page and its Notes tab
  "i18n/", // message key tests
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("visit notes stay private", () => {
  const files = sourceFiles(SRC).map((file) => path.relative(SRC, file).split(path.sep).join("/"));

  it("only the allow-listed areas reference visit notes", () => {
    const offenders = files.filter(
      (file) =>
        path.basename(file) !== THIS_FILE &&
        !ALLOWED.some((prefix) => file.startsWith(prefix)) &&
        MENTIONS.test(readFileSync(path.join(SRC, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("patient-facing and export code never touches them, even inside allowed areas", () => {
    const sensitive = files.filter(
      (file) =>
        file.startsWith("server/patient/") ||
        file.startsWith("app/(patient)/") ||
        file.startsWith("app/api/") ||
        /export/i.test(path.basename(file)),
    );
    const offenders = sensitive.filter((file) =>
      MENTIONS.test(readFileSync(path.join(SRC, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("the check can see the files it guards (the scan is not vacuously empty)", () => {
    expect(files).toContain("server/visit-notes/queries.ts");
    expect(files.some((file) => MENTIONS.test(readFileSync(path.join(SRC, file), "utf8")))).toBe(
      true,
    );
  });
});
