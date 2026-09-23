import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import sharp from "sharp";
import { comfyJson, uploadReference, runWorkflow, saveJson } from "./lib/comfy-experiment.mjs";
import { controlModel, controlExperiments, buildControlWorkflow } from "./lib/control-quality.mjs";

const require = createRequire(import.meta.url);
const { pixelate } = require("../.test-build/src/lib/image/pixelate.js");
const output = resolve(process.argv[2] ?? "data/experiments/control-quality-v1");
await mkdir(output, { recursive: true });
const inventory = await comfyJson("/object_info");
for (const name of ["Canny", "ControlNetLoader", "ControlNetApplyAdvanced", "VAEEncode", "LoadImage"]) if (!inventory[name]) throw new Error(`Missing node: ${name}`);
if (!inventory.ControlNetLoader.input.required.control_net_name[0].includes(controlModel)) throw new Error(`Missing control model: ${controlModel}`);
const pose = await sharp(await readFile("fixtures/poses/knight-side-idle.svg")).png().toBuffer();
await writeFile(join(output, "pose.png"), pose);
const reference = await uploadReference(pose);
await saveJson(join(output, "reference-input.json"), { ...reference, source: "fixtures/poses/knight-side-idle.svg", purpose: "original geometric direction/pose/color guide; not generated artwork" });
await saveJson(join(output, "system.json"), await comfyJson("/system_stats"));
const results = [];
for (const experiment of controlExperiments) {
  const workflow = buildControlWorkflow(experiment, reference.filename);
  const { job, images } = await runWorkflow(output, experiment.id, workflow);
  const converted = await pixelate(images["8"], { resolution: 64, palette: "16" });
  await writeFile(join(output, `${experiment.id}.64.png`), converted.png);
  results.push({ ...experiment, ...job, referenceSha256: reference.sha256, review: "pending", quality: converted.quality });
  await saveJson(join(output, "results.json"), results);
}
console.log(`Review source, control edges, and 64px outputs: ${output}`);
