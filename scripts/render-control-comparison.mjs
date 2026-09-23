import sharp from "sharp";
import { resolve, join } from "node:path";
const output = resolve(process.argv[2] ?? "data/experiments/control-quality-v1");
const columns = [
  { label: "Original pose guide (not generated)", raw: "pose.png", pixel: "pose.png", guide: true },
  { label: "Canny only / selected for pose tests", raw: "canny-only.png", pixel: "canny-only-locked/reference.png" },
  { label: "Canny + color reference", raw: "canny-reference.png", pixel: "canny-color-locked/reference.png" },
];
const composite = [];
for (const [i, column] of columns.entries()) {
  const label = Buffer.from(`<svg width="384" height="48"><rect width="384" height="48" fill="#222"/><text x="12" y="20" fill="white" font-family="sans-serif" font-size="14">${column.label.replaceAll("&", "&amp;")}</text><text x="12" y="39" fill="#bbb" font-family="sans-serif" font-size="12">Top: source / Bottom: ${column.guide ? "guide at 64px" : "transparent 64px, locked palette"}</text></svg>`);
  composite.push({ input: label, left: i * 384, top: 0 });
  composite.push({ input: await sharp(join(output, column.raw)).resize(384, 384).png().toBuffer(), left: i * 384, top: 48 });
  let pixel = await sharp(join(output, column.pixel)).resize(64, 64, { kernel: "nearest" }).png().toBuffer();
  const checker = Buffer.alloc(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const tone = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 180 : 220;
    checker.set([tone, tone, tone, 255], (y * 64 + x) * 4);
  }
  pixel = await sharp(checker, { raw: { width: 64, height: 64, channels: 4 } }).composite([{ input: pixel }]).png().toBuffer();
  composite.push({ input: await sharp(pixel).resize(384, 384, { kernel: "nearest" }).png().toBuffer(), left: i * 384, top: 432 });
}
await sharp({ create: { width: 1152, height: 816, channels: 4, background: "#ddd" } }).composite(composite).png().toFile(join(output, "comparison.png"));
console.log(join(output, "comparison.png"));
