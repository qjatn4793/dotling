import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { normalizeReference } from "../../src/lib/image/reference";

test("reference keeps whole silhouette and aligns its bottom at the foot baseline", async () => {
  const input = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp({ create: { width: 30, height: 60, channels: 4, background: "blue" } }).png().toBuffer(), left: 40, top: 20 }]).png().toBuffer();
  const result = await normalizeReference(input);
  assert.deepEqual(result.sourceBounds, { left: 40, top: 20, width: 30, height: 60 });
  assert.deepEqual(result.pivot, { x: 32, y: 56 });
  assert.equal(result.placement.top, 12);
  const { data, info } = await sharp(result.png).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 64); assert.equal(info.height, 64);
  assert.equal(data[(55 * 64 + 32) * 4 + 3], 255);
  assert.equal(data[(56 * 64 + 32) * 4 + 3], 0);
});

test("empty and edge-touching references are rejected instead of silently normalized", async () => {
  for (const alpha of [0, 1]) {
    const input = await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha } } }).png().toBuffer();
    await assert.rejects(normalizeReference(input), alpha ? /경계/ : /캐릭터가 없습니다/);
  }
});
