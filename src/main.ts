/** Action entry: PR diff -> batched LLM review -> inline comments + gate + SARIF. */
import * as core from "@actions/core";
import * as github from "@actions/github";
import { writeFileSync } from "node:fs";
import { prepareFiles } from "./diff.js";
import {
  SYSTEM_PROMPT,
  buildBatchPrompt,
  parseFindings,
  maxSeverity,
  SEVERITY_ORDER,
  type Finding,
} from "./prompt.js";
import { makeClient, reviewBatch } from "./llm.js";
import { getPrFiles, postReview } from "./github.js";
import { toSarif } from "./sarif.js";

const BATCH_SIZE = 5; // files per LLM call

async function run() {
  const token = core.getInput("github-token", { required: true });
  const model = core.getInput("model") || "openai/gpt-4o-mini";
  const baseUrl = core.getInput("base-url") || "https://models.github.ai/inference";
  const apiKey = core.getInput("api-key") || token; // GitHub Models: GITHUB_TOKEN works
  const maxFiles = parseInt(core.getInput("max-files") || "20", 10);
  const maxDiffLines = parseInt(core.getInput("max-diff-lines") || "4000", 10);
  const failOn = core.getInput("fail-on") || "high";
  const sarifPath = core.getInput("sarif-path") || "";
  const ignore = (core.getInput("ignore") || "").split(",").map((s) => s.trim());

  const octokit = github.getOctokit(token);
  const { pr, files } = await getPrFiles(octokit);
  core.info(`PR #${pr.number}: ${files.length} changed files`);

  const { reviewable, skipped } = prepareFiles(files, { maxFiles, maxDiffLines, ignore });
  core.info(`Reviewing ${reviewable.length}, skipped ${skipped.length}`);

  if (reviewable.length === 0) {
    core.info("Nothing to review");
    core.setOutput("findings", "0");
    core.setOutput("max-severity", "none");
    return;
  }

  const client = makeClient({ baseUrl, apiKey, model });
  const findings: Finding[] = [];

  for (let i = 0; i < reviewable.length; i += BATCH_SIZE) {
    const batch = reviewable.slice(i, i + BATCH_SIZE);
    core.info(`Batch ${i / BATCH_SIZE + 1}: ${batch.map((b) => b.filename).join(", ")}`);
    const raw = await reviewBatch(client, model, SYSTEM_PROMPT, buildBatchPrompt(batch));
    const parsed = parseFindings(raw);
    core.info(`  -> ${parsed.length} findings`);
    findings.push(...parsed);
  }

  const { inline, total } = await postReview(
    octokit,
    pr.number,
    pr.head.sha,
    findings,
    reviewable,
    skipped,
    model
  );
  core.info(`Posted review: ${total} findings (${inline} inline)`);

  if (sarifPath) {
    writeFileSync(sarifPath, JSON.stringify(toSarif(findings), null, 2));
    core.info(`SARIF written: ${sarifPath}`);
  }

  const worst = maxSeverity(findings);
  core.setOutput("findings", String(total));
  core.setOutput("max-severity", worst);

  if (
    worst !== "none" &&
    SEVERITY_ORDER.indexOf(worst) >= SEVERITY_ORDER.indexOf(failOn as any) &&
    failOn !== "none"
  ) {
    core.setFailed(`AI review found ${worst}-severity issues (gate: fail-on=${failOn})`);
  }
}

run().catch((err) => core.setFailed(err instanceof Error ? err.message : String(err)));
