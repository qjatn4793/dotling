import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIdleWorkflow } from "../../scripts/lib/idle-quality.mjs";

test("idle generation initializes appearance independently of the changed pose", () => {
  const workflow = buildIdleWorkflow({ id: "test", controlStrength: 0.9, denoise: 0.25 }, "appearance.png", "pose.png");
  assert.equal(workflow["15"].inputs.image, "appearance.png");
  assert.equal(workflow["9"].inputs.image, "pose.png");
  assert.deepEqual(workflow["13"].inputs.pixels, ["15", 0]);
  assert.deepEqual(workflow["10"].inputs.image, ["9", 0]);
  assert.deepEqual(workflow["6"].inputs.latent_image, ["13", 0]);
  assert.equal(workflow["6"].inputs.denoise, 0.25);
  assert.throws(() => buildIdleWorkflow({ denoise: 1 }, "appearance.png", "pose.png"), /appearance/);
});
