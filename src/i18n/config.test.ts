import { describe, expect, it } from "vitest";

import { languageOptions, negotiateLocale, pickLocale, resolveLocale } from "./config";

describe("resolveLocale", () => {
  it.each([
    ["es", "es"],
    ["es-AR", "es"],
    ["ES_uy", "es"],
    ["en-GB", "en"],
    ["fr", "en"],
    [null, "en"],
    ["", "en"],
  ])("%j → %s", (candidate, expected) => {
    expect(resolveLocale(candidate)).toBe(expected);
  });
});

describe("negotiateLocale", () => {
  it.each([
    ["es-UY,es;q=0.9,en;q=0.8", "es"],
    ["en-US,en;q=0.9,es;q=0.8", "en"],
    ["fr-FR,es;q=0.5", "es"],
    ["fr-FR,de;q=0.9", "en"],
    ["en;q=0.5,es;q=0.9", "es"],
    ["es;q=0,en", "en"],
    ["ES-AR", "es"],
    ["*", "en"],
    ["fr,*;q=0.5,es;q=0.4", "en"],
    ["", "en"],
    [null, "en"],
    [undefined, "en"],
    [";;,q=abc,,", "en"],
    ["es;q=abc,en;q=0.1", "en"],
  ])("%j → %s", (header, expected) => {
    expect(negotiateLocale(header)).toBe(expected);
  });

  it("keeps header order for equal q-values", () => {
    expect(negotiateLocale("es;q=0.8,en;q=0.8")).toBe("es");
  });
});

describe("pickLocale", () => {
  it("prefers an explicit locale over everything", () => {
    expect(pickLocale({ explicit: "en", cookie: "es", acceptLanguage: "es" })).toBe("en");
  });

  it("prefers a valid cookie over Accept-Language", () => {
    expect(pickLocale({ cookie: "en", acceptLanguage: "es-UY" })).toBe("en");
  });

  it("falls through an unsupported cookie to Accept-Language", () => {
    expect(pickLocale({ cookie: "fr", acceptLanguage: "es-UY" })).toBe("es");
    expect(pickLocale({ cookie: "garbage", acceptLanguage: "es" })).toBe("es");
  });

  it("uses Accept-Language without a cookie, then the default", () => {
    expect(pickLocale({ acceptLanguage: "es-AR,es;q=0.9" })).toBe("es");
    expect(pickLocale({})).toBe("en");
  });
});

describe("languageOptions", () => {
  it("names every locale in its own language", () => {
    expect(languageOptions()).toEqual([
      { value: "en", label: "English" },
      { value: "es", label: "Español" },
    ]);
  });
});
