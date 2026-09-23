import { mkdir, writeFile, readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import sharp from "sharp";
import { buildCharacterWorkflow, experiments } from "./lib/character-quality.mjs";

const require = createRequire(import.meta.url);
// npm test compiles the production pixel pipeline; no duplicate conversion implementation.
const { pixelate } = require("../.test-build/src/lib/image/pixelate.js");
const base = process.env.COMFYUI_URL ?? "http://127.0.0.1:8188";
const output = resolve(process.argv[2] ?? `data/experiments/character-${new Date().toISOString().replaceAll(":", "-")}`);
await mkdir(output, { recursive: true });
console.log(`Output: ${output}`);
async function json(path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}
async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return null; throw e; }
}
await writeFile(join(output, "system.json"), JSON.stringify(await json("/system_stats"), null, 2));
const results = [];
for (const experiment of experiments) {
  const workflow = buildCharacterWorkflow(experiment);
  const workflowHash = createHash("sha256").update(JSON.stringify(workflow)).digest("hex");
  const jobFile = join(output, `${experiment.id}.job.json`);
  let job = await readJson(jobFile);
  if (job && job.workflowHash !== workflowHash) throw new Error(`Configuration changed for ${experiment.id}; use a new output directory`);
  await writeFile(join(output, `${experiment.id}.workflow.json`), JSON.stringify(workflow, null, 2));
  if (!job) {
    // Persist submission intent so a crash around /prompt does not silently submit a duplicate.
    job = { workflowHash, started: Date.now(), state: "submitting" };
    await writeFile(jobFile, JSON.stringify(job, null, 2));
    const { prompt_id } = await json("/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }) });
    job = { ...job, prompt_id, state: "submitted" };
    await writeFile(jobFile, JSON.stringify(job, null, 2));
  }
  if (!job.prompt_id) throw new Error(`Uncertain submission in ${jobFile}; inspect ComfyUI history before retrying`);
  console.log(`${experiment.id}: ${job.prompt_id}`);
  let image;
  const waitStarted = Date.now();
  while (Date.now() - waitStarted < 30 * 60 * 1000) {
    const entry = (await json(`/history/${job.prompt_id}`))[job.prompt_id];
    if (entry?.status?.status_str === "error") throw new Error(JSON.stringify(entry.status));
    image = entry?.outputs?.["8"]?.images?.[0];
    if (image) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!image) throw new Error(`Timed out: ${job.prompt_id}; resume this directory, do not blindly resubmit`);
  const response = await fetch(`${base}/view?${new URLSearchParams({ filename: image.filename, subfolder: image.subfolder ?? "", type: image.type ?? "output" })}`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
  const raw = Buffer.from(await response.arrayBuffer());
  const rawName = `${experiment.id}.png`;
  await writeFile(join(output, rawName), raw);
  const processed = await pixelate(raw, { resolution: 64, palette: "16", sourceKind: "image" });
  await writeFile(join(output, `${experiment.id}.64.png`), processed.png);
  const row = { ...experiment, seed: 42, workflowHash, prompt_id: job.prompt_id, elapsedMs: job.elapsedMs ?? Date.now() - job.started, rawName, palette: processed.colors, quality: processed.quality, review: "pending" };
  results.push(row);
  await writeFile(jobFile, JSON.stringify({ ...job, elapsedMs: row.elapsedMs, state: "complete" }, null, 2));
  await writeFile(join(output, "results.json"), JSON.stringify(results, null, 2));
  console.log(`${experiment.id}: complete in ${Math.round(row.elapsedMs / 1000)}s`);
}
const composites = [];
for (const [index, experiment] of experiments.entries()) {
  const label = Buffer.from(`<svg width="384" height="48"><rect width="384" height="48" fill="#222"/><text x="12" y="21" fill="white" font-family="sans-serif" font-size="15">${experiment.id}</text><text x="12" y="39" fill="#bbb" font-family="sans-serif" font-size="12">Top: source / Bottom: 64px, 16 colors</text></svg>`);
  composites.push({ input: label, left: index * 384, top: 0 });
  composites.push({ input: await sharp(join(output, `${experiment.id}.png`)).resize(384, 384).png().toBuffer(), left: index * 384, top: 48 });
  composites.push({ input: await sharp(join(output, `${experiment.id}.64.png`)).resize(384, 384, { kernel: "nearest" }).png().toBuffer(), left: index * 384, top: 432 });
}
await sharp({ create: { width: 384 * experiments.length, height: 816, channels: 4, background: "#888" } }).composite(composites).png().toFile(join(output, "comparison.png"));
console.log(`Visual review required: ${join(output, "comparison.png")}`);
