import { appIconImage } from "@/lib/app-icon-image";
import { APP_ICONS } from "@/lib/pwa";

export function generateImageMetadata() {
  return APP_ICONS.map((icon) => ({
    id: icon.id,
    contentType: "image/png",
    size: { width: icon.size, height: icon.size },
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const iconId = String(await id);
  const icon = APP_ICONS.find((candidate) => candidate.id === iconId) ?? APP_ICONS[0];
  return icon.purpose === "maskable"
    ? appIconImage(icon.size, { rounded: false, glyph: 0.5 })
    : appIconImage(icon.size, { rounded: true, glyph: 0.6 });
}
