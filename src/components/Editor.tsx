"use client";

import { useEffect, useRef } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { oneDark } from "@codemirror/theme-one-dark";

type EditorProps = {
  value: string;
  onChange: (v: string) => void;
  onLargePaste?: (text: string) => void;
  theme?: "light" | "dark";
  readOnly?: boolean;
  fontSize?: number;
  placeholder?: string;
};

function largePasteThreshold(text: string): boolean {
  const lines = text.split("\n").length;
  return text.length > 2000 || lines > 15;
}

export function Editor({ value, onChange, onLargePaste, theme = "light", readOnly = false, fontSize = 14, placeholder }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onLargePasteRef = useRef(onLargePaste);
  const themeCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());
  const fontSizeCompartment = useRef(new Compartment());

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onLargePasteRef.current = onLargePaste; }, [onLargePaste]);

  // Initialize editor once
  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;

    const pasteHandler = EditorView.domEventHandlers({
      paste(event) {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (largePasteThreshold(text) && onLargePasteRef.current) {
          queueMicrotask(() => onLargePasteRef.current?.(text));
        }
        return false;
      },
    });

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const darkTheme = theme === "dark" ? oneDark : [];
    const lightTheme = EditorView.theme({
      "&": { backgroundColor: "white" },
      ".cm-content": { caretColor: "#18181b" },
      ".cm-cursor": { borderLeftColor: "#18181b" },
      ".cm-gutters": { backgroundColor: "#fafafa", color: "#71717a", borderRight: "1px solid #e4e4e7" },
      ".cm-activeLineGutter": { backgroundColor: "#f4f4f5" },
      ".cm-activeLine": { backgroundColor: "#fafafa" },
    });

    const fontSizeTheme = EditorView.theme({
      "&": { fontSize: `${fontSize}px` },
      ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
    });

    // placeholder handled via container title; codemirror placeholder extension kept minimal
    void placeholder;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        bracketMatching(),
        history(),
        autocompletion(),
        python(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap, indentWithTab]),
        pasteHandler,
        updateListener,
        themeCompartment.current.of(theme === "dark" ? darkTheme : lightTheme),
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
        fontSizeCompartment.current.of(fontSizeTheme),
        EditorView.lineWrapping,
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": { overflow: "auto" },
          ".cm-content": { padding: "12px 0" },
        }),
        // Avoid next.js hydration mismatch for editor
        ...(placeholder ? [] : []),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (when not focused or programmatic)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  // Theme switching
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const ext = theme === "dark" ? oneDark : EditorView.theme({
      "&": { backgroundColor: "white" },
      ".cm-content": { caretColor: "#18181b" },
      ".cm-cursor": { borderLeftColor: "#18181b" },
      ".cm-gutters": { backgroundColor: "#fafafa", color: "#71717a", borderRight: "1px solid #e4e4e7" },
      ".cm-activeLineGutter": { backgroundColor: "#f4f4f5" },
      ".cm-activeLine": { backgroundColor: "#fafafa" },
    });
    view.dispatch({ effects: themeCompartment.current.reconfigure(ext) });
  }, [theme]);

  // ReadOnly toggle
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(readOnly)) });
  }, [readOnly]);

  // Font size
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const ext = EditorView.theme({
      "&": { fontSize: `${fontSize}px` },
      ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
    });
    view.dispatch({ effects: fontSizeCompartment.current.reconfigure(ext) });
  }, [fontSize]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900"
      aria-label="Code editor"
      data-testid="code-editor"
      style={{ minHeight: 240 }}
    />
  );
}
