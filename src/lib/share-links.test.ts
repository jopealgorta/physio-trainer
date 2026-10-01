import { describe, expect, it } from "vitest";

import {
  CODE_ALPHABET,
  CODE_LENGTH,
  SLUG_MAX,
  buildSharePath,
  buildShareUrl,
  generateCode,
  isShareCode,
  mailtoShareHref,
  parseSlugParam,
  shareSlug,
  whatsappShareHref,
} from "./share-links";

describe("generateCode", () => {
  it("is 8 characters from the Crockford base32 alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect([...code].every((ch) => CODE_ALPHABET.includes(ch))).toBe(true);
    }
  });

  it("has 32 symbols and leaves out i, l, o and u", () => {
    expect(CODE_ALPHABET).toHaveLength(32);
    for (const ch of "ilou") expect(CODE_ALPHABET).not.toContain(ch);
  });

  it("maps random bytes without bias (byte & 31)", () => {
    const bytes = Uint8Array.from([0, 1, 31, 32, 255, 64, 97, 128]);
    expect(generateCode(() => bytes)).toBe("01z0z010");
  });

  it("does not repeat in a sample", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateCode()));
    expect(codes.size).toBe(500);
  });
});

describe("isShareCode", () => {
  it("accepts valid codes and rejects anything else", () => {
    expect(isShareCode("7k2m9qpx")).toBe(true);
    expect(isShareCode("7k2m9qp")).toBe(false);
    expect(isShareCode("7k2m9qpxx")).toBe(false);
    expect(isShareCode("7k2m9qpi")).toBe(false);
    expect(isShareCode("7K2M9QPX")).toBe(false);
  });
});

describe("parseSlugParam", () => {
  it("takes the code after the last hyphen", () => {
    expect(parseSlugParam("ana-7k2m9qpx")).toEqual({ slug: "ana", code: "7k2m9qpx" });
    expect(parseSlugParam("knee-rehab-7k2m9qpx")).toEqual({ slug: "knee-rehab", code: "7k2m9qpx" });
  });

  it("accepts a bare code", () => {
    expect(parseSlugParam("7k2m9qpx")).toEqual({ slug: "", code: "7k2m9qpx" });
  });

  it("lowercases and decodes the parameter", () => {
    expect(parseSlugParam("Ana-7K2M9QPX")).toEqual({ slug: "ana", code: "7k2m9qpx" });
    expect(parseSlugParam("mar%C3%ADa-7k2m9qpx")).toEqual({ slug: "maría", code: "7k2m9qpx" });
  });

  it("returns null when there is no valid code", () => {
    expect(parseSlugParam("ana")).toBeNull();
    expect(parseSlugParam("ana-7k2m9qp")).toBeNull();
    expect(parseSlugParam("ana-7k2m9qpxx")).toBeNull();
    expect(parseSlugParam("ana-7k2m9qpl")).toBeNull();
    expect(parseSlugParam("")).toBeNull();
    expect(parseSlugParam("%E0%A4%A")).toBeNull();
  });
});

describe("shareSlug", () => {
  it("slugifies and caps the length without a trailing hyphen", () => {
    expect(shareSlug("María López")).toBe("maria-lopez");
    const long = shareSlug("word ".repeat(30));
    expect(long.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(long.endsWith("-")).toBe(false);
  });

  it("falls back to 'link' when nothing usable remains", () => {
    expect(shareSlug("李伟")).toBe("link");
    expect(shareSlug("")).toBe("link");
  });
});

describe("buildSharePath and buildShareUrl", () => {
  it("joins handle, slug and code", () => {
    expect(buildSharePath("maria-lopez", "ana", "7k2m9qpx")).toBe("/maria-lopez/ana-7k2m9qpx");
  });

  it("builds an absolute URL without doubling the slash", () => {
    expect(buildShareUrl("https://app.example/", "maria-lopez", "ana", "7k2m9qpx")).toBe(
      "https://app.example/maria-lopez/ana-7k2m9qpx",
    );
    expect(buildShareUrl("http://localhost:3000", "maria-lopez", "ana", "7k2m9qpx")).toBe(
      "http://localhost:3000/maria-lopez/ana-7k2m9qpx",
    );
  });
});

describe("share hrefs", () => {
  it("builds a WhatsApp link to the customer's number when it is international", () => {
    expect(whatsappShareHref("Hola https://x/y", "+598 99 123 456")).toBe(
      "https://wa.me/59899123456?text=Hola%20https%3A%2F%2Fx%2Fy",
    );
  });

  it("falls back to the chooser without a usable number", () => {
    expect(whatsappShareHref("Hola", "099 123 456")).toBe("https://wa.me/?text=Hola");
    expect(whatsappShareHref("Hola", null)).toBe("https://wa.me/?text=Hola");
  });

  it("builds a mailto link with an encoded subject and body", () => {
    expect(mailtoShareHref("ana@example.com", "Your plan", "Hi Ana\nhttps://x/y")).toBe(
      "mailto:ana@example.com?subject=Your%20plan&body=Hi%20Ana%0Ahttps%3A%2F%2Fx%2Fy",
    );
    expect(mailtoShareHref(null, "S", "B")).toBe("mailto:?subject=S&body=B");
  });
});
