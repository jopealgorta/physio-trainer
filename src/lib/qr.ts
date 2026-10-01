import QRCode from "qrcode";

/**
 * QR code for `text` as one SVG path of one-module-high runs in a `size` × `size` grid, so the UI draws it
 * with a plain `<path d>` (no innerHTML) and scales it with the viewBox. Medium error correction.
 */
export function qrCode(text: string): { size: number; path: string } {
  const { size, data } = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
  let path = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!data[y * size + x]) continue;
      let run = 1;
      while (x + run < size && data[y * size + x + run]) run++;
      path += `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return { size, path };
}
