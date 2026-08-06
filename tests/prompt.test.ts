import { describe, it, expect } from "vitest";
import { parseFindings, maxSeverity, buildBatchPrompt, type Finding } from "../src/prompt.js";
import { toSarif } from "../src/sarif.js";

describe("parseFindings", () => {
  it("parses clean JSON", () => {
    const raw = `[{"path":"a.ts","line":3,"severity":"high","category":"security","title":"SQLi","comment":"concat query","suggestion":null}]`;
    const f = parseFindings(raw);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe("high");
  });
  it("strips markdown fences and prose", () => {
    const raw = "Here you go:\n```json\n[{\"path\":\"b.ts\",\"line\":1,\"severity\":\"low\",\"category\":\"bug\",\"title\":\"t\",\"comment\":\"c\",\"suggestion\":null}]\n```";
    expect(parseFindings(raw)).toHaveLength(1);
  });
  it("rejects malformed entries and garbage", () => {
    expect(parseFindings("not json")).toHaveLength(0);
    expect(parseFindings(`[{"path":"a.ts"}]`)).toHaveLength(0);
    expect(parseFindings(`[{"path":"a.ts","line":1,"severity":"MEGA","category":"x","title":"t","comment":"c"}]`)).toHaveLength(0);
  });
});

describe("maxSeverity", () => {
  it("orders severities correctly", () => {
    expect(maxSeverity([])).toBe("none");
    const mk = (s: Finding["severity"]): Finding => ({ path: "a", line: 1, severity: s, category: "bug", title: "", comment: "", suggestion: null });
    expect(maxSeverity([mk("low"), mk("high"), mk("medium")])).toBe("high");
    expect(maxSeverity([mk("critical")])).toBe("critical");
  });
});

describe("buildBatchPrompt", () => {
  it("includes filenames and patches", () => {
    const p = buildBatchPrompt([{ filename: "x.ts", patch: "@@ -1 +1 @@\n-a\n+b" }]);
    expect(p).toContain("=== FILE: x.ts ===");
    expect(p).toContain("@@ -1 +1 @@");
  });
});

describe("toSarif", () => {
  it("emits valid SARIF 2.1.0 structure", () => {
    const sarif = toSarif([
      { path: "src/a.ts", line: 5, severity: "high", category: "security", title: "t", comment: "c", suggestion: null },
    ]);
    expect(sarif.version).toBe("2.1.0");
    const result = sarif.runs[0]!.results[0]!;
    expect(result.level).toBe("error");
    expect(result.locations[0]!.physicalLocation.region.startLine).toBe(5);
  });
});
