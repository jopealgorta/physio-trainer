import { appIconImage } from "@/lib/app-icon-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS rounds the corners itself, so fill the whole canvas.
export default function AppleIcon() {
  return appIconImage(size.width, { rounded: false, glyph: 0.6 });
}
