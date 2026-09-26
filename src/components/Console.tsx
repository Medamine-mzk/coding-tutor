"use client";

import { useEffect, useRef, useState } from "react";

type ConsoleProps = {
  stdout: string;
  stderr: string;
  awaitingInput?: boolean;
  inputPrompt?: string;
  onSubmitInput?: (value: string) => void;
};

export function Console({ stdout, stderr, awaitingInput, inputPrompt, onSubmitInput }: ConsoleProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [stdout, stderr, awaitingInput]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input && input !== "") return;
    onSubmitInput?.(input);
    setInput("");
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-black/10 bg-zinc-950 text-zinc-100 dark:border-white/10" role="region" aria-label="Console output">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs">
        <span className="font-medium">Console</span>
        <span className="text-zinc-400">stdin / stdout / stderr</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto p-3 font-mono text-sm leading-6" role="log" aria-live="polite" aria-label="Program output" tabIndex={0}>
        {stdout ? (
          <pre className="whitespace-pre-wrap break-words text-emerald-300" data-testid="console-stdout">{stdout}</pre>
        ) : null}
        {stderr ? (
          <pre className="whitespace-pre-wrap break-words text-red-400" data-testid="console-stderr">{stderr}</pre>
        ) : null}
        {!stdout && !stderr && !awaitingInput ? (
          <span className="text-zinc-600">No output yet. Press Run.</span>
        ) : null}
        {awaitingInput ? (
          <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-2">
            <span className="shrink-0 text-amber-300">{inputPrompt ?? "input():"}</span>
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type input and press Enter"
              className="flex-1 rounded border border-white/20 bg-zinc-900 px-2 py-1 text-sm text-white placeholder:text-zinc-400 focus:border-white/40 focus:outline-none"
              data-testid="console-input"
            />
            <button type="submit" className="rounded bg-white px-3 py-1 text-xs font-medium text-zinc-900 hover:bg-zinc-100">
              Send
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
