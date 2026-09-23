import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { deformShoulder } from "../../src/lib/image/shoulder-motion";

const region = { left: 24, top: 24, width: 12, height: 8 };
async function fixture(right = 35) {
  const data = Buffer.alloc(64 * 64 * 4);
  for (let y = 20; y < 56; y++) for (let x = 25; x < right; x++) data.set([y % 2 ? 80 : 160, 40, 80, 255], (y * 64 + x) * 4);
  return sharp(data, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer();
}
test("shoulder silhouette expands one pixel while face, lower seam and protected body stay exact", async () => {
  const input = await fixture();
  const a = await sharp(input).raw().toBuffer();
  const { png } = await deformShoulder(input, region, 29, [{ y: 27, rise: 1, expand: 1 }]);
  const b = await sharp(png).raw().toBuffer();
  assert.equal(a[(27 * 64 + 35) * 4 + 3], 0);
  assert.equal(b[(27 * 64 + 35) * 4 + 3], 255);
  for (let y = 0; y < 64; y++) if (y !== 27) assert.deepEqual(b.subarray(y * 256, (y + 1) * 256), a.subarray(y * 256, (y + 1) * 256));
  const reset = await deformShoulder(input, region, 29, []);
  assert.deepEqual(await sharp(reset.png).raw().toBuffer(), a);
});
test("shoulder deformation rejects clipping, seam edits, duplicate rows and invalid dimensions", async () => {
  const input = await fixture();
  await assert.rejects(deformShoulder(await fixture(36), region, 29, [{ y: 27, rise: 0, expand: 1 }]), /cross/);
  await assert.rejects(deformShoulder(input, region, 29, [{ y: 31, rise: 0, expand: 1 }]), /seam/);
  await assert.rejects(deformShoulder(input, region, 29, [{ y: 27, rise: 0, expand: 2 }]), /Invalid/);
  const row = { y: 27, rise: 0, expand: 1 };
  await assert.rejects(deformShoulder(input, region, 29, [row, row]), /Invalid/);
  await assert.rejects(deformShoulder(await sharp(input).resize(32, 32).png().toBuffer(), region, 29, []), /64/);
});
