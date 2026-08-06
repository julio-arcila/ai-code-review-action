/** SARIF 2.1.0 emitter — feed to github/codeql-action/upload-sarif for Code Scanning. */
import type { Finding } from "./prompt.js";

const LEVEL: Record<Finding["severity"], string> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "note",
};

export function toSarif(findings: Finding[], toolVersion = "1.0.0") {
  return {
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "AI Code Review",
            version: toolVersion,
            informationUri: "https://github.com/julio-arcila/ai-code-review-action",
            rules: [
              {
                id: "ai-review/finding",
                shortDescription: { text: "LLM-detected issue" },
                properties: { "security-severity": "7.0" },
              },
            ],
          },
        },
        results: findings.map((f) => ({
          ruleId: "ai-review/finding",
          level: LEVEL[f.severity],
          message: { text: `**[${f.severity}/${f.category}]** ${f.title}\n\n${f.comment}` },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: f.path },
                region: { startLine: Math.max(1, f.line) },
              },
            },
          ],
          properties: { severity: f.severity, category: f.category },
        })),
      },
    ],
  };
}
