/**
 * Image decoding / encoding for the detection API.
 *
 * Pure-JavaScript decoders (pngjs, jpeg-js) are used deliberately: they need no
 * native build step, so the API works on any machine the student runs it on.
 * Uploaded bytes are sniffed by magic number rather than trusting the browser's
 * MIME type, and dimension limits protect the server from decompression bombs.
 */
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

export interface GrayImage {
  width: number;
  height: number;
  /** Row-major luminance values in 0..255 (float for later arithmetic). */
  data: Float32Array;
}

export interface DecodedImage {
  gray: GrayImage;
  /** Interleaved RGB bytes (no alpha) - needed by the YOLO/ONNX path. */
  rgb: Uint8Array;
  format: "png" | "jpeg";
}

export class ImageDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageDecodeError";
  }
}

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // 12 MB
export const MAX_IMAGE_PIXELS = 16_000_000; // 16 MP (e.g. 4000 x 4000)

export function sniffFormat(buf: Uint8Array): "png" | "jpeg" | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  return null;
}

function rgbaToPlanes(width: number, height: number, rgba: Uint8Array): { gray: GrayImage; rgb: Uint8Array } {
  const n = width * height;
  const gray = new Float32Array(n);
  const rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
    // Rec. 601 luma - astronomical frames are usually mono anyway.
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return { gray: { width, height, data: gray }, rgb };
}

/** Decode PNG/JPEG bytes. Throws ImageDecodeError with a user-safe message. */
export function decodeImage(buf: Buffer): DecodedImage {
  if (buf.length > MAX_UPLOAD_BYTES) {
    throw new ImageDecodeError(`File is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  }
  const format = sniffFormat(buf);
  if (!format) throw new ImageDecodeError("Unsupported file type. Please upload a PNG or JPEG image.");
  try {
    if (format === "png") {
      const png = PNG.sync.read(buf);
      if (png.width * png.height > MAX_IMAGE_PIXELS) throw new ImageDecodeError("Image exceeds the 16 megapixel limit.");
      return { ...rgbaToPlanes(png.width, png.height, new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length)), format };
    }
    const img = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 512, maxResolutionInMP: MAX_IMAGE_PIXELS / 1e6 });
    return { ...rgbaToPlanes(img.width, img.height, img.data), format };
  } catch (err) {
    if (err instanceof ImageDecodeError) throw err;
    throw new ImageDecodeError("The file could not be decoded. It may be corrupted or use an unsupported variant.");
  }
}

/** Encode a grayscale float image to an 8-bit PNG buffer (used for synthetic samples). */
export function encodeGrayPng(img: GrayImage): Buffer {
  const png = new PNG({ width: img.width, height: img.height, colorType: 6 });
  for (let i = 0; i < img.width * img.height; i++) {
    const v = Math.max(0, Math.min(255, Math.round(img.data[i])));
    png.data[i * 4] = v;
    png.data[i * 4 + 1] = v;
    png.data[i * 4 + 2] = v;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

/** Gray -> RGB bytes (for feeding a mono synthetic frame to the ONNX detector). */
export function grayToRgb(img: GrayImage): Uint8Array {
  const n = img.width * img.height;
  const rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(255, Math.round(img.data[i])));
    rgb[i * 3] = v;
    rgb[i * 3 + 1] = v;
    rgb[i * 3 + 2] = v;
  }
  return rgb;
}
