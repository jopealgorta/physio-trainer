import { LOGO_MAX_DIMENSION } from "@/lib/branding";

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Browser only. Scales an image to fit `maxDimension` (never upscales), keeping transparency,
 * and re-encodes it as WebP (PNG where the browser cannot encode WebP). Throws when the file
 * cannot be decoded as an image.
 */
export async function resizeLogo(file: File, maxDimension = LOGO_MAX_DIMENSION): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is not available");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let blob = await toBlob(canvas, "image/webp", 0.9);
  if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/png");
  if (!blob) throw new Error("Could not encode the logo");
  const extension = blob.type === "image/webp" ? "webp" : "png";
  return new File([blob], `logo.${extension}`, { type: blob.type });
}
