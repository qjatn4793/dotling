import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { deformLocalRegions } from "../../src/lib/image/local-motion";

const region = { left: 27, top: 25, width: 7, height: 7 };
async function fixture() {
  const raw = Buffer.alloc(64 * 64 * 4);
  for (let y = 10; y < 56; y++) for (let x = 22; x < 42; x++) raw.set([y % 2 ? 80 : 160, 40, 80, 255], (y * 64 + x) * 4);
  raw.fill(0, (27 * 64 + 30) * 4, (27 * 64 + 30) * 4 + 4);
  return sharp(raw, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer();
}
test("local motion changes only the requested region and preserves silhouette, gaps and palette", async () => {
  const input = await fixture();
  const a = await sharp(input).raw().toBuffer();
  const motion = await deformLocalRegions(input, [{ region, rise: 1 }]);
  const b = await sharp(motion.png).raw().toBuffer();
  assert.ok(motion.changed > 0);
  assert.equal(motion.protectedChanged, 0);
  const colors = new Set(Array.from({ length: 4096 }, (_, p) => a.subarray(p * 4, p * 4 + 4).toString("hex")));
  for (let p = 0; p < 4096; p++) {
    const x = p % 64, y = Math.floor(p / 64);
    assert.equal(b[p * 4 + 3], a[p * 4 + 3]);
    assert.ok(colors.has(b.subarray(p * 4, p * 4 + 4).toString("hex")));
    if (x < 27 || x >= 34 || y < 25 || y >= 32) assert.deepEqual(b.subarray(p * 4, p * 4 + 4), a.subarray(p * 4, p * 4 + 4));
  }
  const rest = await deformLocalRegions(input, [{ region, rise: 0 }]);
  assert.deepEqual(await sharp(rest.png).raw().toBuffer(), a);
});
test("local motion refuses invalid, overlapping or non-native frame inputs", async () => {
  const input = await fixture();
  await assert.rejects(deformLocalRegions(input, [{ region, rise: 2 }]), /Invalid/);
  await assert.rejects(deformLocalRegions(input, [{ region: { ...region, left: 63 }, rise: 1 }]), /Invalid/);
  await assert.rejects(deformLocalRegions(input, [{ region, rise: 0 }, { region, rise: 1 }]), /Overlapping/);
  await assert.rejects(deformLocalRegions(await sharp(input).resize(32, 32).png().toBuffer(), []), /64/);
});
