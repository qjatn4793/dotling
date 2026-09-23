import sharp from "sharp";
import { getPaletteColors, nearestColor, paletteColorCount } from "../palettes";

export type Color = [number, number, number];
export type PixelOptions = {
  resolution: number;
  palette: string;
  sourceKind?: "image" | "pixel";
  sharedPalette?: Color[];
  padding?: number;
};

export function validatePixelOptions(options: PixelOptions) {
  if (![16, 32, 64].includes(options.resolution)) {
    throw new Error("해상도는 16, 32, 64 중 하나여야 합니다");
  }
  if (!["nes", "gameboy", "8", "16", "32"].includes(options.palette)) {
    throw new Error("지원하지 않는 팔레트입니다");
  }
  if (options.sourceKind && !["image", "pixel"].includes(options.sourceKind)) {
    throw new Error("지원하지 않는 입력 이미지 유형입니다");
  }
  const padding = options.padding ?? 0;
  if (!Number.isInteger(padding) || padding < 0 || padding * 2 >= options.resolution) {
    throw new Error("여백 크기가 올바르지 않습니다");
  }
  if (options.sharedPalette && (!options.sharedPalette.length || options.sharedPalette.length > 32 ||
    options.sharedPalette.some((color) => color.length !== 3 || color.some((v) => !Number.isInteger(v) || v < 0 || v > 255)))) {
    throw new Error("공통 팔레트가 올바르지 않습니다");
  }
}

/** Returns native-size RGBA; callers reuse colors for subsequent animation frames. */
export async function pixelate(input: Buffer, options: PixelOptions) {
  validatePixelOptions(options);
  const { resolution, palette } = options;
  const padding = options.padding ?? 0;
  const inner = resolution - padding * 2;
  const resized = await sharp(input, { limitInputPixels: 16_777_216 })
    .rotate()
    .toColourspace("srgb")
    .ensureAlpha()
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: options.sourceKind === "pixel" ? "nearest" : "lanczos3",
    })
    .extend({ top: padding, bottom: padding, left: padding, right: padding, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw().toBuffer();

  // Binary alpha prevents translucent edge halos and excludes invisible RGB from the palette.
  const visible: number[] = [];
  for (let i = 0; i < resized.length; i += 4) {
    if (resized[i + 3] < 128) resized.fill(0, i, i + 4);
    else {
      resized[i + 3] = 255;
      visible.push(resized[i], resized[i + 1], resized[i + 2]);
    }
  }
  const colors: Color[] = options.sharedPalette ?? getPaletteColors(palette) ?? [];
  if (!colors.length && visible.length) {
    const quantized = await sharp(Buffer.from(visible), {
      raw: { width: visible.length / 3, height: 1, channels: 3 },
    }).png({ colours: paletteColorCount(palette), dither: 0 }).toBuffer();
    const raw = await sharp(quantized).removeAlpha().raw().toBuffer();
    const seen = new Set<string>();
    for (let i = 0; i < raw.length; i += 3) {
      const color: Color = [raw[i], raw[i + 1], raw[i + 2]];
      if (!seen.has(color.join(","))) {
        seen.add(color.join(","));
        colors.push(color);
      }
    }
  }
  let touchesBoundary = false;
  let visiblePixels = 0;
  for (let i = 0; i < resized.length; i += 4) {
    if (!resized[i + 3]) continue;
    visiblePixels++;
    const color = nearestColor(resized[i], resized[i + 1], resized[i + 2], colors);
    resized[i] = color[0]; resized[i + 1] = color[1]; resized[i + 2] = color[2];
    const pixel = i / 4;
    const x = pixel % resolution;
    const y = Math.floor(pixel / resolution);
    if (x === 0 || y === 0 || x === resolution - 1 || y === resolution - 1) touchesBoundary = true;
  }
  const png = await sharp(resized, { raw: { width: resolution, height: resolution, channels: 4 } }).png().toBuffer();
  return { png, colors, quality: { touchesBoundary, empty: visiblePixels === 0 } };
}
