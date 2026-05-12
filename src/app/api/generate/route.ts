import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getPaletteColors, paletteColorCount, nearestColor } from "@/lib/palettes";
import { removeBgAndFlatten } from "@/lib/removeBg";

const COMFYUI_URL = process.env.COMFYUI_URL ?? "http://localhost:8188";
const UPSCALE = 8;

const SDXL_CHECKPOINT = "sd_xl_base_1.0.safetensors";
const SDXL_LORA = "pixel-art-xl.safetensors";
const SD15_CHECKPOINT = "v1-5-pruned-emaonly.safetensors";
const SD15_LORA = "PixelArtRedmond-Lite64.safetensors";

function buildSdxlWorkflow(prompt: string) {
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: SDXL_CHECKPOINT },
    },
    "2": {
      class_type: "LoraLoader",
      inputs: {
        model: ["1", 0],
        clip: ["1", 1],
        lora_name: SDXL_LORA,
        strength_model: 1.0,
        strength_clip: 1.0,
      },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["2", 1],
        text: `pixel art, ${prompt}, retro game sprite, clean pixel lines, flat colors, no anti-aliasing`,
      },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["2", 1],
        text: "blurry, 3d, realistic, photo, gradient, noise, text, watermark, anti-aliasing",
      },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: { width: 1024, height: 1024, batch_size: 1 },
    },
    "6": {
      class_type: "KSampler",
      inputs: {
        model: ["2", 0],
        positive: ["3", 0],
        negative: ["4", 0],
        latent_image: ["5", 0],
        seed: Math.floor(Math.random() * 2 ** 32),
        steps: 28,
        cfg: 7.0,
        sampler_name: "dpmpp_2m",
        scheduler: "karras",
        denoise: 1.0,
      },
    },
    "7": {
      class_type: "VAEDecode",
      inputs: { samples: ["6", 0], vae: ["1", 2] },
    },
    "8": {
      class_type: "SaveImage",
      inputs: { images: ["7", 0], filename_prefix: "dotling" },
    },
  };
}

function buildSd15Workflow(prompt: string) {
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: SD15_CHECKPOINT },
    },
    "2": {
      class_type: "LoraLoader",
      inputs: {
        model: ["1", 0],
        clip: ["1", 1],
        lora_name: SD15_LORA,
        strength_model: 0.85,
        strength_clip: 0.85,
      },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["2", 1],
        text: `pixel art, ${prompt}, PixArRedmAF, retro game sprite, clean pixel lines, flat colors`,
      },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["2", 1],
        text: "blurry, 3d, realistic, photo, gradient, noise, text, watermark",
      },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: { width: 512, height: 512, batch_size: 1 },
    },
    "6": {
      class_type: "KSampler",
      inputs: {
        model: ["2", 0],
        positive: ["3", 0],
        negative: ["4", 0],
        latent_image: ["5", 0],
        seed: Math.floor(Math.random() * 2 ** 32),
        steps: 28,
        cfg: 7.0,
        sampler_name: "dpmpp_2m",
        scheduler: "karras",
        denoise: 1.0,
      },
    },
    "7": {
      class_type: "VAEDecode",
      inputs: { samples: ["6", 0], vae: ["1", 2] },
    },
    "8": {
      class_type: "SaveImage",
      inputs: { images: ["7", 0], filename_prefix: "dotling" },
    },
  };
}

async function isSdxlReady(): Promise<boolean> {
  const res = await fetch(`${COMFYUI_URL}/object_info/CheckpointLoaderSimple`);
  if (!res.ok) return false;
  const info = await res.json();
  const checkpoints: string[] = info?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
  return checkpoints.includes(SDXL_CHECKPOINT);
}

async function queuePrompt(workflow: object, clientId: string): Promise<string> {
  const res = await fetch(`${COMFYUI_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  if (!res.ok) throw new Error("ComfyUI queue 실패");
  const { prompt_id } = await res.json();
  return prompt_id;
}

async function waitForResult(promptId: string): Promise<string> {
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`${COMFYUI_URL}/history/${promptId}`);
    const history = await res.json();
    const entry = history[promptId];
    if (!entry) continue;
    if (entry.status?.status_str === "error") throw new Error("ComfyUI 생성 실패");
    for (const nodeId in entry.outputs ?? {}) {
      const images = entry.outputs[nodeId]?.images;
      if (images?.length) return images[0].filename;
    }
  }
  throw new Error("시간 초과");
}

async function pixelate(buffer: Buffer, resolution: number, palette: string): Promise<Buffer> {
  const fixedPalette = getPaletteColors(palette);
  const colorCount = paletteColorCount(palette);

  const small = await sharp(buffer)
    .resize(resolution, resolution, { fit: "cover", kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = small;
  const { width, height, channels } = info;

  let pixelData: Buffer;

  if (fixedPalette) {
    const out = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      const r = data[i * channels];
      const g = data[i * channels + 1];
      const b = data[i * channels + 2];
      const [nr, ng, nb] = nearestColor(r, g, b, fixedPalette);
      out[i * 3] = nr;
      out[i * 3 + 1] = ng;
      out[i * 3 + 2] = nb;
    }
    pixelData = out;
  } else {
    const quantized = await sharp(buffer)
      .resize(resolution, resolution, { fit: "cover", kernel: "lanczos3" })
      .png({ colours: colorCount, dither: 1.0 })
      .toBuffer();

    const rawQ = await sharp(quantized).raw().toBuffer({ resolveWithObject: true });
    const qCh = rawQ.info.channels;
    const out = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      out[i * 3] = rawQ.data[i * qCh];
      out[i * 3 + 1] = rawQ.data[i * qCh + 1];
      out[i * 3 + 2] = rawQ.data[i * qCh + 2];
    }
    pixelData = out;
  }

  return sharp(pixelData, { raw: { width, height, channels: 3 } })
    .resize(width * UPSCALE, height * UPSCALE, { kernel: "nearest" })
    .png()
    .toBuffer();
}

export async function POST(req: NextRequest) {
  const { prompt, resolution, palette, removeBg } = await req.json();
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "프롬프트를 입력해주세요" }, { status: 400 });
  }

  const size = Math.min(Math.max(resolution || 32, 16), 64);
  const clientId = crypto.randomUUID();

  const useSdxl = await isSdxlReady();
  const workflow = useSdxl ? buildSdxlWorkflow(prompt) : buildSd15Workflow(prompt);

  let filename: string;
  try {
    const promptId = await queuePrompt(workflow, clientId);
    filename = await waitForResult(promptId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ComfyUI 오류";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const imgRes = await fetch(`${COMFYUI_URL}/view?filename=${filename}&type=output`);
  if (!imgRes.ok) {
    return NextResponse.json({ error: "이미지 다운로드 실패" }, { status: 502 });
  }

  let imgBuffer = Buffer.from(await imgRes.arrayBuffer());

  if (removeBg) {
    imgBuffer = Buffer.from(await removeBgAndFlatten(imgBuffer));
  }

  const result = await pixelate(imgBuffer, size, palette);

  return new NextResponse(new Uint8Array(result), {
    headers: { "Content-Type": "image/png" },
  });
}
