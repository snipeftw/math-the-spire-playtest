import React from "react";

export type CorrelationSliderProps = {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
};

export function CorrelationSlider({
  value,
  onChange,
  min = -1,
  max = 1,
  step = 0.1,
  disabled,
}: CorrelationSliderProps) {
  const v = Number.isFinite(value) ? value : 0;
  const fmt = (n: number) => {
    if (!Number.isFinite(n)) return "0.0";
    // Avoid "-0.0"
    const nn = Math.abs(n) < 1e-9 ? 0 : n;
    return nn.toFixed(1);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>
          r = <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(v)}</span>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          Range {fmt(min)} to {fmt(max)}
        </div>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        disabled={disabled}
        onChange={(e) => {
          const nv = Number(String(e.target.value).replace(",", "."));
          if (Number.isFinite(nv)) onChange(nv);
        }}
        style={{ width: "100%" }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
        <span className="muted">-1 strong negative</span>
        <span className="muted">0 none/weak</span>
        <span className="muted">+1 strong positive</span>
      </div>
    </div>
  );
}
