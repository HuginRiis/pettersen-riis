/**
 * Stitch generators: convert text and raster bitmaps into stitch lists
 * suitable for our PES writer. Pure client-side, no native deps.
 */

import opentype from "opentype.js";
import type { Stitch, ColorBlock } from "./pes-writer";

const SATIN_DENSITY_MM = 0.4; // distance between satin lines
const FILL_DENSITY_MM = 0.45; // distance between fill rows
const MAX_STITCH_LEN_MM = 4; // split long stitches

/* ------------------------------------------------------------------ */
/* Text → satin stitches via SVG paths from opentype.js                */
/* ------------------------------------------------------------------ */

export interface TextOptions {
  text: string;
  fontUrl: string;
  /** Target height of the text in mm. */
  heightMm: number;
  /** Max design width/height in mm (e.g. 80 for 8x8 cm). */
  maxMm: number;
  colorHex: string;
}

export async function generateTextStitches(opts: TextOptions): Promise<{
  blocks: ColorBlock[];
  widthMm: number;
  heightMm: number;
}> {
  const font = await opentype.load(opts.fontUrl);
  // Render at a large pixel size so we can sample the path accurately.
  const renderPx = 200;
  const path = font.getPath(opts.text, 0, 0, renderPx);
  const bbox = path.getBoundingBox();
  const pxW = bbox.x2 - bbox.x1;
  const pxH = bbox.y2 - bbox.y1;

  // Scale to requested mm height; clamp to maxMm.
  let mmPerPx = opts.heightMm / pxH;
  if (pxW * mmPerPx > opts.maxMm) {
    mmPerPx = opts.maxMm / pxW;
  }
  const widthMm = pxW * mmPerPx;
  const heightMm = pxH * mmPerPx;

  // Convert path to polygons.
  const polys = pathToPolygons(path, mmPerPx, bbox.x1, bbox.y1);

  // For each polygon, fill with horizontal scan-line stitches (simple raster fill).
  const stitches: Stitch[] = [];
  fillPolygons(polys, FILL_DENSITY_MM, stitches);

  // Center the design around (0,0).
  const centered = centerStitches(stitches);

  return {
    blocks: [
      {
        paletteIndex: nearest(opts.colorHex),
        stitches: centered,
      },
    ],
    widthMm,
    heightMm,
  };
}

/* ------------------------------------------------------------------ */
/* Image → stitches via threshold + fill                              */
/* ------------------------------------------------------------------ */

export interface ImageOptions {
  imageData: ImageData;
  /** Threshold 0-255: pixels darker than this become stitched. */
  threshold: number;
  maxMm: number;
  colorHex: string;
}

export function generateImageStitches(opts: ImageOptions): {
  blocks: ColorBlock[];
  widthMm: number;
  heightMm: number;
} {
  const { imageData, threshold, maxMm, colorHex } = opts;
  const { width: w, height: h, data } = imageData;

  // Build binary mask (1 = stitch).
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) * (a / 255);
    mask[i] = lum < threshold ? 1 : 0;
  }

  // Scale mask to fit maxMm.
  const mmPerPx = maxMm / Math.max(w, h);
  const widthMm = w * mmPerPx;
  const heightMm = h * mmPerPx;

  // Scan-line fill: walk each row, emit runs.
  const stitches: Stitch[] = [];
  const rowStepPx = Math.max(1, Math.round(FILL_DENSITY_MM / mmPerPx));
  let goingRight = true;
  let firstStitch = true;

  for (let y = 0; y < h; y += rowStepPx) {
    const rowY = y * mmPerPx;
    // Find runs in this row.
    const runs: { x0: number; x1: number }[] = [];
    let inRun = false;
    let runStart = 0;
    for (let x = 0; x < w; x++) {
      const v = mask[y * w + x];
      if (v && !inRun) {
        inRun = true;
        runStart = x;
      } else if (!v && inRun) {
        inRun = false;
        runs.push({ x0: runStart, x1: x - 1 });
      }
    }
    if (inRun) runs.push({ x0: runStart, x1: w - 1 });
    if (runs.length === 0) continue;

    if (!goingRight) runs.reverse();

    for (const run of runs) {
      const x0Mm = (goingRight ? run.x0 : run.x1) * mmPerPx;
      const x1Mm = (goingRight ? run.x1 : run.x0) * mmPerPx;
      stitches.push({ x: x0Mm, y: rowY, type: firstStitch ? "jump" : "jump" });
      firstStitch = false;
      // Walk along the run with limited stitch length.
      const dist = Math.abs(x1Mm - x0Mm);
      const steps = Math.max(1, Math.ceil(dist / MAX_STITCH_LEN_MM));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const xx = x0Mm + (x1Mm - x0Mm) * t;
        stitches.push({ x: xx, y: rowY, type: "normal" });
      }
    }
    goingRight = !goingRight;
  }

  return {
    blocks: [{ paletteIndex: nearest(colorHex), stitches: centerStitches(stitches) }],
    widthMm,
    heightMm,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function nearest(hex: string): number {
  // Lazy import to avoid circular
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { nearestPaletteIndex } = require("./pes-writer") as typeof import("./pes-writer");
  return nearestPaletteIndex(hex);
}

function centerStitches(stitches: Stitch[]): Stitch[] {
  if (stitches.length === 0) return stitches;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const s of stitches) {
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.y > maxY) maxY = s.y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return stitches.map((s) => ({ ...s, x: s.x - cx, y: s.y - cy }));
}

/**
 * Approximate an opentype.js Path to flat polygons, sampled at small steps.
 * Each "M" starts a new polygon; "Z" closes it.
 */
function pathToPolygons(
  path: opentype.Path,
  mmPerPx: number,
  ox: number,
  oy: number,
): { x: number; y: number }[][] {
  const polys: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  let cx = 0;
  let cy = 0;
  const SAMPLES = 12;

  const toMm = (px: number, py: number) => ({
    x: (px - ox) * mmPerPx,
    y: (py - oy) * mmPerPx,
  });

  for (const cmd of path.commands) {
    if (cmd.type === "M") {
      if (current.length > 2) polys.push(current);
      current = [];
      cx = cmd.x;
      cy = cmd.y;
      current.push(toMm(cx, cy));
    } else if (cmd.type === "L") {
      cx = cmd.x;
      cy = cmd.y;
      current.push(toMm(cx, cy));
    } else if (cmd.type === "C") {
      const x0 = cx,
        y0 = cy;
      for (let i = 1; i <= SAMPLES; i++) {
        const t = i / SAMPLES;
        const u = 1 - t;
        const x =
          u * u * u * x0 +
          3 * u * u * t * cmd.x1 +
          3 * u * t * t * cmd.x2 +
          t * t * t * cmd.x;
        const y =
          u * u * u * y0 +
          3 * u * u * t * cmd.y1 +
          3 * u * t * t * cmd.y2 +
          t * t * t * cmd.y;
        current.push(toMm(x, y));
      }
      cx = cmd.x;
      cy = cmd.y;
    } else if (cmd.type === "Q") {
      const x0 = cx,
        y0 = cy;
      for (let i = 1; i <= SAMPLES; i++) {
        const t = i / SAMPLES;
        const u = 1 - t;
        const x = u * u * x0 + 2 * u * t * cmd.x1 + t * t * cmd.x;
        const y = u * u * y0 + 2 * u * t * cmd.y1 + t * t * cmd.y;
        current.push(toMm(x, y));
      }
      cx = cmd.x;
      cy = cmd.y;
    } else if (cmd.type === "Z") {
      if (current.length > 2) {
        polys.push(current);
        current = [];
      }
    }
  }
  if (current.length > 2) polys.push(current);
  return polys;
}

/**
 * Scan-line fill across all polygons together (so holes from even-odd are respected).
 */
function fillPolygons(
  polys: { x: number; y: number }[][],
  spacingMm: number,
  out: Stitch[],
) {
  if (polys.length === 0) return;
  let minY = Infinity,
    maxY = -Infinity;
  for (const p of polys) for (const v of p) {
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }

  let goingRight = true;
  let firstStitch = true;

  for (let y = minY; y <= maxY; y += spacingMm) {
    // Collect all intersections of horizontal line y with all polygon edges.
    const xs: number[] = [];
    for (const poly of polys) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        if (a.y === b.y) continue;
        const yMin = Math.min(a.y, b.y);
        const yMax = Math.max(a.y, b.y);
        if (y < yMin || y >= yMax) continue;
        const t = (y - a.y) / (b.y - a.y);
        xs.push(a.x + t * (b.x - a.x));
      }
    }
    xs.sort((p, q) => p - q);

    // Pair intersections into runs (even-odd fill rule).
    const runs: { x0: number; x1: number }[] = [];
    for (let i = 0; i < xs.length - 1; i += 2) {
      runs.push({ x0: xs[i], x1: xs[i + 1] });
    }
    if (runs.length === 0) continue;
    if (!goingRight) runs.reverse();

    for (const run of runs) {
      const x0 = goingRight ? run.x0 : run.x1;
      const x1 = goingRight ? run.x1 : run.x0;
      out.push({ x: x0, y, type: firstStitch ? "jump" : "jump" });
      firstStitch = false;
      const dist = Math.abs(x1 - x0);
      const steps = Math.max(1, Math.ceil(dist / MAX_STITCH_LEN_MM));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        out.push({ x: x0 + (x1 - x0) * t, y, type: "normal" });
      }
    }
    goingRight = !goingRight;
  }
}
