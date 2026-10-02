// @vitest-environment node
import { Document, Page, renderToBuffer, Text } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

import { PDF_FONT, registerFonts } from "./fonts";

describe("registerFonts", () => {
  it("renders Outfit text, including Spanish glyphs, into a PDF", async () => {
    registerFonts();
    registerFonts(); // idempotent
    const buffer = await renderToBuffer(
      <Document>
        <Page size="A4">
          <Text style={{ fontFamily: PDF_FONT }}>Rodilla – fase 2 ñ á é</Text>
          <Text style={{ fontFamily: PDF_FONT, fontWeight: 700 }}>Bold</Text>
        </Page>
      </Document>,
    );
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  });
});
