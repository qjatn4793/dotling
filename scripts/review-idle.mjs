import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import sharp from "sharp";
import { saveJson } from "./lib/comfy-experiment.mjs";
const require = createRequire(import.meta.url);
const { transformFrame } = require("../.test-build/src/lib/image/frame.js");
const { removeFlatBackground } = require("../.test-build/src/lib/image/flat-background.js");
const { constrainToPose } = require("../.test-build/src/lib/image/pose-mask.js");
const output = resolve(process.argv[2] ?? "data/experiments/idle-quality-v1");
await mkdir(output, { recursive: true });
const reference = JSON.parse(await readFile("data/references/knight-side-v1/reference.json", "utf8"));
const transform = { sourceWidth: 768, sourceHeight: 768, sourceBounds: reference.sourceBounds, placement: reference.placement, targetWidth: 20, targetHeight: 44 };
const source = await readFile("data/references/knight-side-v1/cutout.png");
const guide = await readFile(join(output, "pose-cutout.png"));
const baseline = await transformFrame(source, transform, reference.palette);
await writeFile(join(output, "baseline.64.png"), baseline.png);
const frames = [{ id: "baseline", png: baseline.png }];
const baseRaw = await sharp(baseline.png).raw().toBuffer();
const report = { transform, palette: reference.palette, pivot: reference.pivot, status: "requires_visual_review", frames: [] };
for (const id of ["idle-lift-25", "idle-lift-40"]) {
  const cutout = await removeFlatBackground(await readFile(join(output, `${id}.png`)));
  await writeFile(join(output, `${id}.before-mask.png`), cutout.png);
  const mask = await sharp(guide).extractChannel("alpha").erode(4).raw().toBuffer();
  const overlay = await sharp(cutout.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let p = 0; p < mask.length; p++) if (!mask[p] && overlay.data[p * 4 + 3] >= 128) overlay.data.set([255, 0, 80, 255], p * 4);
  await sharp(overlay.data, { raw: overlay.info }).png().toFile(join(output, `${id}.mask-review.png`));
  // Refused masks remain unmodified diagnostic images, never forced into the guide.
  let constrained, maskError;
  try { constrained = await constrainToPose(cutout.png, guide, 4); }
  catch (error) { maskError = error.message; console.log(`${id}: diagnostic only: ${maskError}`); }
  const diagnostic = constrained?.png ?? cutout.png;
  await writeFile(join(output, `${id}.cutout.png`), diagnostic);
  const frame = await transformFrame(diagnostic, transform, reference.palette);
  await writeFile(join(output, `${id}.64.png`), frame.png);
  const pixels = await sharp(frame.png).raw().toBuffer();
  let changed = 0, lowerBodyChanged = 0, silhouetteChanged = 0, visibleUnion = 0, footY = -1;
  for (let p = 0; p < 4096; p++) {
    const i = p * 4, y = Math.floor(p / 64);
    if (pixels[i + 3] || baseRaw[i + 3]) visibleUnion++;
    if (pixels[i + 3]) footY = y;
    if (pixels[i + 3] !== baseRaw[i + 3]) silhouetteChanged++;
    if (!pixels.subarray(i, i + 4).equals(baseRaw.subarray(i, i + 4))) { changed++; if (y >= 44) lowerBodyChanged++; }
  }
  report.frames.push({ id, maskStatus: constrained ? "applied_requires_review" : "rejected_unmasked_diagnostic", maskError, maskRemovedRatio: constrained?.removedRatio, maxRemovedRatio: 0.05, changed, visibleUnion, changedRatio: changed / visibleUnion, lowerBodyChanged, silhouetteChanged, footY, quality: frame.quality });
  frames.push({ id, png: frame.png });
}
if (report.frames.some(f => f.maskStatus === "rejected_unmasked_diagnostic")) report.status = "rejected_mask_gate";
await saveJson(join(output, "metrics.json"), report);
const composites = [];
for (let n = 0; n < frames.length; n++) {
  const preview = await sharp(frames[n].png).resize(384, 384, { kernel: "nearest" }).png().toBuffer();
  composites.push({ input: preview, left: n * 384, top: 48 });
}
const labels = Buffer.from(`<svg width="1152" height="48"><rect width="1152" height="48" fill="#20232a"/>${frames.map((f, n) => `<text x="${n * 384 + 16}" y="30" fill="white" font-size="18">${f.id} / ${n ? "diagnostic only" : "reference"}</text>`).join("")}</svg>`);
await sharp({ create: { width: 1152, height: 432, channels: 4, background: "#aab4b8" } }).composite([{ input: labels, left: 0, top: 0 }, ...composites]).png().toFile(join(output, "comparison.png"));
// Embedded PNGs keep review usable as a standalone file. This is a two-pose
// diagnostic toggle, explicitly not a four-frame animation deliverable.
const uri = png => `data:image/png;base64,${png.toString("base64")}`;
await writeFile(join(output, "review.html"), `<!doctype html><html lang="ko"><meta charset="utf-8"><title>대기 자세 일관성 검수</title><style>body{background:#20232a;color:#fff;font:16px system-ui;padding:24px}section{display:flex;gap:24px}img{width:384px;height:384px;image-rendering:pixelated;background:#aab4b8}button{padding:12px}p{max-width:900px;line-height:1.6}</style><h1>대기 두 자세 비교</h1><p>기준 ↔ 생성 자세를 500ms 간격으로 표시합니다. 4프레임 완성 애니메이션이 아닙니다. 얼굴·갑옷·검·발의 흔들림을 검수하세요.</p><button id="toggle">일시정지</button><section>${frames.slice(1).map(f => `<div><h2>${f.id}</h2><img alt="${f.id}" src="${uri(f.png)}" data-a="${uri(baseline.png)}" data-b="${uri(f.png)}"></div>`).join("")}</section><script>let running=true,pose=false;document.querySelector('button').onclick=e=>{running=!running;e.target.textContent=running?'일시정지':'재생'};setInterval(()=>{if(!running)return;pose=!pose;document.querySelectorAll('img').forEach(img=>img.src=pose?img.dataset.a:img.dataset.b)},500);</script></html>`);
console.log(JSON.stringify(report.frames, null, 2));
