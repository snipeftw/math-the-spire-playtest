// src/components/BoxPlotBuilder.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

type Summary = { min: number; q1: number; median: number; q3: number; max: number };

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function fmt(n: number) {
  if (!Number.isFinite(n)) return "";
  // Show halves cleanly, otherwise show up to 2 decimals (rare)
  const isHalf = Math.abs(n * 2 - Math.round(n * 2)) < 1e-9;
  if (isHalf) {
    const rounded = Math.round(n * 2) / 2;
    return String(rounded);
  }
  const r = Math.round(n * 100) / 100;
  return String(r);
}

function snapToStep(n: number, step: number) {
  if (!Number.isFinite(step) || step <= 0) return n;
  return Math.round(n / step) * step;
}

export function defaultBuildStart(axisMin: number, axisMax: number): Summary {
  const span = Math.max(1e-9, axisMax - axisMin);
  const min = axisMin + span * 0.12;
  const q1 = axisMin + span * 0.32;
  const median = axisMin + span * 0.5;
  const q3 = axisMin + span * 0.68;
  const max = axisMin + span * 0.88;
  return { min, q1, median, q3, max };
}

export function BoxPlotBuilder(props: {
  axisMin: number;
  axisMax: number;
  tickStep: number;
  value: Summary;
  onChange: (next: Summary) => void;
}) {
  const { axisMin, axisMax, tickStep, value, onChange } = props;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragKey, setDragKey] = useState<null | keyof Summary>(null);

  const ticks = useMemo(() => {
    const out: number[] = [];
    const step = Number.isFinite(tickStep) && tickStep > 0 ? tickStep : 1;
    const start = Math.ceil(axisMin / step) * step;
    const end = axisMax;
    for (let v = start; v <= end + step / 2; v += step) out.push(Math.round(v * 1000) / 1000);
    // If there are too many labels, show every other label.
    if (out.length > 22) {
      return out.filter((_, i) => i % 2 === 0);
    }
    return out;
  }, [axisMin, axisMax, tickStep]);

  const px = (v: number) => {
    const span = Math.max(1e-9, axisMax - axisMin);
    const t = (v - axisMin) / span;
    return clamp(t, 0, 1) * 100;
  };

  const applyOrdered = (k: keyof Summary, raw: number) => {
    const step = Number.isFinite(tickStep) && tickStep > 0 ? tickStep : 1;
    let v = snapToStep(raw, step);
    v = clamp(v, axisMin, axisMax);

    // Enforce ordering: min <= q1 <= median <= q3 <= max
    const cur = { ...value };
    if (k === "min") v = clamp(v, axisMin, cur.q1);
    if (k === "q1") v = clamp(v, cur.min, cur.median);
    if (k === "median") v = clamp(v, cur.q1, cur.q3);
    if (k === "q3") v = clamp(v, cur.median, cur.max);
    if (k === "max") v = clamp(v, cur.q3, axisMax);

    const next: Summary = { ...cur, [k]: v } as any;
    onChange(next);
  };

  const clientXToValue = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return axisMin;
    const r = el.getBoundingClientRect();
    const x = clamp(clientX - r.left, 0, r.width);
    const t = r.width <= 0 ? 0 : x / r.width;
    return axisMin + t * (axisMax - axisMin);
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragKey) return;
      applyOrdered(dragKey, clientXToValue(e.clientX));
    };
    const onUp = () => setDragKey(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragKey, axisMin, axisMax, tickStep, value]);

  const Handle = (p: { k: keyof Summary; label: string }) => {
    const v = value[p.k];
    const leftPct = px(v);
    return (
      <div
        role="button"
        tabIndex={0}
        title={`${p.label}: ${fmt(v)}`}
        onPointerDown={(e) => {
          e.preventDefault();
          setDragKey(p.k);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setDragKey(p.k);
          }
        }}
        style={{
          position: "absolute",
          left: `${leftPct}%`,
          top: 0,
          transform: "translate(-50%, -65%)",
          cursor: "grab",
          userSelect: "none",
          zIndex: 3,
        }}
      >
        <div
          style={{
            padding: "2px 6px",
            borderRadius: 10,
            fontSize: 11,
            border: "1px solid rgba(255,255,255,0.35)",
            background: "rgba(20,20,20,0.95)",
            color: "rgba(255,255,255,0.9)",
            marginBottom: 3,
            textAlign: "center",
            whiteSpace: "nowrap",
            boxShadow: "0 4px 10px rgba(0,0,0,0.35)",
          }}
        >
          {p.label}
        </div>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 999,
            border: "2px solid rgba(255,255,255,0.75)",
            background: "rgba(255,255,255,0.12)",
            boxShadow: "0 6px 14px rgba(0,0,0,0.4)",
          }}
        />
      </div>
    );
  };

  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginTop: 6 }}>
        <div
          ref={trackRef}
          style={{
            position: "relative",
            width: "100%",
            height: 76,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(10,10,10,0.45)",
            overflow: "hidden",
          }}
        >
          {/* Axis + ticks */}
          <div
            style={{
              position: "absolute",
              left: 14,
              right: 14,
              top: 42,
              height: 2,
              background: "rgba(255,255,255,0.35)",
              borderRadius: 2,
            }}
          />

          {ticks.map((t, i) => {
            const left = px(t);
            return (
              <div
                key={`${t}-${i}`}
                style={{
                  position: "absolute",
                  left: `${left}%`,
                  top: 38,
                  transform: "translateX(-50%)",
                  textAlign: "center",
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              >
                <div style={{ width: 1, height: 8, background: "rgba(255,255,255,0.35)", margin: "0 auto" }} />
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", marginTop: 2, whiteSpace: "nowrap" }}>{fmt(t)}</div>
              </div>
            );
          })}

          {/* Current boxplot (based on builder values) */}
          <div
            style={{
              position: "absolute",
              left: 14,
              right: 14,
              top: 20,
              height: 22,
              pointerEvents: "none",
              zIndex: 2,
            }}
          >
            {/* Whiskers */}
            <div
              style={{
                position: "absolute",
                left: `${px(value.min)}%`,
                width: `${Math.max(0, px(value.q1) - px(value.min))}%`,
                top: 10,
                height: 2,
                background: "rgba(255,255,255,0.55)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: `${px(value.q3)}%`,
                width: `${Math.max(0, px(value.max) - px(value.q3))}%`,
                top: 10,
                height: 2,
                background: "rgba(255,255,255,0.55)",
              }}
            />
            {/* Whisker caps */}
            {["min", "max"].map((k) => {
              const v = (value as any)[k] as number;
              return (
                <div
                  key={k}
                  style={{
                    position: "absolute",
                    left: `${px(v)}%`,
                    top: 6,
                    transform: "translateX(-50%)",
                    width: 2,
                    height: 10,
                    background: "rgba(255,255,255,0.55)",
                  }}
                />
              );
            })}
            {/* Box */}
            <div
              style={{
                position: "absolute",
                left: `${px(value.q1)}%`,
                width: `${Math.max(0, px(value.q3) - px(value.q1))}%`,
                top: 3,
                height: 14,
                border: "2px solid rgba(255,255,255,0.65)",
                borderRadius: 6,
                background: "rgba(255,255,255,0.06)",
              }}
            />
            {/* Median */}
            <div
              style={{
                position: "absolute",
                left: `${px(value.median)}%`,
                top: 3,
                transform: "translateX(-50%)",
                width: 2,
                height: 14,
                background: "rgba(255,255,255,0.85)",
              }}
            />
          </div>

          {/* Drag handles */}
          <Handle k="min" label="Min" />
          <Handle k="q1" label="Q1" />
          <Handle k="median" label="Median" />
          <Handle k="q3" label="Q3" />
          <Handle k="max" label="Max" />
        </div>
      </div>

      {/* Numeric inputs for precision */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8, marginTop: 10 }}>
        {(
          [
            { k: "min", label: "Min" },
            { k: "q1", label: "Q1" },
            { k: "median", label: "Median" },
            { k: "q3", label: "Q3" },
            { k: "max", label: "Max" },
          ] as Array<{ k: keyof Summary; label: string }>
        ).map(({ k, label }) => (
          <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{label}</div>
            <input
              value={fmt(value[k])}
              onChange={(e) => {
                const raw = String(e.target.value ?? "").trim();
                const n = Number(raw.replace(",", "."));
                if (!Number.isFinite(n)) return;
                applyOrdered(k, n);
              }}
              inputMode="decimal"
              style={{
                width: "100%",
                padding: "6px 8px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.35)",
                color: "rgba(255,255,255,0.9)",
                outline: "none",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
