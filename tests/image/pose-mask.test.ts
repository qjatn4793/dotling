import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { constrainToPose } from "../../src/lib/image/pose-mask";

async function fixture(extra: number) {
  const pixels = Buffer.alloc(64 * 64 * 4);
  for (let y = 20; y < 40; y++) for (let x = 20; x < 40; x++) pixels.set([40, 80, 160, 255], (y * 64 + x) * 4);
  for (let x = 0; x < extra; x++) pixels.set([0, 0, 0, 255], (60 * 64 + x) * 4);
  return sharp(pixels, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer();
}

test("pose constraint removes minor residuals without modifying the character pixels", async () => {
  const guide = await fixture(0);
  const result = await constrainToPose(await fixture(5), guide, 2);
  assert.equal(result.removed, 5);
  assert.deepEqual(await sharp(result.png).raw().toBuffer(), await sharp(guide).raw().toBuffer());
});

test("pose constraint refuses major off-guide foreground and mismatched guide sizes", async () => {
  const guide = await fixture(0);
  await assert.rejects(constrainToPose(await fixture(50), guide, 2), /수동 검수/);
  const smaller = await sharp(guide).resize(32, 32).png().toBuffer();
  await assert.rejects(constrainToPose(guide, smaller), /크기/);
});
