export const characterPrompt = "right-facing side profile, full body, one standing knight, blue tunic, silver helmet, brown boots, short sword held down, pixel art, PixArFK, crisp silhouette, plain white background, centered, empty margin";
export const negativePrompt = "front view, back view, multiple characters, sprite sheet, grid, cropped, text, watermark, blurry, 3d";
export const experiments = [
  { id: "single-512-lora085", size: 512, strength: 0.85 },
  { id: "single-512-lora045", size: 512, strength: 0.45 },
  { id: "single-1024-lora045", size: 1024, strength: 0.45 },
  {
    id: "profile-1024-lora045", size: 1024, strength: 0.45,
    prompt: "(strict side profile facing right:1.5), single full-body knight, helmet visor pointing right, blue tunic, silver helmet, brown boots, one short sword pointing down, idle standing pose, pixel art, PixArFK, white background, empty margin",
  },
  {
    id: "profile-1024-pixelxl045", size: 1024, strength: 0.45, lora: "pixel-art-xl.safetensors",
    prompt: "(strict side profile facing right:1.5), single full-body knight, helmet visor pointing right, blue tunic, silver helmet, brown boots, one short sword pointing down, idle standing pose, pixel art, PixArFK, white background, empty margin",
  },
  {
    id: "direction-probe-1024", size: 1024, strength: 0.45, lora: "pixel-art-xl.safetensors",
    prompt: "pixel art of a medieval knight in side profile, walking towards the right, full body, blue tunic, silver helmet, brown boots, one sword held down, white background",
  },
];
export function buildCharacterWorkflow(config) {
  const { size, strength, seed = 42, prompt = characterPrompt } = config;
  if (![512, 768, 1024].includes(size) || !Number.isFinite(strength) || strength < 0 || strength > 1 || !Number.isSafeInteger(seed)) throw new Error("Invalid experiment configuration");
  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sd_xl_base_1.0.safetensors" } },
    "2": { class_type: "LoraLoader", inputs: { model: ["1", 0], clip: ["1", 1], lora_name: config.lora ?? "PixelArtRedmond-Lite64.safetensors", strength_model: strength, strength_clip: strength } },
    "3": { class_type: "CLIPTextEncode", inputs: { clip: ["2", 1], text: prompt } },
    "4": { class_type: "CLIPTextEncode", inputs: { clip: ["2", 1], text: negativePrompt } },
    "5": { class_type: "EmptyLatentImage", inputs: { width: size, height: size, batch_size: 1 } },
    "6": { class_type: "KSampler", inputs: { model: ["2", 0], positive: ["3", 0], negative: ["4", 0], latent_image: ["5", 0], seed, steps: 20, cfg: 7, sampler_name: "euler", scheduler: "normal", denoise: 1 } },
    "7": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["1", 2] } },
    "8": { class_type: "SaveImage", inputs: { images: ["7", 0], filename_prefix: `dotling-quality-${config.id}` } },
  };
}
