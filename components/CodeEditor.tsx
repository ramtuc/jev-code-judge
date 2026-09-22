"use client";

import Editor from "@monaco-editor/react";

type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

export function CodeEditor({ value, onChange }: CodeEditorProps) {
  return (
    <Editor
      height="100%"
      language="typescript"
      theme="vs-dark"
      value={value}
      onChange={(nextValue) => onChange(nextValue ?? "")}
      options={{
        minimap: { enabled: false },
        fontFamily: "var(--font-mono)",
        fontSize: 13,
        lineHeight: 22,
        lineNumbersMinChars: 3,
        padding: { top: 18, bottom: 18 },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        wordWrap: "on",
        automaticLayout: true,
        renderLineHighlight: "line",
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
      }}
    />
  );
}
