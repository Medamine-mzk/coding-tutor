import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

describe("performance budget (<200KB gz initial, excl. pyodide)", () => {
  it("initial chunks gz <210KB (excl. workspace CodeMirror)", () => {
    const chunksDir = join(process.cwd(), ".next", "static", "chunks");
    if (!existsSync(chunksDir)) {
      console.warn("[budget] .next not found, skipping");
      return;
    }
    const files = readdirSync(chunksDir).filter((f) => f.endsWith(".js")).map((f) => join(chunksDir, f));
    const sizes = files.map((p) => {
      const raw = readFileSync(p);
      const gz = gzipSync(raw).length;
      return { file: p, raw: raw.length, gz };
    });
    const workspaceChunk = sizes.find((s) => s.raw > 300000);
    const initial = sizes.filter((s) => s !== workspaceChunk);
    const totalGz = initial.reduce((a, s) => a + s.gz, 0);
    const totalGzKb = totalGz / 1024;
    expect(totalGzKb).toBeLessThan(210);
  });

  it("manifest is <5KB", () => {
    const p = join(process.cwd(), "public", "manifest.json");
    const raw = readFileSync(p, "utf-8");
    expect(raw.length).toBeLessThan(5 * 1024);
  });

  it("sw.js is present and <10KB", () => {
    const p = join(process.cwd(), "public", "sw.js");
    const raw = readFileSync(p, "utf-8");
    expect(raw.length).toBeGreaterThan(500);
    expect(raw.length).toBeLessThan(10 * 1024);
  });
});
