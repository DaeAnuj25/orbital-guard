/**
 * Classical source detector for astronomical-style frames.
 *
 * This is NOT a neural network. It is a deliberately transparent baseline in
 * the tradition of SExtractor-style source extraction:
 *
 *   1. estimate the sky background (global median, or a grid of local medians
 *      interpolated bilinearly so gradients and vignetting are removed),
 *   2. estimate the noise sigma robustly (median absolute deviation),
 *   3. optionally apply a Gaussian matched filter (boosts SNR of PSF-sized
 *      sources; this is the "improvement" variant we evaluate against the
 *      plain global-threshold baseline),
 *   4. threshold at k·sigma and label 8-connected components,
 *   5. reject single-pixel spikes (hot pixels / cosmic rays) and huge blobs,
 *   6. measure centroid, flux, SNR and shape (second moments) per component and
 *      classify as `point_source` or `streak` from its elongation.
 *
 * The "confidence" is a monotonic function of SNR, provided so that the UI and
 * the precision/recall sweep have something to rank by. It is a heuristic
 * score, not a calibrated probability, and the UI says so.
 *
 * A point source or a streak is evidence of *something* on the sensor. Whether
 * it is a star, a satellite, debris or an aircraft cannot be decided from one
 * frame - that needs multi-frame tracking and orbit association.
 */
import type { GrayImage } from "./image";
import type { ObjectClass } from "./synthetic";

export type DetectorVariant = "global-threshold" | "local-matched-filter";

export interface DetectorParams {
  variant: DetectorVariant;
  /** Detection threshold in units of noise sigma. */
  kSigma: number;
  /** Minimum connected area in pixels (rejects hot pixels). */
  minArea: number;
  /** Maximum connected area in pixels (rejects the Moon, galaxies, glare). */
  maxArea: number;
  /** Background grid cell size in pixels (local variant). */
  cellSize: number;
  /** Matched-filter Gaussian sigma in pixels (approximate PSF width). */
  psfSigma: number;
  /** Major/minor axis ratio above which a source is called a streak. */
  elongationThreshold: number;
}

export const DEFAULT_PARAMS: DetectorParams = {
  variant: "local-matched-filter",
  kSigma: 4,
  minArea: 3,
  maxArea: 5000,
  cellSize: 32,
  psfSigma: 1.2,
  elongationThreshold: 2.2,
};

export const DETECTOR_INFO = { name: "classical-source-extractor", version: "1.0.0", kind: "classical" as const };

export interface Detection {
  id: number;
  cls: ObjectClass;
  /** Heuristic 0..1 score derived from SNR (not a calibrated probability). */
  confidence: number;
  bbox: [number, number, number, number];
  centroid: [number, number];
  area: number;
  peak: number;
  flux: number;
  snr: number;
  elongation: number;
  orientationDeg: number;
}

export interface DetectionResult {
  detections: Detection[];
  stats: {
    background: number;
    noiseSigma: number;
    threshold: number;
    candidates: number;
    rejectedSmall: number;
    rejectedLarge: number;
    elapsedMs: number;
  };
  params: DetectorParams;
  detector: typeof DETECTOR_INFO;
}

function median(values: Float32Array | number[]): number {
  const arr = Float32Array.from(values).sort();
  const n = arr.length;
  if (n === 0) return 0;
  return n % 2 ? arr[(n - 1) / 2] : 0.5 * (arr[n / 2 - 1] + arr[n / 2]);
}

/** Robust noise estimate: 1.4826 * median(|x - median|). */
function madSigma(values: Float32Array, center: number): number {
  const dev = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) dev[i] = Math.abs(values[i] - center);
  return 1.4826 * median(dev);
}

/** Local background: median per grid cell, bilinearly interpolated to each pixel. */
function localBackground(img: GrayImage, cell: number): Float32Array {
  const { width, height, data } = img;
  const nx = Math.max(1, Math.ceil(width / cell)), ny = Math.max(1, Math.ceil(height / cell));
  const grid = new Float32Array(nx * ny);
  for (let gy = 0; gy < ny; gy++) {
    for (let gx = 0; gx < nx; gx++) {
      const x0 = gx * cell, y0 = gy * cell;
      const x1 = Math.min(width, x0 + cell), y1 = Math.min(height, y0 + cell);
      const vals: number[] = [];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) vals.push(data[y * width + x]);
      grid[gy * nx + gx] = median(vals);
    }
  }
  const bg = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const fy = Math.min(ny - 1, Math.max(0, (y + 0.5) / cell - 0.5));
    const gy0 = Math.floor(fy), gy1 = Math.min(ny - 1, gy0 + 1), ty = fy - gy0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(nx - 1, Math.max(0, (x + 0.5) / cell - 0.5));
      const gx0 = Math.floor(fx), gx1 = Math.min(nx - 1, gx0 + 1), tx = fx - gx0;
      const top = grid[gy0 * nx + gx0] * (1 - tx) + grid[gy0 * nx + gx1] * tx;
      const bot = grid[gy1 * nx + gx0] * (1 - tx) + grid[gy1 * nx + gx1] * tx;
      bg[y * width + x] = top * (1 - ty) + bot * ty;
    }
  }
  return bg;
}

/** Separable Gaussian convolution; returns filtered image and the kernel's L2 norm. */
function gaussianFilter(src: Float32Array, width: number, height: number, sigma: number): { out: Float32Array; l2: number } {
  const r = Math.max(1, Math.ceil(3 * sigma));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  let l2 = 0;
  for (let i = 0; i < k.length; i++) for (let j = 0; j < k.length; j++) l2 += k[i] * k[i] * k[j] * k[j];
  const tmp = new Float32Array(width * height);
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const xx = Math.min(width - 1, Math.max(0, x + i));
        acc += src[y * width + xx] * k[i + r];
      }
      tmp[y * width + x] = acc;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const yy = Math.min(height - 1, Math.max(0, y + i));
        acc += tmp[yy * width + x] * k[i + r];
      }
      out[y * width + x] = acc;
    }
  }
  return { out, l2: Math.sqrt(l2) };
}

/** Heuristic confidence: 0 at threshold, ->1 as SNR grows. */
export function snrToConfidence(snr: number, kSigma: number): number {
  const c = 1 - Math.exp(-Math.max(snr - kSigma, 0) / (2 * kSigma));
  return Math.max(0.05, Math.min(0.99, c));
}

export function detect(img: GrayImage, overrides: Partial<DetectorParams> = {}): DetectionResult {
  const t0 = Date.now();
  const params: DetectorParams = { ...DEFAULT_PARAMS, ...overrides };
  const { width, height, data } = img;
  const n = width * height;

  // 1-2. background + noise
  let background: Float32Array;
  let bgScalar: number;
  if (params.variant === "local-matched-filter") {
    background = localBackground(img, params.cellSize);
    bgScalar = median(background);
  } else {
    bgScalar = median(data);
    background = new Float32Array(n).fill(bgScalar);
  }
  const residual = new Float32Array(n);
  for (let i = 0; i < n; i++) residual[i] = data[i] - background[i];
  const sigma = Math.max(madSigma(residual, 0), 1e-3);

  // 3. detection image (matched filter or raw residual)
  let detImage: Float32Array = residual;
  let detSigma = sigma;
  if (params.variant === "local-matched-filter") {
    const f = gaussianFilter(residual, width, height, params.psfSigma);
    detImage = f.out;
    detSigma = sigma * f.l2; // noise after linear filtering with a normalised kernel
  }
  const threshold = params.kSigma * detSigma;

  // 4. connected components (8-connectivity) above threshold
  const labels = new Int32Array(n);
  const stack = new Int32Array(n);
  const detections: Detection[] = [];
  let candidates = 0, rejectedSmall = 0, rejectedLarge = 0, nextLabel = 0;
  for (let start = 0; start < n; start++) {
    if (labels[start] !== 0 || detImage[start] <= threshold) continue;
    nextLabel++;
    candidates++;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = nextLabel;
    const pixels: number[] = [];
    while (sp > 0) {
      const p = stack[--sp];
      pixels.push(p);
      const px = p % width, py = (p - px) / width;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = py + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = px + dx;
          if (xx < 0 || xx >= width) continue;
          const q = yy * width + xx;
          if (labels[q] === 0 && detImage[q] > threshold) { labels[q] = nextLabel; stack[sp++] = q; }
        }
      }
      if (pixels.length > params.maxArea) break;
    }
    if (pixels.length < params.minArea) { rejectedSmall++; continue; }
    if (pixels.length > params.maxArea) { rejectedLarge++; continue; }

    // 6. measurements on the background-subtracted image, intensity-weighted
    let flux = 0, sx = 0, sy = 0, peak = -Infinity;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const p of pixels) {
      const px = p % width, py = (p - px) / width;
      const w = Math.max(residual[p], 0);
      flux += w; sx += w * px; sy += w * py;
      if (residual[p] > peak) peak = residual[p];
      if (px < x1) x1 = px; if (px > x2) x2 = px; if (py < y1) y1 = py; if (py > y2) y2 = py;
    }
    const cx = flux > 0 ? sx / flux : (x1 + x2) / 2, cy = flux > 0 ? sy / flux : (y1 + y2) / 2;
    let mxx = 0, myy = 0, mxy = 0;
    for (const p of pixels) {
      const px = p % width, py = (p - px) / width;
      const w = Math.max(residual[p], 0) / Math.max(flux, 1e-9);
      mxx += w * (px - cx) * (px - cx); myy += w * (py - cy) * (py - cy); mxy += w * (px - cx) * (py - cy);
    }
    // Eigenvalues of the 2x2 covariance = principal axes variances (+1/12 for pixel size).
    const tr = mxx + myy + 1 / 6, det = (mxx + 1 / 12) * (myy + 1 / 12) - mxy * mxy;
    const disc = Math.sqrt(Math.max(tr * tr / 4 - det, 0));
    const l1 = tr / 2 + disc, l2 = Math.max(tr / 2 - disc, 1e-6);
    const elongation = Math.sqrt(l1 / l2);
    const orientationDeg = (0.5 * Math.atan2(2 * mxy, mxx - myy) * 180) / Math.PI;
    const area = pixels.length;
    const snr = flux / (sigma * Math.sqrt(area));
    const cls: ObjectClass = elongation >= params.elongationThreshold && area >= 2 * params.minArea ? "streak" : "point_source";
    detections.push({
      id: detections.length + 1,
      cls,
      confidence: Number(snrToConfidence(snr, params.kSigma).toFixed(3)),
      bbox: [x1 - 1, y1 - 1, x2 + 2, y2 + 2],
      centroid: [Number(cx.toFixed(2)), Number(cy.toFixed(2))],
      area,
      peak: Number(peak.toFixed(1)),
      flux: Number(flux.toFixed(1)),
      snr: Number(snr.toFixed(2)),
      elongation: Number(elongation.toFixed(2)),
      orientationDeg: Number(orientationDeg.toFixed(1)),
    });
  }
  detections.sort((a, b) => b.confidence - a.confidence);
  detections.forEach((d, i) => (d.id = i + 1));
  return {
    detections,
    stats: { background: Number(bgScalar.toFixed(2)), noiseSigma: Number(sigma.toFixed(3)), threshold: Number(threshold.toFixed(3)), candidates, rejectedSmall, rejectedLarge, elapsedMs: Date.now() - t0 },
    params,
    detector: DETECTOR_INFO,
  };
}
