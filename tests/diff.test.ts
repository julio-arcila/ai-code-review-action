import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { globToRegex, isIgnored, addedLinesOf, prepareFiles, clampLine } from "../src/diff.js";

const fixture = readFileSync(new URL("./fixtures/sample.diff", import.meta.url), "utf8");

describe("globToRegex / isIgnored", () => {
  it("matches simple and double-star globs", () => {
    expect(isIgnored("package-lock.json", ["package-lock.json"])).toBe(true);
    expect(isIgnored("dist/index.js", ["dist/*"])).toBe(true);
    expect(isIgnored("src/a.min.js", ["*.min.js"])).toBe(true);
    expect(isIgnored("src/auth.ts", ["*.lock", "dist/*"])).toBe(false);
  });
  it("globToRegex escapes regex chars", () => {
    expect(globToRegex("a+b.ts").test("a+b.ts")).toBe(true);
    expect(globToRegex("a+b.ts").test("aXb.ts")).toBe(false);
  });
});

describe("addedLinesOf", () => {
  it("collects RIGHT-side added lines from hunks", () => {
    const patch =
      "@@ -10,6 +10,11 @@\n context\n+added1\n+added2\n-removed\n context2\n";
    const lines = addedLinesOf(patch);
    expect(lines.has(11)).toBe(true); // added1
    expect(lines.has(12)).toBe(true); // added2
    expect(lines.has(13)).toBe(false); // context2 is not an added line
  });
});

describe("prepareFiles", () => {
  const files = [
    { filename: "src/a.ts", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b\n" },
    { filename: "src/b.ts", status: "removed" },
    { filename: "package-lock.json", status: "modified", patch: "@@ -1 +1 @@\n-x\n+y\n" },
    { filename: "src/big.ts", status: "modified", patch: "x\n".repeat(100) },
    { filename: "src/bin.png", status: "modified" }, // no patch
  ];
  it("skips removed, ignored, binary, and over-cap files", () => {
    const { reviewable, skipped } = prepareFiles(files, {
      maxFiles: 10,
      maxDiffLines: 50,
      ignore: ["package-lock.json"],
    });
    expect(reviewable.map((f) => f.filename)).toEqual(["src/a.ts"]);
    expect(skipped.join(" ")).toContain("src/b.ts");
    expect(skipped.join(" ")).toContain("package-lock.json");
    expect(skipped.join(" ")).toContain("over max-diff-lines");
    expect(skipped.join(" ")).toContain("src/bin.png");
  });
  it("enforces max-files", () => {
    const { reviewable } = prepareFiles(files, {
      maxFiles: 0,
      maxDiffLines: 5000,
      ignore: [],
    });
    expect(reviewable).toHaveLength(0);
  });
});

describe("clampLine", () => {
  it("returns the line when valid, else nearest added line", () => {
    const fp = prepareFiles(
      [{ filename: "a.ts", status: "modified", patch: "@@ -1 +1,3 @@\n+x\n+y\n+z\n" }],
      { maxFiles: 1, maxDiffLines: 100, ignore: [] }
    ).reviewable[0]!;
    expect(clampLine(fp, 2)).toBe(2);
    expect(clampLine(fp, 99)).toBe(3); // clamped to nearest added
  });
});

describe("fixture sanity", () => {
  it("sample.diff contains two files", () => {
    expect(fixture.split("diff --git").length - 1).toBe(2);
  });
});
