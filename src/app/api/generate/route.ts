import { NextRequest, NextResponse } from "next/server";
import { pixelate, validatePixelOptions } from "@/lib/image/pixelate";
import { removeBg as removeBackground } from "@/lib/removeBg";

const COMFYUI_URL = process.env.COMFYUI_URL ?? "http://localhost:8188";
export const runtime = "nodejs";

const SDXL_CHECKPOINT = "sd_xl_base_1.0.safetensors";
const SDXL_LORA = "PixelArtRedmond-Lite64.safetensors";

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
        text: `pixel art, PixArFK, ${prompt}, retro game sprite, clean pixel lines, flat colors, no anti-aliasing`,
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

function log(step: string, msg: string, data?: unknown) {
  const time = new Date().toISOString().slice(11, 23);
  const extra = data !== undefined ? ` ${JSON.stringify(data)}` : "";
  console.log(`[${time}] [generate] [${step}]${extra} ${msg}`);
}

async function requireSdxl(): Promise<void> {
  log("model-check", `ComfyUI에 SDXL 체크포인트 확인 요청 → ${COMFYUI_URL}/object_info/CheckpointLoaderSimple`);
  const [checkpointRes, loraRes] = await Promise.all([
    fetch(`${COMFYUI_URL}/object_info/CheckpointLoaderSimple`, { signal: AbortSignal.timeout(10000) }),
    fetch(`${COMFYUI_URL}/object_info/LoraLoader`, { signal: AbortSignal.timeout(10000) }),
  ]);
  if (!checkpointRes.ok || !loraRes.ok) throw new Error("ComfyUI 모델 목록 확인 실패");
  const info = await checkpointRes.json();
  const loraInfo = await loraRes.json();
  const checkpoints: string[] = info?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
  const loras: string[] = loraInfo?.LoraLoader?.input?.required?.lora_name?.[0] ?? [];
  if (checkpoints.includes(SDXL_CHECKPOINT) && loras.includes(SDXL_LORA)) {
    log("model-check", "SDXL 체크포인트와 LoRA 확인 완료");
    return;
  }
  throw new Error("SDXL 체크포인트와 PixelArtRedmond-Lite64 LoRA가 모두 필요합니다");
}

async function queuePrompt(workflow: object, clientId: string): Promise<string> {
  log("queue", `워크플로우 전송 → ${COMFYUI_URL}/prompt`, { clientId });
  const res = await fetch(`${COMFYUI_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    log("queue", `큐 등록 실패 (status ${res.status})`, { body });
    throw new Error("ComfyUI queue 실패");
  }
  const { prompt_id } = await res.json();
  log("queue", `큐 등록 완료`, { promptId: prompt_id });
  return prompt_id;
}

type ComfyImage = { filename: string; subfolder?: string; type?: string };

async function waitForResult(promptId: string): Promise<ComfyImage> {
  log("poll", `결과 대기 시작 (최대 150회 × 2초 = 5분)`, { promptId });
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    log("poll", `폴링 ${i + 1}/150 → ${COMFYUI_URL}/history/${promptId}`);
    const res = await fetch(`${COMFYUI_URL}/history/${promptId}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error("ComfyUI 상태 조회 실패");
    const history = await res.json();
    const entry = history[promptId];
    if (!entry) {
      log("poll", `아직 히스토리 없음 (ComfyUI가 아직 처리 중)`);
      continue;
    }
    const statusStr = entry.status?.status_str;
    log("poll", `ComfyUI 상태: ${statusStr ?? "알 수 없음"}`);
    if (statusStr === "error") {
      const msgs = entry.status?.messages ?? [];
      log("poll", `ComfyUI 오류 메시지`, { messages: msgs });
      throw new Error("ComfyUI 생성 실패");
    }
    for (const nodeId in entry.outputs ?? {}) {
      const images = entry.outputs[nodeId]?.images;
      if (images?.length) {
        log("poll", `이미지 생성 완료`, { nodeId, filename: images[0].filename });
        return images[0];
      }
    }
    log("poll", `outputs 있으나 이미지 아직 없음`);
  }
  throw new Error("시간 초과");
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "올바른 JSON을 입력해주세요" }, { status: 400 });
  }
  const { prompt, resolution = 32, palette = "16", removeBg = false } = body ?? {};
  try {
    validatePixelOptions({ resolution, palette });
    if (typeof removeBg !== "boolean") throw new Error("배경 제거 옵션이 올바르지 않습니다");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  log("request", `요청 수신`, { prompt, resolution, palette, removeBg });

  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 2000) {
    log("request", `프롬프트 없음 → 400 반환`);
    return NextResponse.json({ error: "프롬프트를 입력해주세요" }, { status: 400 });
  }

  const size = Math.min(Math.max(resolution || 32, 16), 64);
  const clientId = crypto.randomUUID();
  log("request", `파라미터 확정`, { size, clientId });

  try {
    await requireSdxl();
    const workflow = buildSdxlWorkflow(prompt);
    log("workflow", `워크플로우 빌드 완료`, { model: "SDXL", nodeCount: Object.keys(workflow).length });

    let generatedImage: ComfyImage;
    try {
      const promptId = await queuePrompt(workflow, clientId);
      generatedImage = await waitForResult(promptId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ComfyUI 오류";
      log("error", `ComfyUI 처리 실패`, { msg, elapsed: `${Date.now() - t0}ms` });
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const imageParams = new URLSearchParams({
      filename: generatedImage.filename,
      subfolder: generatedImage.subfolder ?? "",
      type: generatedImage.type ?? "output",
    });
    log("download", "ComfyUI에서 이미지 다운로드", { filename: generatedImage.filename });
    const imgRes = await fetch(`${COMFYUI_URL}/view?${imageParams}`, { signal: AbortSignal.timeout(30000) });
    if (!imgRes.ok) {
      log("download", `이미지 다운로드 실패 (status ${imgRes.status})`);
      return NextResponse.json({ error: "이미지 다운로드 실패" }, { status: 502 });
    }
    log("download", `이미지 다운로드 완료`);

    let imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    log("download", `버퍼 크기: ${imgBuffer.byteLength} bytes`);

    if (removeBg) {
      log("removebg", `배경 제거 시작`);
      imgBuffer = Buffer.from(await removeBackground(imgBuffer));
      log("removebg", `배경 제거 완료 → ${imgBuffer.byteLength} bytes`);
    }

    log("pixelate", `픽셀화 시작`, { size, palette });
    const { png: result, quality } = await pixelate(imgBuffer, { resolution: size, palette });
    log("pixelate", `픽셀화 완료 → ${result.byteLength} bytes`);

    log("response", `응답 전송 완료`, { elapsed: `${Date.now() - t0}ms` });
    return new NextResponse(new Uint8Array(result), {
      headers: { "Content-Type": "image/png", "X-Dotling-Boundary": String(quality.touchesBoundary), "X-Dotling-Model": "sdxl" },
    });
  } catch (error) {
    log("error", "생성 처리 실패", { message: error instanceof Error ? error.message : "알 수 없는 오류" });
    return NextResponse.json({ error: "생성 서버 연결 또는 이미지 처리에 실패했습니다" }, { status: 502 });
  }
}
