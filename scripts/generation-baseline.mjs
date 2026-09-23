import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const base = process.env.COMFYUI_URL ?? "http://127.0.0.1:8188";
const output = `data/experiments/${new Date().toISOString().replaceAll(":", "-")}`;
await mkdir(output, { recursive: true });
async function json(path, options = {}) {
  const res = await fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}
const inventory = await json("/object_info");
await writeFile(`${output}/system.json`, JSON.stringify(await json("/system_stats"), null, 2));
const checkpoint = "sd_xl_base_1.0.safetensors";
const lora = "PixelArtRedmond-Lite64.safetensors";
if (!inventory.CheckpointLoaderSimple?.input.required.ckpt_name[0].includes(checkpoint) ||
    !inventory.LoraLoader?.input.required.lora_name[0].includes(lora)) throw new Error("SDXL baseline model pair is missing");
const character = "small knight, blue tunic, silver helmet, brown boots, one short sword, full body, side view facing right";
const results = [];
for (const [action, layout] of [["idle", "4 frames in a 2 by 2 grid, breathing"], ["run", "8 frames in a 4 by 2 grid, running cycle"], ["attack", "8 frames in a 4 by 2 grid, sword slash anticipation strike recovery"]]) {
  const prompt = `pixel art, PixArFK, game animation sprite sheet, ${character}, ${layout}, same character in every frame, evenly spaced cells, plain white background, no text`;
  const workflow = {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: checkpoint } },
    "2": { class_type: "LoraLoader", inputs: { model: ["1", 0], clip: ["1", 1], lora_name: lora, strength_model: 0.85, strength_clip: 0.85 } },
    "3": { class_type: "CLIPTextEncode", inputs: { clip: ["2", 1], text: prompt } },
    "4": { class_type: "CLIPTextEncode", inputs: { clip: ["2", 1], text: "photo, realistic, blurry, text, watermark, cropped body, inconsistent character" } },
    "5": { class_type: "EmptyLatentImage", inputs: { width: 512, height: 512, batch_size: 1 } },
    "6": { class_type: "KSampler", inputs: { model: ["2", 0], positive: ["3", 0], negative: ["4", 0], latent_image: ["5", 0], seed: 42, steps: 20, cfg: 7, sampler_name: "euler", scheduler: "normal", denoise: 1 } },
    "7": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["1", 2] } },
    "8": { class_type: "SaveImage", inputs: { images: ["7", 0], filename_prefix: `dotling-baseline-${action}` } },
  };
  await writeFile(`${output}/${action}.workflow.json`, JSON.stringify(workflow, null, 2));
  const started = Date.now();
  const { prompt_id } = await json("/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }) });
  console.log(`${action}: submitted ${prompt_id}`);
  await writeFile(`${output}/${action}.job.json`, JSON.stringify({ prompt_id, started }));
  let image;
  while (Date.now() - started < 600000) {
    await new Promise((r) => setTimeout(r, 2000));
    const entry = (await json(`/history/${prompt_id}`))[prompt_id];
    if (entry?.status?.status_str === "error") throw new Error(JSON.stringify(entry.status));
    image = entry?.outputs?.["8"]?.images?.[0];
    if (image) break;
  }
  if (!image) throw new Error(`Timed out: ${prompt_id}; inspect history before retrying`);
  const res = await fetch(`${base}/view?${new URLSearchParams({ filename: image.filename, subfolder: image.subfolder, type: image.type })}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Image download failed: ${res.status}`);
  await writeFile(`${output}/${action}.png`, Buffer.from(await res.arrayBuffer()));
  results.push({ action, prompt_id, elapsedMs: Date.now() - started, checkpoint, lora, seed: 42 });
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(`${action}: saved (${Math.round((Date.now() - started) / 1000)}s) ${output}/${action}.png`);
}
console.log(`Review raw images before accepting or slicing: ${output}`);
