import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { transformFrame, type FrameTransform } from "../../src/lib/image/frame";

const transform: FrameTransform = { sourceWidth: 128, sourceHeight: 128, sourceBounds: { left: 40, top: 20, width: 40, height: 80 }, placement: { left: 22, top: 12 }, targetWidth: 20, targetHeight: 40 };
async function fixture(top: number, stray = false) {
  const data = Buffer.alloc(128 * 128 * 4);
  for (let y = top; y < 100; y++) for (let x = 40; x < 80; x++) data.set([40, 80, 160, 255], (y * 128 + x) * 4);
  if (stray) data.set([40, 80, 160, 255], (127 * 128 + 40) * 4);
  return sharp(data, { raw: { width: 128, height: 128, channels: 4 } }).png().toBuffer();
}
test("fixed transform preserves feet and retains motion above the reference bounds", async () => {
  const palette: [number, number, number][] = [[40, 80, 160]];
  const a = await transformFrame(await fixture(20), transform, palette);
  const b = await transformFrame(await fixture(16), transform, palette);
  const rawA = await sharp(a.png).raw().toBuffer();
  const rawB = await sharp(b.png).raw().toBuffer();
  assert.equal(rawA[(10 * 64 + 22) * 4 + 3], 0);
  assert.equal(rawB[(10 * 64 + 22) * 4 + 3], 255);
  assert.deepEqual(rawA.subarray(12 * 64 * 4), rawB.subarray(12 * 64 * 4));
  assert.equal(rawB[(51 * 64 + 22) * 4 + 3], 255);
  assert.equal(rawB[(52 * 64 + 22) * 4 + 3], 0);
});
test("fixed transform rejects clipping and changed source dimensions", async () => {
  const input = await fixture(20, true);
  await assert.rejects(transformFrame(input, transform, [[40, 80, 160]]), /clipped/);
  await assert.rejects(transformFrame(await sharp(input).resize(64, 64).png().toBuffer(), transform, [[40, 80, 160]]), /dimensions/);
});
