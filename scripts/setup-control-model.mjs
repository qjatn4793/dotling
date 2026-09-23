import { readFile, stat, mkdir, rename } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const model = JSON.parse(await readFile(new URL("../workflows/models/control-lora-canny-rank128.json", import.meta.url), "utf8"));
const directory = resolve(process.argv[2] ?? "../ComfyUI/models/controlnet");
await mkdir(directory, { recursive: true });
const destination = join(directory, model.filename);
async function verify(path) {
  if ((await stat(path)).size !== model.bytes) throw new Error(`Unexpected model size: ${path}`);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  if (hash.digest("hex") !== model.sha256) throw new Error(`Model checksum mismatch: ${path}`);
}
let exists = true;
try { await stat(destination); } catch (error) { if (error.code === "ENOENT") exists = false; else throw error; }
if (exists) {
  await verify(destination);
  console.log(`Already installed and verified: ${destination}`);
} else {
  const temporary = `${destination}.${randomUUID()}.part`;
  const response = await fetch(model.url, { signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: "wx" }));
  await verify(temporary);
  await rename(temporary, destination);
  console.log(`Installed and verified: ${destination}`);
}
