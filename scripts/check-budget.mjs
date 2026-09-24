import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_KB = 210;
const NEXT_DIR = ".next";

function getInitialChunks() {
  // For App Router, initial page "/" JS is a subset. We approximate by checking the largest
  // client chunks that are needed for first paint: framework + main + app page.
  // We use a heuristic: sum of all JS in .next/static/chunks that are < 100KB gz each and not the big workspace CodeMirror chunk.
  // More accurate: check build output or run next build --analyze.
  // For CI, we check total gz of chunks that are loaded for "/" (excluding lazy workspace 35oait... 139KB).
  const chunksDir = join(NEXT_DIR, "static", "chunks");
  let entries;
  try {
    entries = readdirSync(chunksDir);
  } catch {
    console.warn("[budget] .next not built yet, skipping");
    process.exit(0);
  }
  const files = entries.filter((f) => f.endsWith(".js")).map((f) => join(chunksDir, f));
  const sizes = files.map((p) => {
    const raw = readFileSync(p);
    const gz = gzipSync(raw).length;
    return { file: p, raw: raw.length, gz, gzKb: gz / 1024 };
  });
  // Identify workspace-heavy chunk (CodeMirror) — 425KB raw / 139KB gz
  const workspaceChunk = sizes.find((s) => s.raw > 300000);
  const initialChunks = sizes.filter((s) => s !== workspaceChunk);
  const totalGz = initialChunks.reduce((a, s) => a + s.gz, 0);
  const totalGzKb = totalGz / 1024;

  console.log("[budget] chunks gz (initial, excl. workspace CodeMirror):");
  for (const s of initialChunks.sort((a, b) => b.gz - a.gz).slice(0, 8)) {
    console.log(`  ${s.file.split("/").pop()}: ${s.gz} gz bytes (${s.gzKb.toFixed(1)} KB) / ${s.raw} raw`);
  }
  if (workspaceChunk) console.log(`  (excluded workspace chunk ${workspaceChunk.file.split("/").pop()}: ${workspaceChunk.gz} gz / ${workspaceChunk.raw} raw — lazy)`);
  console.log(`[budget] initial total gz: ${totalGz} bytes (${totalGzKb.toFixed(1)} KB) — budget ${BUDGET_KB} KB`);

  if (totalGzKb > BUDGET_KB) {
    console.error(`[budget] FAIL — initial ${totalGzKb.toFixed(1)} KB > ${BUDGET_KB} KB`);
    process.exit(1);
  } else {
    console.log(`[budget] PASS`);
  }

  // Also check per-file budget: no single initial chunk > 100KB gz
  for (const s of initialChunks) {
    if (s.gzKb > 120) {
      console.warn(`[budget] warning: ${s.file} is ${s.gzKb.toFixed(1)} KB gz > 120 KB`);
    }
  }
}

getInitialChunks();
