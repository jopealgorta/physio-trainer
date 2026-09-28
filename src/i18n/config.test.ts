import { describe, expect, it } from "vitest";

import { languageOptions } from "./config";

describe("languageOptions", () => {
  it("names every supported locale in the display language", () => {
    expect(languageOptions("en")).toEqual([{ value: "en", label: "English" }]);
  });
});
