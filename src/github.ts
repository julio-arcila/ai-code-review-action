/** GitHub API: PR files + review posting (inline where possible). */
import * as github from "@actions/github";
import type { Finding } from "./prompt.js";
import { clampLine, type FilePatch } from "./diff.js";

type Octokit = ReturnType<typeof github.getOctokit>;

export async function getPrFiles(octokit: Octokit) {
  const { owner, repo } = github.context.repo;
  const pr = github.context.payload.pull_request;
  if (!pr) throw new Error("Not a pull_request event");
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pr.number,
    per_page: 100,
  });
  return { pr, files };
}

const ICON: Record<string, string> = {
  critical: "🚨",
  high: "🔴",
  medium: "🟡",
  low: "🔵",
};

function bodyFor(f: Finding): string {
  let body = `${ICON[f.severity]} **${f.severity.toUpperCase()} · ${f.category}** — ${f.title}\n\n${f.comment}`;
  if (f.suggestion) body += `\n\n\`\`\`suggestion\n${f.suggestion}\n\`\`\``;
  body += `\n\n<sub>🤖 AI review — verify before applying</sub>`;
  return body;
}

export async function postReview(
  octokit: Octokit,
  prNumber: number,
  headSha: string,
  findings: Finding[],
  files: FilePatch[],
  skipped: string[],
  model: string,
  unreliable = false
) {
  const { owner, repo } = github.context.repo;
  const byFile = new Map(files.map((f) => [f.filename, f]));

  const comments = findings
    .map((f) => {
      const fp = byFile.get(f.path);
      if (!fp) return null;
      const line = clampLine(fp, f.line);
      if (line === null) return null;
      return { path: f.path, line, side: "RIGHT" as const, body: bodyFor(f) };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .slice(0, 30); // API cap per review

  const counts = ["critical", "high", "medium", "low"]
    .map((s) => {
      const n = findings.filter((f) => f.severity === s).length;
      return n ? `${ICON[s]} ${n} ${s}` : null;
    })
    .filter(Boolean)
    .join(" · ");

  const verdict = findings.length
    ? `**Findings:** ${counts}`
    : unreliable
      ? "**Inconclusive** ⚠️ — the model returned no parseable output for at least one batch. Re-run or pick another `model`."
      : "**No issues found.** ✅";

  const summary = [
    `## 🤖 AI Code Review (\`${model}\`)`,
    "",
    verdict,
    "",
    `Reviewed ${byFile.size} file(s)` +
      (skipped.length ? `, skipped ${skipped.length} (caps/ignored/binary)` : "") +
      ".",
    "",
    "<sub>Security-first LLM review. Inline comments are attached to the nearest changed line.</sub>",
  ].join("\n");

  await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: headSha,
    event: "COMMENT",
    body: summary,
    comments,
  });
  return { inline: comments.length, total: findings.length };
}
