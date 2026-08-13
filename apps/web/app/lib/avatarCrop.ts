// Avatar image processing helpers.
//
// Splits the pure validation/geometry (testable in node) from the canvas
// work (browser-only). The canvas export runs entirely client-side so the
// server only ever receives the final, cropped avatar — never the original.

import type { Area } from "react-easy-crop";

/** Client mirror of the server limit — the server stays authoritative. */
export const AVATAR_MAX_SIZE = 5 * 1024 * 1024;

/** Allowed MIME types; SVG is excluded because it can carry scripts. */
export const AVATAR_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

/** Final exported avatar size cap (Instagram/Discord-style 1:1 output). */
export const AVATAR_OUTPUT_SIZE = 512;

/**
 * Client-side file validation for instant feedback before the cropper opens.
 *
 * Returns a user-presentable error message, or null when the file is OK.
 * The server re-validates on presign, so this is a UX nicety, not a gate.
 */
export function validateAvatarFile(file: {
  type: string;
  size: number;
}): string | null {
  if (!(AVATAR_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "Only JPEG, PNG, GIF and WebP images are allowed.";
  }
  if (file.size > AVATAR_MAX_SIZE) {
    return "Image must be 5 MB or smaller.";
  }
  return null;
}

/**
 * Size of the exported square crop.
 *
 * Caps at AVATAR_OUTPUT_SIZE but never upscales a small source past its own
 * resolution, so a tiny image isn't turned into a blurry 512px block.
 */
export function cropOutputSize(cropWidth: number): number {
  return Math.min(AVATAR_OUTPUT_SIZE, Math.max(1, Math.round(cropWidth)));
}

/** Load an <img> from a src/object URL, resolving once it's decodable. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

/**
 * Whether the browser can actually encode `mimeType` on a canvas.
 *
 * Safari historically can't export GIF; every modern browser handles
 * PNG/JPEG/WebP. Falling back to PNG keeps transparency intact.
 */
export function canvasCanEncode(
  canvas: HTMLCanvasElement,
  mimeType: string,
): boolean {
  return canvas.toDataURL(mimeType).startsWith(`data:${mimeType}`);
}

/**
 * Render the square crop region onto a fresh canvas and return it as a Blob.
 *
 * `pixelCrop` comes from react-easy-crop's `onCropComplete` second argument
 * (coordinates in source-image pixels). The crop is drawn at a high smoothing
 * quality onto an output canvas capped at AVATAR_OUTPUT_SIZE.
 */
export async function cropImageToBlob(
  imageSrc: string,
  pixelCrop: Area,
  mimeType: string,
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const size = cropOutputSize(pixelCrop.width);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    size,
    size,
  );

  const outputType = canvasCanEncode(canvas, mimeType) ? mimeType : "image/png";

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Failed to export image")),
      outputType,
      0.95,
    );
  });
}
