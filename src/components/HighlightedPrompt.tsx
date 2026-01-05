import React from "react";

// Highlight key math/stat vocabulary in question prompts.
// UI-only: does not affect grading or logging.

// Phrases are matched case-insensitively.
// For multi-word phrases we allow spaces or hyphens between words.
const KEY_PHRASES: string[] = [
  // Measures of center/spread
  "mean",
  "average",
  "median",
  "mode",
  "range",
  "interquartile range",
  "interquartile-range",
  "iqr",
  "quartile",
  "q1",
  "q3",
  "five-number summary",
  "five number summary",
  "minimum",
  "maximum",

  // Box plots
  "box plot",
  "boxplot",
  "whisker",

  // Scatter/correlation/regression
  "scatter plot",
  "scatterplot",
  "correlation",
  "regression",
  "residual",
  "line of best fit",
  "best-fit line",
  "slope",
  "intercept",
  "correlation coefficient",
  "r-value",
  "r value",

  // Extrapolation / interpolation
  "interpolation",
  "interpolate",
  "extrapolation",
  "extrapolate",

  // Variables
  "independent variable",
  "dependent variable",

  // Media/data misuse unit
  "outlier",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeKeywordRegex(): RegExp {
  // Sort longest-first so multi-word phrases win over single words.
  const parts = [...KEY_PHRASES]
    .sort((a, b) => b.length - a.length)
    .map((phrase) => {
      // Allow any combination of spaces/hyphens between words.
      const words = phrase.trim().split(/\s+/g).map(escapeRegExp);
      const body = words.join("[-\\s]+");
      // Word boundaries keep us from matching inside other words (e.g., mean in meaning).
      return `\\b${body}\\b`;
    });

  return new RegExp(parts.join("|"), "gi");
}

const KEYWORD_RE = makeKeywordRegex();

export function renderPromptWithHighlights(text: string): React.ReactNode {
  const s = String(text ?? "");
  if (!s) return s;

  // Reset global regex state
  KEYWORD_RE.lastIndex = 0;

  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;

  while ((m = KEYWORD_RE.exec(s)) !== null) {
    const idx = m.index;
    const match = m[0];
    if (idx > last) out.push(s.slice(last, idx));
    out.push(
      <span
        key={`kw_${k++}_${idx}`}
        style={{ fontWeight: 800, color: "#22c55e" }}
      >
        {match}
      </span>
    );
    last = idx + match.length;
  }

  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function HighlightedPrompt(props: { text: string; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={props.className}
      style={{ whiteSpace: "pre-wrap", ...(props.style ?? {}) }}
    >
      {renderPromptWithHighlights(props.text)}
    </div>
  );
}
