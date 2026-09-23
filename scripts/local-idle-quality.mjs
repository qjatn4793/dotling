import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import sharp from "sharp";
import { saveJson } from "./lib/comfy-experiment.mjs";
const require = createRequire(import.meta.url);
const { deformLocalRegions } = require("../.test-build/src/lib/image/local-motion.js");
const { deformShoulder } = require("../.test-build/src/lib/image/shoulder-motion.js");
const output = resolve(process.argv[2] ?? "data/experiments/local-idle-v1");
await mkdir(output, { recursive: true });
const configPath = process.argv[3] ?? "fixtures/poses/knight-local-idle.json";
const config = JSON.parse(await readFile(configPath, "utf8"));
assert.ok(["procedural_local_row_deformation", "procedural_shoulder_silhouette"].includes(config.method));
const silhouette = config.method === "procedural_shoulder_silhouette";
const source = await readFile("data/references/knight-side-v1/reference.png");
const hash = buffer => createHash("sha256").update(buffer).digest("hex");
assert.equal(hash(source), config.referenceSha256, "The reviewed region mask is specific to this reference");
const original = await sharp(source).ensureAlpha().raw().toBuffer();
function topology(raw) {
  const seen = new Uint8Array(4096);
  let components = 0, holes = 0;
  for (let p = 0; p < 4096; p++) {
    if (seen[p]) continue;
    const solid = raw[p * 4 + 3] > 0;
    const stack = [p]; seen[p] = 1;
    let border = false;
    while (stack.length) {
      const q = stack.pop(), x = q % 64, y = Math.floor(q / 64);
      if (x === 0 || y === 0 || x === 63 || y === 63) border = true;
      for (const n of [x > 0 ? q - 1 : -1, x < 63 ? q + 1 : -1, y > 0 ? q - 64 : -1, y < 63 ? q + 64 : -1]) {
        if (n >= 0 && !seen[n] && (raw[n * 4 + 3] > 0) === solid) { seen[n] = 1; stack.push(n); }
      }
    }
    if (solid) components++; else if (!border) holes++;
  }
  return { components, holes };
}
const originalTopology = topology(original);
const editable = p => config.regions.some(r => p % 64 >= r.left && p % 64 < r.left + r.width && Math.floor(p / 64) >= r.top && Math.floor(p / 64) < r.top + r.height);
const mask = Buffer.alloc(original.length);
const overlay = Buffer.from(original);
for (let p = 0; p < 4096; p++) if (editable(p)) {
  mask.set([255, 255, 255, 255], p * 4);
  overlay.set([255, 60, 150, 255], p * 4);
}
const encode = raw => sharp(raw, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer();
await writeFile(join(output, "editable-mask.png"), await encode(mask));
await sharp(await encode(overlay)).resize(512, 512, { kernel: "nearest" }).toFile(join(output, "mask-preview.png"));
const frames = [], entries = [], rawFrames = [];
const sourceColors = new Set(Array.from({ length: 4096 }, (_, p) => original.subarray(p * 4, p * 4 + 4).toString("hex")));
for (let n = 0; n < config.frames.length; n++) {
  const step = config.frames[n];
  if (!silhouette) assert.equal(step.rise.length, config.regions.length);
  const result = silhouette
    ? await deformShoulder(source, config.regions[0], config.anchorX, step.rows)
    : await deformLocalRegions(source, config.regions.map((region, i) => ({ region, rise: step.rise[i] })));
  const raw = await sharp(result.png).raw().toBuffer();
  let protectedChanged = 0, alphaChanged = 0;
  for (let p = 0; p < 4096; p++) {
    if (!editable(p) && !raw.subarray(p * 4, p * 4 + 4).equals(original.subarray(p * 4, p * 4 + 4))) protectedChanged++;
    if (raw[p * 4 + 3] !== original[p * 4 + 3]) alphaChanged++;
    assert.ok(sourceColors.has(raw.subarray(p * 4, p * 4 + 4).toString("hex")), "New color introduced");
  }
  assert.equal(protectedChanged, 0);
  if (!silhouette) assert.equal(alphaChanged, 0);
  for (const y of config.seamRows ?? []) assert.deepEqual(raw.subarray(y * 256, (y + 1) * 256), original.subarray(y * 256, (y + 1) * 256), `Fixed seam changed at row ${y}`);
  if (silhouette && step.rows.length) assert.ok(alphaChanged > 0, "Requested contour motion did not occur");
  const frameTopology = topology(raw);
  assert.deepEqual(frameTopology, originalTopology, "Silhouette split or a closed gap changed");
  const file = `idle-${n}.png`;
  await writeFile(join(output, file), result.png);
  frames.push(result.png); rawFrames.push(raw);
  entries.push({ file, name: step.name, rect: { x: n * 64, y: 0, width: 64, height: 64 }, durationMs: step.durationMs, pivot: { x: 32, y: 56 }, sha256: hash(result.png), changedPixels: result.changed, protectedChanged, alphaChanged, topology: frameTopology });
}
const sheet = await sharp({ create: { width: frames.length * 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(frames.map((input, n) => ({ input, left: n * 64, top: 0 }))).png().toBuffer();
await writeFile(join(output, "idle-sheet.png"), sheet);
for (let n = 0; n < frames.length; n++) assert.deepEqual(await sharp(sheet).extract({ left: n * 64, top: 0, width: 64, height: 64 }).raw().toBuffer(), rawFrames[n]);
const transitions = rawFrames.map((raw, n) => {
  const next = rawFrames[(n + 1) % rawFrames.length];
  let changed = 0;
  for (let p = 0; p < 4096; p++) if (!raw.subarray(p * 4, p * 4 + 4).equals(next.subarray(p * 4, p * 4 + 4))) changed++;
  return { from: n, to: (n + 1) % rawFrames.length, changedPixels: changed };
});
const metadata = { version: 1, status: "procedural_candidate_requires_visual_review", method: config.method, configPath, direction: "right", loop: true, referenceSha256: hash(source), regions: config.regions, seamRows: config.seamRows, uniqueFrameCount: new Set(rawFrames.map(hash)).size, frames: entries, transitions };
await saveJson(join(output, "idle.json"), metadata);
const enlargedFrames = await Promise.all(frames.map(f => sharp(f).resize(384, 384, { kernel: "nearest" }).raw().toBuffer()));
await sharp(Buffer.concat(enlargedFrames), { raw: { width: 384, height: 384 * frames.length, channels: 4, pageHeight: 384 } }).gif({ loop: 0, delay: entries.map(f => f.durationMs), colours: 32, dither: 0 }).toFile(join(output, "preview.gif"));
await sharp({ create: { width: 1024, height: 300, channels: 4, background: "#9faeb5" } }).composite([
  { input: Buffer.from(`<svg width="1024" height="44"><rect width="1024" height="44" fill="#20232a"/>${entries.map((f, i) => `<text x="${i * 256 + 12}" y="28" fill="white" font-size="16">${i}: ${f.name} (${f.durationMs}ms)</text>`).join("")}</svg>`), left: 0, top: 0 },
  ...await Promise.all(frames.map(async (f, i) => ({ input: await sharp(f).resize(256, 256, { kernel: "nearest" }).png().toBuffer(), left: i * 256, top: 44 }))),
]).png().toFile(join(output, "comparison.png"));
const uris = frames.map(f => `data:image/png;base64,${f.toString("base64")}`);
await writeFile(join(output, "review.html"), `<!doctype html><html lang="ko"><meta charset="utf-8"><link rel="icon" href="data:,"><title>부분 변형 대기 후보</title><style>body{background:#20232a;color:#fff;font:16px system-ui;padding:24px}main{display:flex;gap:24px;flex-wrap:wrap}img{width:384px;height:384px;image-rendering:pixelated;background:#9faeb5}button{padding:12px;margin:4px}p{max-width:850px;line-height:1.6}</style><h1>부분 변형 대기 동작 후보</h1><p>AI 재생성이 아닌 원본 픽셀의 부분 변형입니다. 4개 타임라인 프레임에 고유 자세는 ${metadata.uniqueFrameCount}개입니다. ${silhouette ? "어깨 외곽선이 최대 1픽셀 움직입니다. 얼굴·팔·무기·하체와 목/팔 연결 행은 원본을 보존합니다. 기사 전용 절차적 후보이며 전신 호흡 동작은 아닙니다." : "분홍 마스크 안의 가슴·어깨만 바뀌며 실루엣·얼굴·팔·무기·하체는 보존합니다. 움직임은 갑옷 내부의 1픽셀 변화이며 전신 호흡 동작은 아닙니다."}</p><button id="play">일시정지</button><button id="step">다음 프레임</button><span id="frame"></span><main><div><h2>기준</h2><img src="${uris[0]}" alt="기준 캐릭터"></div><div><h2>대기 후보</h2><img id="animation" src="${uris[0]}" alt="부분 변형 대기 후보"></div></main><script>const frames=${JSON.stringify(uris)},durations=${JSON.stringify(entries.map(f => f.durationMs))};let index=0,playing=true,timer;function show(){document.querySelector('#animation').src=frames[index];document.querySelector('#frame').textContent='프레임 '+index}function schedule(){clearTimeout(timer);if(playing)timer=setTimeout(()=>{index=(index+1)%frames.length;show();schedule()},durations[index])}document.querySelector('#play').onclick=e=>{playing=!playing;e.target.textContent=playing?'일시정지':'재생';schedule()};document.querySelector('#step').onclick=()=>{playing=false;document.querySelector('#play').textContent='재생';clearTimeout(timer);index=(index+1)%frames.length;show()};show();schedule();</script></html>`);
console.log(JSON.stringify({ output, uniqueFrameCount: metadata.uniqueFrameCount, frames: entries, transitions }, null, 2));
