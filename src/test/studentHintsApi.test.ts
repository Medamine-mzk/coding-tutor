import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as joinPOST } from "@/app/api/student/join/route";
import { POST as hintsPOST } from "@/app/api/student/hints/route";
import { createTeacherExercise, clearTeacherStores } from "@/lib/teacher/store";
import { getSession, clearSessionStore } from "@/lib/session/store";
import { isDbEnabled } from "@/lib/db/supabase";

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("student hints API — comment-based progression", () => {
  beforeEach(() => {
    clearTeacherStores();
    clearSessionStore();
  });

  it("falls back to memory stores without Supabase env", () => {
    expect(isDbEnabled()).toBe(false);
  });

  it("join → hint L1 → hint L2, progression tracked in session", async () => {
    const ex = await createTeacherExercise({
      teacher_id: "t_test",
      title: "Somme",
      statement: "Lire deux entiers et afficher leur somme.",
      concepts: ["loops"],
      difficulty: 2,
      examples: [{ input: "2\n3", output: "5" }],
      visibility: "code_only",
      created_via: "manual",
      reference_solution: "a = int(input())\nb = int(input())\nprint(a + b)",
    });

    const joinRes = await joinPOST(makeReq({ code: ex.code, display_name: "Yasmine" }));
    expect(joinRes.status).toBe(200);
    const joined = (await joinRes.json()) as { join_token: string; session: { id: string } };
    expect(joined.join_token).toBeTruthy();

    // First hint: pair 0, level 1 = comment only (no code leak)
    const h1Res = await hintsPOST(makeReq({ join_token: joined.join_token }));
    expect(h1Res.status).toBe(200);
    const h1 = (await h1Res.json()) as { pairIndex: number; level: number; totalPairs: number; revealedCount: number; text: string };
    expect(h1.pairIndex).toBe(0);
    expect(h1.level).toBe(1);
    expect(h1.totalPairs).toBeGreaterThan(0);
    expect(h1.revealedCount).toBe(1);
    expect(h1.text).toContain("#");
    expect(h1.text).not.toContain("int(input())");

    // Second hint: same pair, level 2 (progressive reveal)
    const h2Res = await hintsPOST(makeReq({ join_token: joined.join_token }));
    const h2 = (await h2Res.json()) as typeof h1;
    expect(h2.pairIndex).toBe(0);
    expect(h2.level).toBe(2);
    expect(h2.revealedCount).toBe(1);

    // Session persists the revealed pair (progression visible par prof)
    const sess = await getSession(joined.session.id);
    expect(sess?.revealedHints).toEqual([{ pair: 0, level: 2 }]);
  });

  it("levels 4-5 require a run (hasRun gate)", async () => {
    const ex = await createTeacherExercise({
      teacher_id: "t_test",
      title: "Somme",
      statement: "Lire deux entiers et afficher leur somme.",
      concepts: ["loops"],
      difficulty: 2,
      examples: [{ input: "2\n3", output: "5" }],
      visibility: "code_only",
      created_via: "manual",
      reference_solution: "a = int(input())\nb = int(input())\nprint(a + b)",
    });
    const joined = (await (await joinPOST(makeReq({ code: ex.code, display_name: "Yasmine" }))).json()) as { join_token: string };
    // Walk to level 3 without running
    await hintsPOST(makeReq({ join_token: joined.join_token }));
    await hintsPOST(makeReq({ join_token: joined.join_token }));
    await hintsPOST(makeReq({ join_token: joined.join_token }));
    // 4th request without hasRun stays capped at 3
    const capped = (await (await hintsPOST(makeReq({ join_token: joined.join_token }))).json()) as { level: number; capped: boolean };
    expect(capped.level).toBe(3);
    expect(capped.capped).toBe(true);
    // With hasRun, level 4 unlocks
    const unlocked = (await (await hintsPOST(makeReq({ join_token: joined.join_token, hasRun: true }))).json()) as { level: number };
    expect(unlocked.level).toBe(4);
  });

  it("rejects unknown join_token", async () => {
    const res = await hintsPOST(makeReq({ join_token: "nope" }));
    expect(res.status).toBe(404);
  });

  it("smart skip: lines already in student code are auto-marked done", async () => {
    const ex = await createTeacherExercise({
      teacher_id: "t_test",
      title: "Somme tableau",
      statement: "Lire n puis n entiers, afficher la somme.",
      concepts: ["arrays"],
      difficulty: 2,
      examples: [{ input: "2\n1\n2", output: "3" }],
      visibility: "code_only",
      created_via: "manual",
      reference_solution: "from numpy import array\nn = int(input())\nprint(n)",
    });
    const joined = (await (await joinPOST(makeReq({ code: ex.code, display_name: "Yasmine" }))).json()) as { join_token: string; session: { id: string } };

    // L'élève a déjà écrit l'import → la paire 0 est skippée, on reçoit la paire 1
    const hRes = await hintsPOST(makeReq({ join_token: joined.join_token, code: "from numpy import array\n" }));
    expect(hRes.status).toBe(200);
    const h = (await hRes.json()) as { pairIndex: number; level: number; skippedPairs: number[]; text: string };
    expect(h.skippedPairs).toContain(0);
    expect(h.pairIndex).toBe(1);
    expect(h.level).toBe(1);

    // Session : paire 0 marquée terminée + paire 1 révélée niveau 1
    const sess = await getSession(joined.session.id);
    const p0 = sess?.revealedHints?.find((r) => r.pair === 0);
    expect(p0?.level).toBe(5);
  });

  it("no skip when student code is empty or unrelated", async () => {
    const ex = await createTeacherExercise({
      teacher_id: "t_test",
      title: "Somme",
      statement: "Lire deux entiers et afficher leur somme.",
      concepts: ["loops"],
      difficulty: 2,
      examples: [{ input: "2\n3", output: "5" }],
      visibility: "code_only",
      created_via: "manual",
      reference_solution: "a = int(input())\nb = int(input())\nprint(a + b)",
    });
    const joined = (await (await joinPOST(makeReq({ code: ex.code, display_name: "Yasmine" }))).json()) as { join_token: string };
    const h = (await (await hintsPOST(makeReq({ join_token: joined.join_token, code: "# juste un commentaire\nx = 1" }))).json()) as { pairIndex: number; level: number; skippedPairs: number[] };
    expect(h.pairIndex).toBe(0);
    expect(h.level).toBe(1);
    expect(h.skippedPairs).toEqual([]);
  });
});
