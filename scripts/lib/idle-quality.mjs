import { buildControlWorkflow } from "./control-quality.mjs";

export function buildIdleWorkflow(config, appearanceFilename, poseFilename) {
  if (!appearanceFilename || !poseFilename || config.denoise >= 1) throw new Error("Idle experiment requires appearance initialization and a pose guide");
  const workflow = buildControlWorkflow(config, poseFilename);
  workflow["15"] = { class_type: "LoadImage", inputs: { image: appearanceFilename } };
  workflow["13"].inputs.pixels = ["15", 0];
  return workflow;
}
