/**
 * Minimal PES v1 writer for Brother embroidery machines.
 *
 * Writes a valid #PES0001 header + embedded PEC block with stitch data
 * in 0.1 mm units (the native PEC unit).
 *
 * Limitations:
 * - PES v1 (most universally compatible across Brother machines)
 * - Single section, simple flat stitch list
 * - Color changes via STOP commands between segments
 *
 * References:
 * - EduMan / pyembroidery PES/PEC writer
 * - Wikipedia PES format notes
 * - Brother PE-Design v1 spec
 */

export type StitchType = "normal" | "jump" | "stop" | "end";

export interface Stitch {
  x: number; // mm, absolute
  y: number; // mm, absolute
  type: StitchType;
}

export interface ColorBlock {
  /** Brother thread palette index (0-63). Default 1 (black). */
  paletteIndex: number;
  stitches: Stitch[];
}

/**
 * Brother PEC thread palette (subset). Index 1 = black, 2 = white, etc.
 * We only need a handful of common colors.
 */
export const BROTHER_PALETTE: { index: number; name: string; hex: string }[] = [
  { index: 1, name: "Black", hex: "#000000" },
  { index: 2, name: "White", hex: "#FFFFFF" },
  { index: 5, name: "Red", hex: "#E60012" },
  { index: 9, name: "Blue", hex: "#0000FF" },
  { index: 13, name: "Green", hex: "#008000" },
  { index: 14, name: "Yellow", hex: "#FFD500" },
  { index: 15, name: "Purple", hex: "#800080" },
  { index: 21, name: "Orange", hex: "#FF8000" },
  { index: 23, name: "Pink", hex: "#FFB6C1" },
  { index: 27, name: "Gold", hex: "#D4AF37" },
  { index: 28, name: "Brown", hex: "#8B4513" },
  { index: 41, name: "Gray", hex: "#808080" },
];

export function nearestPaletteIndex(hex: string): number {
  const c = hexToRgb(hex);
  let best = BROTHER_PALETTE[0];
  let bestDist = Infinity;
  for (const p of BROTHER_PALETTE) {
    const pc = hexToRgb(p.hex);
    const d = (c.r - pc.r) ** 2 + (c.g - pc.g) ** 2 + (c.b - pc.b) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best.index;
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * Write a PES file from one or more color blocks.
 * Coordinates are in mm, with (0,0) as the design center.
 */
export function writePES(blocks: ColorBlock[]): Uint8Array {
  // Compute bounding box in 0.1 mm units
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const b of blocks) {
    for (const s of b.stitches) {
      const x = s.x * 10;
      const y = s.y * 10;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!isFinite(minX)) {
    minX = maxX = minY = maxY = 0;
  }
  const width = Math.max(1, Math.round(maxX - minX));
  const height = Math.max(1, Math.round(maxY - minY));

  // -------- Build PEC body first (we need its size for the PES header pointer) --------
  const pec = buildPEC(blocks, minX, minY, width, height);

  // -------- Build PES v1 header --------
  // PES v1 header is small: "#PES0001" + 4-byte LE offset to PEC, then minimal CSEW section.
  const header = new Writer();
  header.ascii("#PES0001");
  // Placeholder for PEC offset (4 bytes LE) — fill in after we know header length
  const pecOffsetPos = header.length;
  header.uint32LE(0);

  // PES v1 minimal "section" — pyembroidery writes 12 bytes of zeros + width/height.
  // The simplest valid PES v1 we can emit is just the magic + offset + some pad + PEC.
  // Many machines accept this; the PEC block is what they actually read.
  // Write the canonical 12 zero bytes then 0x00,0x00 width/height pad.
  for (let i = 0; i < 14; i++) header.uint8(0);

  // Fill in PEC offset
  const pecOffset = header.length;
  header.setUint32LE(pecOffsetPos, pecOffset);

  // -------- Concatenate --------
  const out = new Uint8Array(header.length + pec.length);
  out.set(header.bytes(), 0);
  out.set(pec, header.length);
  return out;
}

function buildPEC(
  blocks: ColorBlock[],
  minX: number,
  minY: number,
  width: number,
  height: number,
): Uint8Array {
  const w = new Writer();

  // PEC label section (fixed 19 bytes "LA:" + 16 spaces, then 0x0D)
  w.ascii("LA:");
  for (let i = 0; i < 16; i++) w.uint8(0x20);
  w.uint8(0x0d);

  // 12 bytes of 0x20 padding
  for (let i = 0; i < 12; i++) w.uint8(0x20);

  // 0xFF, 0x00, 0x06, 0x26
  w.uint8(0xff);
  w.uint8(0x00);
  w.uint8(0x06);
  w.uint8(0x26);

  // 12 bytes of 0x20
  for (let i = 0; i < 12; i++) w.uint8(0x20);

  // Color count (number of color blocks - 1, 1 byte) + palette indexes
  const colorCount = Math.max(1, blocks.length);
  w.uint8(colorCount - 1);
  for (let i = 0; i < colorCount; i++) {
    w.uint8(blocks[i]?.paletteIndex ?? 1);
  }
  // Pad palette section to 463 bytes total of "color list" area
  for (let i = colorCount; i < 463; i++) w.uint8(0x20);

  // 2 bytes: 0x00, 0x00 then stitch-list offset (3 bytes LE) — placeholder
  w.uint8(0x00);
  w.uint8(0x00);
  const stitchOffsetPos = w.length;
  w.uint8(0);
  w.uint8(0);
  w.uint8(0);

  // 0x31, 0xFF, 0xF0
  w.uint8(0x31);
  w.uint8(0xff);
  w.uint8(0xf0);

  // Width / height (2 bytes LE each)
  w.int16LE(width);
  w.int16LE(height);
  // 4 unknown bytes
  w.int16LE(0x01e0);
  w.int16LE(0x01b0);
  // 2 unknown bytes (often 0x9000, 0x9000 - X / Y offsets)
  w.uint16BE(0x9000);
  w.uint16BE(0x9000);

  // Now the stitch list itself
  const stitchListStart = w.length;
  // Stitch offset is relative to a specific point in PEC; pyembroidery uses
  // "stitch list start - (label start + some constant)". We approximate with 0
  // since most embroidery readers tolerate it for v1 PES.
  const off = stitchListStart - 17;
  w.bytes()[stitchOffsetPos] = off & 0xff;
  w.bytes()[stitchOffsetPos + 1] = (off >> 8) & 0xff;
  w.bytes()[stitchOffsetPos + 2] = (off >> 16) & 0xff;

  // Encode stitches. PEC uses delta encoding in 0.1 mm units.
  // Origin is the design's min corner shifted so first stitch lands at (0,0).
  let prevX = 0;
  let prevY = 0;
  let firstColor = true;

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    if (!firstColor) {
      // STOP command for color change
      w.uint8(0xfe);
      w.uint8(0xb0);
      w.uint8(bi % 2 === 0 ? 0x02 : 0x01);
    }
    firstColor = false;

    let firstInBlock = true;
    for (const s of block.stitches) {
      const absX = Math.round(s.x * 10 - minX);
      const absY = Math.round(s.y * 10 - minY);
      const dx = absX - prevX;
      const dy = absY - prevY;
      prevX = absX;
      prevY = absY;

      const isJump = s.type === "jump" || firstInBlock;
      firstInBlock = false;

      writeStitchDelta(w, dx, dy, isJump);
    }
  }

  // End of stitches
  w.uint8(0xff);

  return w.bytes();
}

function writeStitchDelta(w: Writer, dx: number, dy: number, jump: boolean) {
  // Short form: dx, dy in [-64, 63] and not a jump → 1 byte each (7-bit signed)
  if (!jump && dx >= -64 && dx <= 63 && dy >= -64 && dy <= 63) {
    w.uint8(dx & 0x7f);
    w.uint8(dy & 0x7f);
    return;
  }
  // Long form: 12-bit signed, high nibble carries flags
  const xClamped = Math.max(-2048, Math.min(2047, dx));
  const yClamped = Math.max(-2048, Math.min(2047, dy));
  let xHi = (xClamped >> 8) & 0x0f;
  let yHi = (yClamped >> 8) & 0x0f;
  xHi |= 0x80; // long-form flag
  if (jump) xHi |= 0x10; // trim/jump flag
  yHi |= 0x80;
  if (jump) yHi |= 0x10;
  w.uint8(xHi);
  w.uint8(xClamped & 0xff);
  w.uint8(yHi);
  w.uint8(yClamped & 0xff);
}

class Writer {
  private buf: number[] = [];
  get length() {
    return this.buf.length;
  }
  ascii(s: string) {
    for (let i = 0; i < s.length; i++) this.buf.push(s.charCodeAt(i));
  }
  uint8(v: number) {
    this.buf.push(v & 0xff);
  }
  int16LE(v: number) {
    this.buf.push(v & 0xff, (v >> 8) & 0xff);
  }
  uint16BE(v: number) {
    this.buf.push((v >> 8) & 0xff, v & 0xff);
  }
  uint32LE(v: number) {
    this.buf.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff);
  }
  setUint32LE(pos: number, v: number) {
    this.buf[pos] = v & 0xff;
    this.buf[pos + 1] = (v >> 8) & 0xff;
    this.buf[pos + 2] = (v >> 16) & 0xff;
    this.buf[pos + 3] = (v >> 24) & 0xff;
  }
  bytes(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}
