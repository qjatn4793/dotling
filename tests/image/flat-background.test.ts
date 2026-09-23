import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { removeFlatBackground } from "../../src/lib/image/flat-background";

test("flat cutout preserves a thin blade and enclosed colors matching the background", async () => {
  const data = Buffer.alloc(16 * 16 * 4);
  for (let p = 0; p < 256; p++) data.set([200, 200, 200, 255], p * 4);
  for (let y = 4; y <= 10; y++) for (let x = 4; x <= 10; x++) {
    if (x === 4 || x === 10 || y === 4 || y === 10) data.set([0, 0, 0, 255], (y * 16 + x) * 4);
  }
  for (let y = 3; y <= 12; y++) data.set([250, 250, 250, 255], (y * 16 + 12) * 4);
  const input = await sharp(data, { raw: { width: 16, height: 16, channels: 4 } }).png().toBuffer();
  const result = await removeFlatBackground(input);
  const rgba = await sharp(result.png).raw().toBuffer();
  assert.equal(rgba[3], 0);
  assert.equal(rgba[(7 * 16 + 7) * 4 + 3], 255);
  assert.equal(rgba[(7 * 16 + 12) * 4 + 3], 255);
  assert.deepEqual(result.background, [200, 200, 200]);
});

test("only tiny isolated border specks are removed; larger edge content survives", async () => {
  const data = Buffer.alloc(32 * 32 * 4);
  for (let p = 0; p < 1024; p++) data.set([200, 200, 200, 255], p * 4);
  data.set([255, 0, 255, 255], 0);
  // A five-pixel component with only one border pixel must not be discarded.
  for (let y = 0; y < 5; y++) data.set([0, 0, 0, 255], (y * 32 + 20) * 4);
  const input = await sharp(data, { raw: { width: 32, height: 32, channels: 4 } }).png().toBuffer();
  const result = await removeFlatBackground(input);
  const rgba = await sharp(result.png).raw().toBuffer();
  assert.equal(rgba[3], 0);
  assert.equal(rgba[20 * 4 + 3], 255);
  assert.equal(result.removedBorderSpecks, 1);
});
