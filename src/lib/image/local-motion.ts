import sharp from "sharp";

export type MotionRegion = { left: number; top: number; width: number; height: number };
export type LocalMotion = { region: MotionRegion; rise: number };

/** Native-pixel local deformation. No blending, quantization, or changes outside explicit regions. */
export async function deformLocalRegions(input: Buffer, motions: LocalMotion[]) {
  const { data, info } = await sharp(input, { limitInputPixels: 16_777_216 }).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== 64 || info.height !== 64) throw new Error("Local motion requires a native 64×64 frame");
  const editable = new Uint8Array(64 * 64);
  for (const { region: r, rise } of motions) {
    if (![r.left, r.top, r.width, r.height, rise].every(Number.isInteger) || r.left < 0 || r.top < 0 || r.width < 1 || r.height < 2 || r.left + r.width > 64 || r.top + r.height > 64 || rise < 0 || rise > 1) throw new Error("Invalid local motion region or rise");
    for (let y = r.top; y < r.top + r.height; y++) for (let x = r.left; x < r.left + r.width; x++) {
      const p = y * 64 + x;
      if (editable[p]) throw new Error("Overlapping motion regions");
      editable[p] = 1;
    }
  }
  // Keep all source alpha and colors. The final row is an anchored seam;
  // nearest row resampling compresses the patch by one pixel at full inhale.
  const result = Buffer.from(data);
  for (const { region: r, rise } of motions) {
    for (let y = r.top; y < r.top + r.height; y++) for (let x = r.left; x < r.left + r.width; x++) {
      const sy = Math.min(r.top + r.height - 1, y + rise);
      const dst = (y * 64 + x) * 4, src = (sy * 64 + x) * 4;
      // Do not fill transparent gaps or erode the silhouette with patch resampling.
      if (data[dst + 3] && data[src + 3]) data.copy(result, dst, src, src + 3);
    }
  }
  let changed = 0, protectedChanged = 0;
  for (let p = 0; p < 4096; p++) {
    if (!data.subarray(p * 4, p * 4 + 4).equals(result.subarray(p * 4, p * 4 + 4))) {
      changed++;
      if (!editable[p]) protectedChanged++;
    }
  }
  return {
    png: await sharp(result, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer(),
    changed, protectedChanged, editablePixels: editable.reduce((a, b) => a + b, 0),
  };
}
