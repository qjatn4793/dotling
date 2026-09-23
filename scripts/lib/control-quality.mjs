import { buildCharacterWorkflow } from "./character-quality.mjs";

export const controlModel = "control-lora-canny-rank128.safetensors";
export const controlExperiments = [
  { id: "canny-only", controlStrength: 0.9, denoise: 1 },
  { id: "canny-reference", controlStrength: 0.9, denoise: 0.6 },
];
export function buildControlWorkflow(config, referenceFilename) {
  const { id, controlStrength, denoise } = config;
  if (!referenceFilename || !Number.isFinite(controlStrength) || controlStrength < 0 || controlStrength > 2 || !Number.isFinite(denoise) || denoise <= 0 || denoise > 1) throw new Error("Invalid control experiment");
  const workflow = buildCharacterWorkflow({
    id, size: 768, strength: 0.35, lora: "pixel-art-xl.safetensors", seed: 42,
    prompt: "pixel art, right-facing side view of one full-body knight, silver helmet, blue tunic, brown boots, single short sword held down, clean dark outline, flat colors, isolated on pure white background",
  });
  workflow["4"].inputs.text = "front view, back view, multiple characters, extra weapons, shield, shadow, ground, text, watermark, blurry, 3d, gradient";
  workflow["9"] = { class_type: "LoadImage", inputs: { image: referenceFilename } };
  workflow["10"] = { class_type: "Canny", inputs: { image: ["9", 0], low_threshold: 0.3, high_threshold: 0.6 } };
  workflow["11"] = { class_type: "ControlNetLoader", inputs: { control_net_name: controlModel } };
  workflow["12"] = { class_type: "ControlNetApplyAdvanced", inputs: {
    positive: ["3", 0], negative: ["4", 0], control_net: ["11", 0], image: ["10", 0],
    strength: controlStrength, start_percent: 0, end_percent: 0.9,
  } };
  workflow["6"].inputs.positive = ["12", 0];
  workflow["6"].inputs.negative = ["12", 1];
  workflow["6"].inputs.denoise = denoise;
  if (denoise < 1) {
    workflow["13"] = { class_type: "VAEEncode", inputs: { pixels: ["9", 0], vae: ["1", 2] } };
    workflow["6"].inputs.latent_image = ["13", 0];
  }
  workflow["14"] = { class_type: "SaveImage", inputs: { images: ["10", 0], filename_prefix: "dotling-canny-guide" } };
  return workflow;
}
