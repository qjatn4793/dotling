import sharp from "sharp";
import type { MotionRegion } from "./local-motion";

export type ShoulderRow = { y: number; rise: number; expand: number };

/** Inverse nearest sampling permits silhouette movement only in a reviewed shoulder envelope. */
export async function deformShoulder(input: Buffer, region: MotionRegion, anchorX: number, rows: ShoulderRow[]) {
  const r = region;
  if (![r.left, r.top, r.width, r.height, anchorX].every(Number.isInteger) || r.left < 0 || r.top < 0 || r.width < 3 || r.height < 3 || r.left + r.width > 64 || r.top + r.height > 64 || anchorX <= r.left || anchorX >= r.left + r.width - 1) throw new Error("Invalid shoulder envelope");
  const byY = new Map<number, ShoulderRow>();
  for (const row of rows) {
    if (![row.y, row.rise, row.expand].every(Number.isInteger) || row.y < r.top || row.y >= r.top + r.height - 1 || row.rise < 0 || row.rise > 1 || row.expand < 0 || row.expand > 1 || byY.has(row.y)) throw new Error("Invalid shoulder row or fixed seam");
    byY.set(row.y, row);
  }
  const { data, info } = await sharp(input).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== 64 || info.height !== 64) throw new Error("Shoulder motion requires native 64×64 input");
  for (let p = 0; p < 4096; p++) if (data[p * 4 + 3] !== 0 && data[p * 4 + 3] !== 255) throw new Error("Shoulder motion requires binary alpha");
  const out = Buffer.from(data);
  for (const row of rows) {
    for (let x = r.left; x < r.left + r.width; x++) {
      // The back anchor stays in place; the outer half expands by one native pixel.
      const sx = x > anchorX ? x - row.expand : x;
      const sy = row.y + row.rise;
      const from = (sy * 64 + sx) * 4, to = (row.y * 64 + x) * 4;
      data.copy(out, to, from, from + 4);
    }
    // Reserve a transparent guard column so the moving contour cannot be clipped.
    if (row.expand && data[((row.y + row.rise) * 64 + r.left + r.width - 1) * 4 + 3]) throw new Error("Shoulder expansion would cross the editable envelope");
  }
  let changed = 0;
  for (let p = 0; p < 4096; p++) if (!data.subarray(p * 4, p * 4 + 4).equals(out.subarray(p * 4, p * 4 + 4))) changed++;
  return { png: await sharp(out, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer(), changed };
}
