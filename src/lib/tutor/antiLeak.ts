import type { HintLevel } from "./types";
import type { TestCase } from "@/lib/exercise/types";
import { runPythonWithStdin } from "@/lib/exercise/runPython";

export const MAX_CODE_BLOCK_LINES = 6;

export type LeakCheckResult = {
  isLeak: boolean;
  reason?: string;
  offendingBlock?: string;
};

const CODE_BLOCK_RE = /```(?:python)?\s*\n?([\s\S]*?)```/g;

export function extractCodeBlocks(text: string): string[] {
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  CODE_BLOCK_RE.lastIndex = 0;
  while ((m = CODE_BLOCK_RE.exec(text)) !== null) {
    blocks.push(m[1]);
  }
  return blocks;
}

export function countNonEmptyLines(code: string): number {
  return code
    .split("\n")
    .filter((l) => l.trim().length > 0).length;
}

export function isOverlongAtLevel(text: string, hintLevel: HintLevel): LeakCheckResult {
  // At levels <5, reject any fenced code block > MAX lines
  if (hintLevel >= 5) return { isLeak: false };
  const blocks = extractCodeBlocks(text);
  for (const block of blocks) {
    const lines = countNonEmptyLines(block);
    if (lines > MAX_CODE_BLOCK_LINES) {
      return {
        isLeak: true,
        reason: `overlong code block (${lines} lines > ${MAX_CODE_BLOCK_LINES} allowed at level ${hintLevel})`,
        offendingBlock: block,
      };
    }
  }
  return { isLeak: false };
}

function looksLikeSkeleton(code: string): boolean {
  return /#\s*TODO|TODO|fill the blank|à compléter|اكمل/i.test(code);
}

function looksLikeSolution(code: string): boolean {
  // Heuristic: contains print + input handling + loop or solve definition without TODO
  const hasPrint = /print\s*\(/.test(code);
  const hasInput = /input\s*\(/.test(code) || /sys\.stdin/.test(code);
  const hasLogic = /for\s|while\s|def\s|if\s|return/.test(code);
  const isSkeleton = looksLikeSkeleton(code);
  return hasPrint && (hasInput || hasLogic) && !isSkeleton;
}

export async function wouldPassAllTests(
  tutorBlocks: string[],
  studentCode: string,
  tests: TestCase[],
  opts: { timeoutMs?: number } = {}
): Promise<boolean> {
  if (tutorBlocks.length === 0) return false;
  if (tests.length === 0) return false;

  const timeoutMs = opts.timeoutMs ?? 2000;

  // Try each block individually and combined with student code
  const candidates: string[] = [];
  // Candidate 1: tutor blocks alone (if it's a full program)
  candidates.push(tutorBlocks.join("\n"));
  // Candidate 2: student code + tutor blocks
  candidates.push([studentCode, ...tutorBlocks].join("\n"));
  // Candidate 3: tutor blocks + student code (in case student code is after)
  candidates.push([...tutorBlocks, studentCode].join("\n"));

  for (const candidate of candidates) {
    // Skip skeletons — they won't pass, not a leak by this check
    if (looksLikeSkeleton(candidate)) continue;
    // Must look like a solution to be worth running
    if (!looksLikeSolution(candidate) && candidate.split("\n").length < 4) continue;

    let allPassed = true;
    for (const tc of tests) {
      const stdin = tc.stdin ?? (tc.input ? tc.input.split(/[ \n]+/).filter(Boolean) : []);
      let result: { stdout: string; stderr: string; exitCode: number; timedOut: boolean };
      if (tc.kind === "call" && tc.fnCall) {
        const harness = `${candidate}\n\n__result = ${tc.fnCall}\nprint(__result)\n`;
        result = await runPythonWithStdin(harness, stdin, timeoutMs);
        if (result.timedOut || result.exitCode !== 0) {
          allPassed = false;
          break;
        }
        const actual = result.stdout.trim();
        const expected = tc.expected.trim();
        if (actual !== expected) {
          allPassed = false;
          break;
        }
      } else {
        result = await runPythonWithStdin(candidate, stdin, timeoutMs);
        if (result.timedOut || result.exitCode !== 0) {
          allPassed = false;
          break;
        }
        const actual = result.stdout.trimEnd();
        const expected = tc.expected.trimEnd();
        if (actual !== expected && actual.trim() !== expected.trim()) {
          allPassed = false;
          break;
        }
      }
    }
    if (allPassed) return true;
  }
  return false;
}

export function similarityToReference(tutorText: string, referenceCode: string): number {
  // Simple token overlap: if tutor code shares >60% of reference's non-trivial lines, likely leak
  if (!referenceCode) return 0;
  const refLines = referenceCode.split("\n").map((l) => l.trim()).filter((l) => l.length > 3 && !l.startsWith("#"));
  const tutorBlocks = extractCodeBlocks(tutorText).join("\n");
  if (!tutorBlocks) return 0;
  const tutorLines = tutorBlocks.split("\n").map((l) => l.trim()).filter((l) => l.length > 3);
  if (refLines.length === 0 || tutorLines.length === 0) return 0;
  let overlap = 0;
  for (const line of tutorLines) {
    if (refLines.includes(line)) overlap++;
  }
  return overlap / Math.max(refLines.length, 1);
}

export async function checkForLeak(
  text: string,
  opts: {
    hintLevel: HintLevel;
    studentCode: string;
    tests: TestCase[];
    referenceCode?: string;
  }
): Promise<LeakCheckResult> {
  // 1. Overlong check
  const overlong = isOverlongAtLevel(text, opts.hintLevel);
  if (overlong.isLeak) return overlong;

  // 2. Would-pass check (most sensitive) — run candidate through tests
  const blocks = extractCodeBlocks(text);
  if (blocks.length > 0 && opts.tests.length > 0) {
    const wouldPass = await wouldPassAllTests(blocks, opts.studentCode, opts.tests);
    if (wouldPass) {
      return {
        isLeak: true,
        reason: "would-pass: tutor code plus student code would pass all tests",
        offendingBlock: blocks.join("\n---\n"),
      };
    }
  }

  // 3. Similarity fallback vs reference
  if (opts.referenceCode) {
    const sim = similarityToReference(text, opts.referenceCode);
    if (sim > 0.6) {
      return {
        isLeak: true,
        reason: `high similarity to reference (${Math.round(sim * 100)}% lines overlap)`,
        offendingBlock: extractCodeBlocks(text).join("\n"),
      };
    }
  }

  // 4. Contains hidden test reveal?
  if (/hidden test/i.test(text) && /expected/i.test(text)) {
    return { isLeak: true, reason: "reveals hidden test expected output" };
  }

  return { isLeak: false };
}

const blockedLog: Array<{ at: string; reason: string; hintLevel: HintLevel; snippet: string }> = [];

export function logBlockedLeak(entry: { reason: string; hintLevel: HintLevel; snippet: string }) {
  const record = { at: new Date().toISOString(), ...entry };
  blockedLog.push(record);
  console.warn(`[anti-leak] blocked at level ${entry.hintLevel}: ${entry.reason} — snippet: ${entry.snippet.slice(0, 120)}`);
  // Keep log bounded
  if (blockedLog.length > 200) blockedLog.shift();
}

export function getBlockedLog() {
  return [...blockedLog];
}

export function clearBlockedLog() {
  blockedLog.length = 0;
}
