import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { saveJson } from "./lib/comfy-experiment.mjs";
const require = createRequire(import.meta.url);
const { removeFlatBackground } = require("../.test-build/src/lib/image/flat-background.js");
const { constrainToPose } = require("../.test-build/src/lib/image/pose-mask.js");
const { normalizeReference } = require("../.test-build/src/lib/image/reference.js");
if (process.argv.length < 5) throw new Error("Usage: node scripts/prepare-controlled-reference.mjs source.png pose.png output-directory");
const source = await readFile(process.argv[2]);
const guide = await readFile(process.argv[3]);
const output = resolve(process.argv[4]);
await mkdir(output, { recursive: true });
const sourceCutout = await removeFlatBackground(source);
// This original SVG guide reserves pure white exclusively for empty space,
// including enclosed gaps between legs. Do not apply this policy to arbitrary art.
const guideRaw = await sharp(guide).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < guideRaw.data.length; i += 4) {
  if (guideRaw.data[i] >= 250 && guideRaw.data[i + 1] >= 250 && guideRaw.data[i + 2] >= 250) guideRaw.data.fill(0, i, i + 4);
}
const guideCutout = { png: await sharp(guideRaw.data, { raw: { width: guideRaw.info.width, height: guideRaw.info.height, channels: 4 } }).png().toBuffer() };
await writeFile(join(output, "before-mask.png"), sourceCutout.png);
const maxRemovedRatio = process.argv[5] === undefined ? 0.05 : Number(process.argv[5]);
const constrained = await constrainToPose(sourceCutout.png, guideCutout.png, 4, maxRemovedRatio);
await writeFile(join(output, "cutout.png"), constrained.png);
const palette = JSON.parse(await readFile("fixtures/poses/knight-palette.json", "utf8"));
const result = await normalizeReference(constrained.png, "nearest", palette);
await writeFile(join(output, "reference.png"), result.png);
await sharp(result.png).resize(512, 512, { kernel: "nearest" }).png().toFile(join(output, "preview.png"));
await saveJson(join(output, "reference.json"), {
  status: "candidate_requires_review", sourceSha256: createHash("sha256").update(source).digest("hex"),
  guideSha256: createHash("sha256").update(guide).digest("hex"),
  referenceSha256: createHash("sha256").update(result.png).digest("hex"),
  palette: result.colors, pivot: result.pivot, sourceBounds: result.sourceBounds, placement: result.placement,
  quality: result.quality, resampling: "nearest", paletteSource: "fixtures/poses/knight-palette.json", mask: { removed: constrained.removed, foreground: constrained.foreground, removedRatio: constrained.removedRatio, whiteAlphaExpansionPixels: constrained.margin, maxRemovedRatio },
});
console.log(`Review controlled reference: ${output}`);
