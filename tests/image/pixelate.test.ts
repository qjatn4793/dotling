import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { pixelate } from "../../src/lib/image/pixelate";

async function fixture(width = 16, height = 16) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
    const i = (y * width + x) * 4;
    pixels.set([220, x * 12, y * 12, 255], i);
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("native dimensions, transparent border, binary alpha and bounded color count", async () => {
  const result = await pixelate(await fixture(), { resolution: 64, palette: "16", sourceKind: "pixel" });
  const { data, info } = await sharp(result.png).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 64); assert.equal(info.height, 64); assert.equal(info.channels, 4);
  assert.equal(data[3], 0);
  assert.ok(result.colors.length <= 16);
  const actualColors = new Set<string>();
  for (let i = 0; i < data.length; i += 4) {
    assert.ok(data[i + 3] === 0 || data[i + 3] === 255);
    if (data[i + 3]) actualColors.add(data.subarray(i, i + 3).toString("hex"));
  }
  assert.ok(actualColors.size <= 16);
  assert.equal(result.quality.touchesBoundary, false);
});

test("shared palette is reused without introducing colors", async () => {
  const colors: [number, number, number][] = [[255, 0, 0], [0, 0, 0]];
  const result = await pixelate(await fixture(), { resolution: 16, palette: "16", sharedPalette: colors });
  const data = await sharp(result.png).raw().toBuffer();
  for (let i = 0; i < data.length; i += 4) if (data[i + 3]) {
    assert.ok(data[i] === 0 || data[i] === 255); assert.equal(data[i + 1], 0); assert.equal(data[i + 2], 0);
  }
  assert.deepEqual(result.colors, colors);
});

test("contain preserves a wide image's left and right markers", async () => {
  const pixels = Buffer.alloc(32 * 16 * 4);
  pixels.set([255, 0, 0, 255], (8 * 32) * 4);
  pixels.set([0, 255, 0, 255], (8 * 32 + 31) * 4);
  const input = await sharp(pixels, { raw: { width: 32, height: 16, channels: 4 } }).png().toBuffer();
  const { png, quality } = await pixelate(input, { resolution: 32, palette: "16", sourceKind: "pixel" });
  const data = await sharp(png).raw().toBuffer();
  assert.equal(data[(16 * 32) * 4 + 3], 255);
  assert.equal(data[(16 * 32 + 31) * 4 + 3], 255);
  assert.equal(quality.touchesBoundary, true);
});

test("empty frames are reported and padding prevents boundary contact", async () => {
  const input = await sharp({ create: { width: 16, height: 16, channels: 4, background: "red" } }).png().toBuffer();
  const padded = await pixelate(input, { resolution: 16, palette: "16", padding: 2 });
  assert.equal(padded.quality.touchesBoundary, false);
  const empty = await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  assert.equal((await pixelate(empty, { resolution: 16, palette: "16" })).quality.empty, true);
});

test("invalid options are rejected before image decoding", async () => {
  await assert.rejects(pixelate(Buffer.alloc(0), { resolution: 100000, palette: "16" }), /해상도/);
  await assert.rejects(pixelate(Buffer.alloc(0), { resolution: 16, palette: "invalid" }), /팔레트/);
});
