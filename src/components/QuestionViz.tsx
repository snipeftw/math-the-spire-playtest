// src/components/QuestionViz.tsx
import React from "react";
import type { QuestionViz } from "../game/questions";

function isNearlyInt(x: number): boolean {
  return Math.abs(x - Math.round(x)) < 1e-9;
}

function fmt(x: number): string {
  if (!Number.isFinite(x)) return "";
  if (isNearlyInt(x)) return String(Math.round(x));
  // Keep .5s clean, otherwise show up to 2 decimals
  if (Math.abs(x * 2 - Math.round(x * 2)) < 1e-9) return String(Math.round(x * 2) / 2);
  return String(Number(x.toFixed(2)));
}

type Plot = { label?: string; min: number; q1: number; median: number; q3: number; max: number };

function BoxPlotSvg({
  title,
  plot,
  axisMin,
  axisMax,
  tickStep,
  y,
}: {
  title?: string;
  plot: Plot;
  axisMin: number;
  axisMax: number;
  tickStep: number;
  y: number;
}) {
  const w = 520;
  const h = 130;
  const padX = 36;
  const axisY = y + 44;
  const boxY = y + 10;
  const boxH = 22;

  const span = Math.max(1e-9, axisMax - axisMin);
  const x = (v: number) => padX + ((v - axisMin) / span) * (w - padX * 2);

  const xMin = x(plot.min);
  const xQ1 = x(plot.q1);
  const xMed = x(plot.median);
  const xQ3 = x(plot.q3);
  const xMax = x(plot.max);

  const ticks: number[] = [];
  const step = tickStep > 0 ? tickStep : 1;
  // avoid infinite loops on weird inputs
  for (let v = axisMin; v <= axisMax + step / 2 && ticks.length < 200; v += step) {
    // keep ticks stable even with floating point step
    const vv = Number((Math.round(v / step) * step).toFixed(6));
    if (vv >= axisMin - 1e-9 && vv <= axisMax + 1e-9) ticks.push(vv);
  }

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      style={{ display: "block" }}
      role="img"
      aria-label={title ? `${title} box plot` : "box plot"}
    >
      {/* Axis */}
      <line x1={padX} y1={axisY} x2={w - padX} y2={axisY} stroke="rgba(255,255,255,0.55)" strokeWidth={2} />

      {/* Ticks */}
      {ticks.map((t) => {
        const xt = x(t);
        const major = isNearlyInt(t) || step >= 1;
        const tickH = major ? 10 : 6;
        const showLabel = major && (step >= 1 || isNearlyInt(t));
        return (
          <g key={String(t)}>
            <line x1={xt} y1={axisY} x2={xt} y2={axisY + tickH} stroke="rgba(255,255,255,0.45)" strokeWidth={1} />
            {showLabel ? (
              <text x={xt} y={axisY + 24} textAnchor="middle" fontSize={12} fill="rgba(255,255,255,0.75)">
                {fmt(t)}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* Whiskers */}
      <line x1={xMin} y1={boxY + boxH / 2} x2={xQ1} y2={boxY + boxH / 2} stroke="rgba(255,255,255,0.7)" strokeWidth={2} />
      <line x1={xQ3} y1={boxY + boxH / 2} x2={xMax} y2={boxY + boxH / 2} stroke="rgba(255,255,255,0.7)" strokeWidth={2} />
      <line x1={xMin} y1={boxY + 2} x2={xMin} y2={boxY + boxH - 2} stroke="rgba(255,255,255,0.7)" strokeWidth={2} />
      <line x1={xMax} y1={boxY + 2} x2={xMax} y2={boxY + boxH - 2} stroke="rgba(255,255,255,0.7)" strokeWidth={2} />

      {/* Box */}
      <rect
        x={Math.min(xQ1, xQ3)}
        y={boxY}
        width={Math.max(1, Math.abs(xQ3 - xQ1))}
        height={boxH}
        fill="rgba(59,130,246,0.18)"
        stroke="rgba(255,255,255,0.75)"
        strokeWidth={2}
        rx={6}
      />
      {/* Median */}
      <line x1={xMed} y1={boxY} x2={xMed} y2={boxY + boxH} stroke="rgba(255,255,255,0.9)" strokeWidth={3} />

      {/* Label */}
      {plot.label ? (
        <text x={padX} y={boxY - 8} textAnchor="start" fontSize={13} fill="rgba(255,255,255,0.85)" fontWeight={800}>
          {plot.label}
        </text>
      ) : null}
    </svg>
  );
}

export function QuestionVizView({ viz }: { viz: QuestionViz }) {
  if (!viz) return null;

  if (viz.kind === "image") {
    return (
      <div
        className="panel soft"
        style={{
          marginTop: 10,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(0,0,0,0.35)",
        }}
      >
        {viz.title ? <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 6 }}>{viz.title}</div> : null}
        <img
          src={viz.src}
          alt={viz.alt ?? viz.caption ?? "Question visual"}
          style={{
            width: "100%",
            height: "auto",
            maxHeight: viz.maxHeight ?? 280,
            objectFit: "contain",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(0,0,0,0.25)",
          }}
        />
        {viz.caption ? (
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>{viz.caption}</div>
        ) : null}
      </div>
    );
  }

  if (viz.kind === "image_pair") {
    const layout = viz.layout ?? "col";
    const dir = layout === "row" ? "row" : "column";
    return (
      <div
        className="panel soft"
        style={{
          marginTop: 10,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(0,0,0,0.35)",
        }}
      >
        {viz.title ? <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 6 }}>{viz.title}</div> : null}
        <div style={{ display: "flex", flexDirection: dir as any, gap: 10, alignItems: "stretch" }}>
          {[viz.a, viz.b].map((img, idx) => (
            <div key={idx} style={{ flex: 1, minWidth: 0 }}>
              <img
                src={img.src}
                alt={img.alt ?? img.caption ?? "Question visual"}
                style={{
                  width: "100%",
                  height: "auto",
                  maxHeight: viz.maxHeight ?? 260,
                  objectFit: "contain",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(0,0,0,0.25)",
                }}
              />
              {img.caption ? (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>{img.caption}</div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (viz.kind === "boxplot") {
    const axisMin = Number.isFinite(viz.axisMin as any) ? (viz.axisMin as number) : Math.floor(viz.min);
    const axisMax = Number.isFinite(viz.axisMax as any) ? (viz.axisMax as number) : Math.ceil(viz.max);
    const tickStep = Number.isFinite(viz.tickStep as any) ? (viz.tickStep as number) : 1;
    return (
      <div
        className="panel soft"
        style={{
          marginTop: 10,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(0,0,0,0.35)",
        }}
      >
        {viz.title ? (
          <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 6 }}>{viz.title}</div>
        ) : null}
        <BoxPlotSvg
          title={viz.title}
          plot={{ min: viz.min, q1: viz.q1, median: viz.median, q3: viz.q3, max: viz.max }}
          axisMin={axisMin}
          axisMax={axisMax}
          tickStep={tickStep}
          y={10}
        />
      </div>
    );
  }

  // boxplot_compare
  const plots = Array.isArray(viz.plots) ? viz.plots : [];
  const minAll = Math.min(...plots.map((p) => p.min));
  const maxAll = Math.max(...plots.map((p) => p.max));
  const axisMin = Number.isFinite(viz.axisMin as any) ? (viz.axisMin as number) : Math.floor(minAll);
  const axisMax = Number.isFinite(viz.axisMax as any) ? (viz.axisMax as number) : Math.ceil(maxAll);
  const tickStep = Number.isFinite(viz.tickStep as any) ? (viz.tickStep as number) : 1;

  return (
    <div
      className="panel soft"
      style={{
        marginTop: 10,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.35)",
      }}
    >
      {viz.title ? (
        <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 6 }}>{viz.title}</div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {plots.slice(0, 2).map((p, idx) => (
          <BoxPlotSvg
            key={`${p.label ?? idx}`}
            title={viz.title}
            plot={{ label: p.label, min: p.min, q1: p.q1, median: p.median, q3: p.q3, max: p.max }}
            axisMin={axisMin}
            axisMax={axisMax}
            tickStep={tickStep}
            y={10}
          />
        ))}
      </div>
    </div>
  );
}
