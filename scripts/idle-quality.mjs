import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import sharp from "sharp";
import { buildIdleWorkflow } from "./lib/idle-quality.mjs";
import { uploadReference, runWorkflow, saveJson } from "./lib/comfy-experiment.mjs";

const output = resolve(process.argv[2] ?? "data/experiments/idle-quality-v1");
await mkdir(output, { recursive: true });
const source = await readFile("data/references/knight-side-v1/cutout.png");
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
// A small breathing guide: lift the upper body by 12 source pixels (~1 native pixel),
// taper to zero at the waist; legs and foot contact stay fixed. This is a guide,
// not a generated animation frame. Appearance initialization remains unchanged.
const pose = Buffer.alloc(data.length);
for (let y = 0; y < info.height; y++) {
  const offset = Math.round(12 * Math.max(0, Math.min(1, (520 - y) / 160)));
  const sy = Math.min(info.height - 1, y + offset);
  data.copy(pose, y * info.width * 4, sy * info.width * 4, (sy + 1) * info.width * 4);
}
const guideCutout = await sharp(pose, { raw: info }).png().toBuffer();
const appearance = await sharp(source).flatten({ background: "#ffffff" }).png().toBuffer();
const guide = await sharp(guideCutout).flatten({ background: "#ffffff" }).png().toBuffer();
await writeFile(join(output, "appearance.png"), appearance);
await writeFile(join(output, "pose.png"), guide);
await writeFile(join(output, "pose-cutout.png"), guideCutout);
const appearanceInput = await uploadReference(appearance);
const poseInput = await uploadReference(guide);
await saveJson(join(output, "inputs.json"), { appearance: appearanceInput, pose: poseInput, source: "data/references/knight-side-v1", upperBodyLift: 12, footMotion: 0 });
for (const denoise of [0.25, 0.4]) {
  const id = `idle-lift-${Math.round(denoise * 100)}`;
  const workflow = buildIdleWorkflow({ id, controlStrength: 0.9, denoise }, appearanceInput.filename, poseInput.filename);
  await runWorkflow(output, id, workflow);
}
