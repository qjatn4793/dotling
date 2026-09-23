import sharp from "sharp";
import { pixelate, type Color } from "./pixelate";

/** Normalize a reviewed, transparent single-character reference; never apply independently to motion frames. */
export async function normalizeReference(input: Buffer, kernel: "nearest" | "lanczos3" = "lanczos3", sharedPalette?: Color[]) {
  const { data, info } = await sharp(input, { limitInputPixels: 16_777_216 })
    .toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 4;
    if (data[i + 3] < 128) { data.fill(0, i, i + 4); continue; }
    data[i + 3] = 255;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error("기준 이미지에 불투명한 캐릭터가 없습니다");
  if (left === 0 || top === 0 || right === info.width - 1 || bottom === info.height - 1) {
    throw new Error("기준 캐릭터가 원본 경계에 닿아 있습니다. 배경 제거와 잘림을 확인해주세요");
  }
  const sourceBounds = { left, top, width: right - left + 1, height: bottom - top + 1 };
  const resized = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(sourceBounds).resize(48, 44, { fit: "inside", kernel }).png().toBuffer({ resolveWithObject: true });
  const placement = { left: Math.floor((64 - resized.info.width) / 2), top: 56 - resized.info.height };
  const canvas = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized.data, ...placement }]).png().toBuffer();
  const result = await pixelate(canvas, { resolution: 64, palette: "16", sourceKind: "pixel", sharedPalette });
  return { ...result, pivot: { x: 32, y: 56 }, sourceBounds, placement };
}
