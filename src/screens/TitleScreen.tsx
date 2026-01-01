// src/screens/TitleScreen.tsx
import React, { useState } from "react";

export function TitleScreen(props: {
  onStart: (seed?: number) => void;
  onResumeFromCode: (code: string) => string | null;
}) {
  const [seedText, setSeedText] = useState("");
  const [codeText, setCodeText] = useState("");
  const [resumeErr, setResumeErr] = useState<string | null>(null);

  return (
    <div style={styles.wrap}>
      <h1 style={styles.h1}>Math Roguelike (Framework)</h1>
      <p style={styles.p}>
        Start a run. Leave seed blank for random. Seed makes maps/questions repeatable.
      </p>

      <div style={styles.row}>
        <input
          value={seedText}
          onChange={(e) => setSeedText(e.target.value)}
          placeholder="Seed (optional)"
          style={styles.input}
        />
        <button
          style={styles.btn}
          onClick={() => {
            const n = seedText.trim() === "" ? undefined : Number(seedText);
            props.onStart(Number.isFinite(n as number) ? (n as number) : undefined);
          }}
        >
          Start Run
        </button>
      </div>

      <hr style={styles.sep} />

      <h2 style={styles.h2}>Resume Run (Code)</h2>
      <p style={styles.p}>
        If you copied a run code from another device, paste it here to continue where you left off.
      </p>

      <textarea
        value={codeText}
        onChange={(e) => {
          setCodeText(e.target.value);
          setResumeErr(null);
        }}
        placeholder="Paste run code here…"
        style={styles.textarea}
        rows={4}
      />

      {resumeErr ? (
        <div style={styles.err}>{resumeErr}</div>
      ) : null}

      <div style={styles.row}>
        <button
          style={styles.btn}
          onClick={() => {
            const err = props.onResumeFromCode(codeText);
            setResumeErr(err);
          }}
        >
          Resume Run
        </button>

        <button
          style={styles.btn}
          onClick={() => {
            setCodeText("");
            setResumeErr(null);
          }}
          title="Clear"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 900, margin: "40px auto", padding: 16, fontFamily: "system-ui" },
  h1: { margin: 0, fontSize: 32 },
  h2: { margin: "18px 0 6px", fontSize: 18 },
  p: { opacity: 0.85, lineHeight: 1.4 },
  row: { display: "flex", gap: 8, marginTop: 12 },
  input: { flex: 1, padding: 10, fontSize: 16 },
  btn: { padding: "10px 14px", fontSize: 16, cursor: "pointer" },
  textarea: { width: "100%", padding: 10, fontSize: 13, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" },
  err: { marginTop: 10, padding: 10, border: "1px solid rgba(255,0,0,0.35)", background: "rgba(255,0,0,0.08)", borderRadius: 10, color: "#ff6b6b" },
  sep: { margin: "18px 0", opacity: 0.2 },
};
