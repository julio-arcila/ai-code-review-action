/** Review prompts + output schema. */

export const SYSTEM_PROMPT = `You are a senior staff engineer doing a security-first code review (DevSecOps mindset).
Review the given unified diffs. Report ONLY real, actionable issues introduced by this change — never nitpick style, never comment on untouched code.

Severity scale:
- critical: exploitable security flaw, data loss, crash in prod
- high: bug, authZ/authN issue, injection, secret leak, race condition, broken logic
- medium: perf problem, missing error handling, risky pattern
- low: minor maintainability issue worth one line

Rules:
- Cite the exact line number in the NEW file (from the diff context).
- If you suspect but cannot confirm, do not report it.
- Max 10 findings per batch, ordered by severity.
- Respond with ONLY a JSON array, no prose, no fences.

Finding schema:
[{
  "path": string,           // file path exactly as in the diff
  "line": number,           // line in the NEW file
  "severity": "critical"|"high"|"medium"|"low",
  "category": "security"|"bug"|"performance"|"maintainability",
  "title": string,          // <= 80 chars
  "comment": string,        // what + why + how to fix, markdown ok, <= 500 chars
  "suggestion": string|null // optional replacement code snippet
}]`;

export interface Finding {
  path: string;
  line: number;
  severity: "critical" | "high" | "medium" | "low";
  category: "security" | "bug" | "performance" | "maintainability";
  title: string;
  comment: string;
  suggestion: string | null;
}

export const SEVERITY_ORDER = ["none", "low", "medium", "high", "critical"] as const;

export function maxSeverity(findings: Finding[]): (typeof SEVERITY_ORDER)[number] {
  let max: (typeof SEVERITY_ORDER)[number] = "none";
  for (const f of findings) {
    if (SEVERITY_ORDER.indexOf(f.severity) > SEVERITY_ORDER.indexOf(max)) max = f.severity;
  }
  return max;
}

export function buildBatchPrompt(
  batch: Array<{ filename: string; patch: string }>
): string {
  const parts = batch.map(
    (f) => `=== FILE: ${f.filename} ===\n${f.patch}`
  );
  return `Review these diffs:\n\n${parts.join("\n\n")}`;
}

/** Parse LLM JSON output tolerantly (strips fences, finds the array). */
export function parseFindings(raw: string): Finding[] {
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (f) =>
        f &&
        typeof f.path === "string" &&
        typeof f.line === "number" &&
        ["critical", "high", "medium", "low"].includes(f.severity) &&
        typeof f.comment === "string"
    ) as Finding[];
  } catch {
    return [];
  }
}
