import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import sharp from "sharp";
const require = createRequire(import.meta.url);
const { normalizeReference } = require("../.test-build/src/lib/image/reference.js");
const { removeFlatBackground } = require("../.test-build/src/lib/image/flat-background.js");
const { removeBg } = require("../.test-build/src/lib/removeBg.js");
if (!process.argv[2] || !process.argv[3]) throw new Error("Usage: node scripts/prepare-reference.mjs <reviewed-source.png> <output-directory>");
const inputPath = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const input = await readFile(inputPath);
console.log("Removing background from reviewed candidate...");
const method = process.argv[4] ?? "neural";
if (!["neural", "flat"].includes(method)) throw new Error("Cutout method must be neural or flat");
const flatResult = method === "flat" ? await removeFlatBackground(input) : null;
const cutout = flatResult ? flatResult.png : await removeBg(input);
await writeFile(join(output, "cutout.png"), cutout);
const result = await normalizeReference(cutout);
await writeFile(join(output, "reference.png"), result.png);
const reference = {
  status: "candidate_requires_review", source: inputPath,
  sourceSha256: createHash("sha256").update(input).digest("hex"),
  referenceSha256: createHash("sha256").update(result.png).digest("hex"),
  palette: result.colors, pivot: result.pivot, sourceBounds: result.sourceBounds,
  placement: result.placement, quality: result.quality,
  backgroundDiagnostics: flatResult ? { background: flatResult.background, tolerance: flatResult.tolerance, removedPixels: flatResult.removedPixels, removedBorderSpecks: flatResult.removedBorderSpecks } : null,
  backgroundRemoval: method === "flat" ? "border-connected-color:tolerance12" : "@imgly/background-removal-node:medium", alphaThreshold: 128,
};
await writeFile(join(output, "reference.json"), JSON.stringify(reference, null, 2));
const checker = Buffer.alloc(64 * 64 * 4);
for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
  const tone = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 190 : 230;
  checker.set([tone, tone, tone, 255], (y * 64 + x) * 4);
}
const preview = await sharp(checker, { raw: { width: 64, height: 64, channels: 4 } }).composite([{ input: result.png }]).png().toBuffer();
await sharp(preview).resize(512, 512, { kernel: "nearest" }).png().toFile(join(output, "preview.png"));
console.log(`Review cutout and 64px reference: ${output}`);
