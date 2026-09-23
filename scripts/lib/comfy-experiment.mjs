import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

export const comfyUrl = process.env.COMFYUI_URL ?? "http://127.0.0.1:8188";
export async function comfyJson(path, options = {}) {
  const response = await fetch(`${comfyUrl}${path}`, { ...options, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}
export async function saveJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2));
  await rename(temporary, path);
}
async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
export async function uploadReference(buffer) {
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const filename = `dotling-pose-${sha256}.png`;
  const form = new FormData();
  form.append("image", new Blob([buffer], { type: "image/png" }), filename);
  form.append("overwrite", "true"); // Content-addressed, identical bytes on every reuse.
  const image = await comfyJson("/upload/image", { method: "POST", body: form });
  return { filename: image.subfolder ? `${image.subfolder}/${image.name}` : image.name, sha256 };
}
export async function runWorkflow(output, id, workflow) {
  await mkdir(output, { recursive: true });
  const workflowHash = createHash("sha256").update(JSON.stringify(workflow)).digest("hex");
  const path = join(output, `${id}.job.json`);
  let job = await readJson(path);
  if (job && job.workflowHash !== workflowHash) throw new Error(`Changed workflow for ${id}: use a new experiment ID`);
  if (job?.state === "complete" && job.imageHashes) {
    const images = {};
    for (const [node, expected] of Object.entries(job.imageHashes)) {
      images[node] = await readFile(join(output, `${id}${node === "8" ? "" : `-node${node}`}.png`));
      const actual = createHash("sha256").update(images[node]).digest("hex");
      if (actual !== expected) throw new Error(`Cached image changed for ${id}/${node}; inspect before regenerating`);
    }
    console.log(`${id}: verified local result, no resubmission`);
    return { job, images };
  }
  if (job?.state === "failed") throw new Error(`Previous execution failed for ${id}; inspect the recorded error before retrying`);
  await saveJson(join(output, `${id}.workflow.json`), workflow);
  if (!job) {
    job = { state: "submitting", started: Date.now(), workflowHash };
    await saveJson(path, job);
    const response = await comfyJson("/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }) });
    job = { ...job, state: "submitted", promptId: response.prompt_id };
    await saveJson(path, job);
  }
  if (!job.promptId) throw new Error(`Uncertain submission for ${id}; inspect queue/history before resubmission`);
  console.log(`${id}: ${job.promptId}`);
  const startedWaiting = Date.now();
  let entry;
  while (Date.now() - startedWaiting < 30 * 60 * 1000) {
    entry = (await comfyJson(`/history/${job.promptId}`))[job.promptId];
    if (entry?.status?.status_str === "error") {
      await saveJson(path, { ...job, state: "failed", error: entry.status });
      throw new Error(`${id}: ${JSON.stringify(entry.status)}`);
    }
    if (entry?.status?.completed && entry.outputs?.["8"]?.images?.length) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!entry?.outputs?.["8"]?.images?.length) throw new Error(`Timeout ${id}; resume the same output directory`);
  const images = {};
  for (const [node, value] of Object.entries(entry.outputs)) {
    if (!value.images?.length) continue;
    const image = value.images[0];
    const response = await fetch(`${comfyUrl}/view?${new URLSearchParams({ filename: image.filename, subfolder: image.subfolder ?? "", type: image.type ?? "output" })}`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Image download failed for ${node}`);
    images[node] = Buffer.from(await response.arrayBuffer());
    await writeFile(join(output, `${id}${node === "8" ? "" : `-node${node}`}.png`), images[node]);
  }
  const imageHashes = Object.fromEntries(Object.entries(images).map(([node, bytes]) => [node, createHash("sha256").update(bytes).digest("hex")]));
  job = { ...job, state: "complete", imageHashes, elapsedMs: job.elapsedMs ?? Date.now() - job.started };
  await saveJson(path, job);
  console.log(`${id}: complete (${Math.round(job.elapsedMs / 1000)}s)`);
  return { job, images };
}
