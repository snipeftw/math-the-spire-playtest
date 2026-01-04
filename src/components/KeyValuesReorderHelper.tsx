// src/components/KeyValuesReorderHelper.tsx
import React, { useMemo } from "react";
import { NumberReorderHelper } from "./NumberReorderHelper";

type Props = {
  values: number[];
  seed: string;
  label?: string;
};

function hash32(str: string): number {
  // simple deterministic 32-bit hash
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffleDeterministic(values: number[], seed: string): number[] {
  const out = values.slice();
  let s = hash32(seed || "seed");
  // Fisher-Yates with a tiny LCG
  function next() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export function KeyValuesReorderHelper(props: Props) {
  const shuffled = useMemo(() => {
    const clean = (props.values ?? []).map((n) => Number(n)).filter((n) => Number.isFinite(n));
    return shuffleDeterministic(clean, String(props.seed ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [String(props.seed ?? ""), JSON.stringify(props.values ?? [])]);

  if (!shuffled.length) return null;
  return <NumberReorderHelper values={shuffled} label={props.label} />;
}
