import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const workflow = { "8": { class_type: "SaveImage", inputs: { filename_prefix: "test" } } };
const workflowHash = createHash("sha256").update(JSON.stringify(workflow)).digest("hex");
let submissions = 0;
const server = createServer((request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.url === "/prompt") { submissions++; request.resume(); response.end(JSON.stringify({ prompt_id: "test-prompt" })); }
  else if (request.url === "/history/test-prompt") response.end(JSON.stringify({ "test-prompt": { status: { completed: true }, outputs: { "8": { images: [{ filename: "result.png", subfolder: "nested", type: "output" }] } } } }));
  else if (request.url.startsWith("/view?")) { assert.ok(request.url.includes("subfolder=nested")); response.end("test-image-bytes"); }
  else { response.statusCode = 404; response.end("{}"); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
after(() => { if (server.listening) server.close(); });
process.env.COMFYUI_URL = `http://127.0.0.1:${server.address().port}`;
const { runWorkflow } = await import("../../scripts/lib/comfy-experiment.mjs");

await test("completed jobs reuse verified local artifacts and reject changed inputs or artifacts", async () => {
  const output = await mkdtemp(join(tmpdir(), "dotling-job-"));
  try {
    const first = await runWorkflow(output, "example", workflow);
    assert.equal(first.images["8"].toString(), "test-image-bytes");
    await new Promise((resolve) => server.close(resolve));
    const resumed = await runWorkflow(output, "example", workflow);
    assert.deepEqual(resumed.images["8"], first.images["8"]);
    assert.equal(submissions, 1);
    await assert.rejects(runWorkflow(output, "example", { changed: true }), /Changed workflow/);
    await writeFile(join(output, "example.png"), "corrupt");
    await assert.rejects(runWorkflow(output, "example", workflow), /Cached image changed/);
  } finally { await rm(output, { recursive: true, force: true }); }
});

await test("uncertain submission and recorded failure never silently submit a duplicate", async () => {
  const output = await mkdtemp(join(tmpdir(), "dotling-job-"));
  try {
    await writeFile(join(output, "uncertain.job.json"), JSON.stringify({ state: "submitting", workflowHash }));
    await assert.rejects(runWorkflow(output, "uncertain", workflow), /Uncertain submission/);
    await writeFile(join(output, "failed.job.json"), JSON.stringify({ state: "failed", workflowHash, promptId: "old" }));
    await assert.rejects(runWorkflow(output, "failed", workflow), /Previous execution failed/);
    assert.equal(JSON.parse(await readFile(join(output, "uncertain.job.json"), "utf8")).state, "submitting");
    assert.equal(submissions, 1);
  } finally { await rm(output, { recursive: true, force: true }); }
});
