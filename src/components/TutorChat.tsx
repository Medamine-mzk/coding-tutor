"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { HintLevel, TutorMessage } from "@/lib/tutor/types";

type Props = {
  exercise?: { id: string; title: string; statement: string; ioSpec: string; constraints: string[]; examples: Array<{ input: string; output: string }>; concepts: string[]; milestones: Array<{ title: string }> };
  code: string;
  lastRunResult?: { stdout?: string; stderr?: string; exitCode?: number; timedOut?: boolean } | null;
  testReport?: { passed: number; failed: number; total: number; results: Array<{ testId: string; passed: boolean; message?: string }> } | null;
  currentMilestoneTitle?: string;
  tests?: Array<{ id: string; input?: string; stdin?: string[]; expected: string; kind: "stdout" | "call"; fnCall?: string; hidden: boolean; category?: string }>;
};

const QUICK_ACTIONS = [
  { key: "stuck" as const, fr: "Je suis bloqué", ar: "أنا عالق", en: "I'm stuck" },
  { key: "explain_error" as const, fr: "Expliquer l'erreur", ar: "اشرح الخطأ", en: "Explain this error" },
  { key: "check_approach" as const, fr: "Vérifier mon approche", ar: "تحقق من مقاربتي", en: "Check my approach" },
  { key: "hint" as const, fr: "Donne un indice", ar: "أعطني تلميحا", en: "Give me a hint" },
];

export function TutorChat({ exercise, code, lastRunResult, testReport, currentMilestoneTitle, tests }: Props) {
  const { locale, t } = useI18n();
  const [messages, setMessages] = useState<TutorMessage[]>(() => [
    {
      id: "welcome",
      role: "tutor",
      content:
        locale === "ar"
          ? "مرحبا! أنا موجهك. لن أعطيك الحل، لكن سأساعدك خطوة بخطوة. ماذا جربت حتى الآن؟"
          : locale === "en"
            ? "Hi! I'm your tutor. I won't give the solution, but I'll guide you step by step. What have you tried so far?"
            : "Salut ! Je suis ton tuteur. Je ne donnerai pas la solution, mais je te guiderai pas à pas. Qu'as-tu déjà essayé ?",
      createdAt: new Date().toISOString(),
      hintLevel: 0,
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [offline, setOffline] = useState(false);
  const [hintLevel, setHintLevel] = useState<HintLevel>(0);
  const listRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef(code);
  const lastRunRef = useRef(lastRunResult);
  const hintHistoryRef = useRef<Array<{ level: HintLevel; at: string }>>([]);
  const lastCodeAtHintRef = useRef<string>("");
  const lastRunAtHintRef = useRef<string>("");

  useEffect(() => { codeRef.current = code; }, [code]);
  useEffect(() => { lastRunRef.current = lastRunResult; }, [lastRunResult]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, streaming]);

  // Derive codeChanged/hasRun for ladder escalation
  function deriveEscalationFlags() {
    const codeChanged = codeRef.current !== lastCodeAtHintRef.current;
    const runKey = JSON.stringify(lastRunRef.current ?? null);
    const hasRun = runKey !== lastRunAtHintRef.current && runKey !== "null";
    return { codeChanged, hasRun };
  }

  async function send(opts: { studentMessage?: string; quickAction?: Props["code"] extends string ? "stuck" | "explain_error" | "check_approach" | "hint" : never; requestedLevel?: HintLevel }) {
    if (streaming) return;
    const studentText = opts.studentMessage ?? (opts.quickAction ? QUICK_ACTIONS.find((q) => q.key === opts.quickAction)?.[locale === "ar" ? "ar" : locale === "en" ? "en" : "fr"] ?? "" : "");
    if (!studentText.trim() && !opts.quickAction) return;

    // Optimistic student bubble
    if (studentText.trim()) {
      setMessages((prev) => [
        ...prev,
        { id: `stu_${Date.now()}`, role: "student", content: studentText, createdAt: new Date().toISOString() },
      ]);
    }
    setInput("");
    setStreaming(true);
    setOffline(false);

    const { codeChanged, hasRun } = deriveEscalationFlags();
    const body = {
      locale,
      exercise,
      code: codeRef.current,
      lastRunResult: lastRunRef.current,
      testReport,
      currentMilestoneTitle,
      hintHistory: hintHistoryRef.current,
      studentMessage: studentText,
      quickAction: opts.quickAction,
      requestedHintLevel: opts.requestedLevel,
      codeChangedSinceLastHint: codeChanged,
      hasRunSinceLastHint: hasRun,
      tests,
    };

    try {
      const res = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok && res.status !== 429) {
        // Try to read body as fallback text
        const text = await res.text().catch(() => "");
        if (text) throw new Error(text);
      }

      if (!res.body) {
        const text = await res.text();
        throw new Error(text);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      // eslint-disable-next-line react-hooks/purity -- id generation for message, not render-pure value
      const tutorId = `tut_${Date.now()}`;
      setMessages((prev) => [...prev, { id: tutorId, role: "tutor", content: "", createdAt: new Date().toISOString(), hintLevel }]);

      const xLevel = res.headers.get("x-hint-level");
      const allowedLevel = xLevel ? (Number(xLevel) as HintLevel) : hintLevel;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;
          try {
            const evt = JSON.parse(jsonStr) as { delta?: string; done?: boolean; hintLevelUsed?: HintLevel };
            if (evt.delta) {
              // eslint-disable-next-line react-hooks/immutability -- acc is local mutable for streaming accumulation
              acc += evt.delta;
              setMessages((prev) => prev.map((m) => (m.id === tutorId ? { ...m, content: acc } : m)));
            }
            if (evt.done) {
              const finalLevel = evt.hintLevelUsed ?? allowedLevel;
              setHintLevel(finalLevel);
              hintHistoryRef.current = [...hintHistoryRef.current, { level: finalLevel, at: new Date().toISOString() }];
              lastCodeAtHintRef.current = codeRef.current;
              lastRunAtHintRef.current = JSON.stringify(lastRunRef.current ?? null);
              setMessages((prev) => prev.map((m) => (m.id === tutorId ? { ...m, hintLevel: finalLevel } : m)));
            }
          } catch {}
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        setOffline(true);
        setMessages((prev) => [
          ...prev,
          {
            id: `off_${Date.now()}`,
            role: "tutor",
            content:
              locale === "ar"
                ? "الموجّه غير متصل. يمكنك المتابعة في كتابة الكود وتشغيل الاختبارات."
                : locale === "en"
                  ? "Tutor offline. You can still code and run tests."
                  : "Tuteur hors ligne. Tu peux continuer à coder et exécuter les tests.",
            createdAt: new Date().toISOString(),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { id: `err_${Date.now()}`, role: "tutor", content: msg.slice(0, 500), createdAt: new Date().toISOString() },
        ]);
      }
    } finally {
      setStreaming(false);
    }
  }

  function handleQuick(action: (typeof QUICK_ACTIONS)[number]["key"]) {
    if (action === "hint") {
      send({ quickAction: action, requestedLevel: Math.min(5, hintLevel + 1) as HintLevel });
    } else {
      send({ quickAction: action });
    }
  }

  return (
    <div className="flex flex-1 flex-col rounded-2xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900" data-testid="tutor-chat">
      <div className="border-b border-black/10 p-3 dark:border-white/10">
        <h2 className="font-semibold">{t("workspace.tutor")}</h2>
        <p className="text-xs text-zinc-500">Socratique d&apos;abord — jamais la solution · Niveau {hintLevel} / 5</p>
        {offline ? <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Hors ligne — tutor offline</p> : null}
      </div>

      <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-auto p-3" style={{ minHeight: 200 }} data-testid="tutor-messages">
        {messages.map((m) => (
          <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6 ${m.role === "student" ? "self-end bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "self-start bg-zinc-50 dark:bg-zinc-800"}`} data-testid={`msg-${m.role}`}>
            <p className="whitespace-pre-wrap break-words">{m.content || (streaming && m.role === "tutor" && m.content === "" ? "…" : m.content)}</p>
            {m.hintLevel !== undefined ? <span className="mt-1 block text-xs text-zinc-500">Hint level {m.hintLevel}</span> : null}
          </div>
        ))}
        {streaming ? <span className="self-start text-xs text-zinc-500">streaming…</span> : null}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-black/10 p-3 dark:border-white/10">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.key}
            onClick={() => handleQuick(a.key)}
            disabled={streaming}
            data-testid={`quick-${a.key}`}
            className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-white/15 dark:bg-zinc-800"
          >
            {a[locale === "ar" ? "ar" : locale === "en" ? "en" : "fr"]}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send({ studentMessage: input });
        }}
        className="flex gap-2 border-t border-black/10 p-3 dark:border-white/10"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={locale === "ar" ? "اكتب رسالتك…" : locale === "en" ? "Type your message…" : "Écris ton message…"}
          className="flex-1 rounded-full border border-black/10 bg-zinc-50 px-4 py-2 text-sm placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-zinc-800"
          disabled={streaming}
          maxLength={1000}
          data-testid="tutor-input"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          data-testid="tutor-send"
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          ➤
        </button>
      </form>
      <p className="px-3 pb-2 text-xs text-zinc-500">Max ~120 mots · Une idée par message · Jamais la solution complète</p>
    </div>
  );
}
