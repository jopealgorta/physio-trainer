import { join } from "node:path";

import { Font } from "@react-pdf/renderer";

export const PDF_FONT = "Outfit";
const dir = join(process.cwd(), "src/assets/fonts");
let registered = false;

/** Bundled files (no network at render time); react-pdf caches them after the first render. */
export function registerFonts(): void {
  if (registered) return;
  Font.register({
    family: PDF_FONT,
    fonts: [
      { src: join(dir, "Outfit-Regular.ttf"), fontWeight: 400 },
      { src: join(dir, "Outfit-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Never hyphenate names and instructions mid-word.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
