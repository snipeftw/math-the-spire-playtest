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



if (viz.kind === "scatter") {
  const w = 520;
  const h = 280;
  const padL = 48;
  const padR = 18;
  const padT = 18;
  const padB = 42;

  const pts = Array.isArray(viz.points) ? viz.points : [];
  const xs = pts.map((p) => Number(p.x)).filter((n) => Number.isFinite(n));
  const ys = pts.map((p) => Number(p.y)).filter((n) => Number.isFinite(n));

  const xMin0 = Number.isFinite(viz.xMin as any) ? (viz.xMin as number) : xs.length ? Math.min(...xs) : 0;
  const xMax0 = Number.isFinite(viz.xMax as any) ? (viz.xMax as number) : xs.length ? Math.max(...xs) : 10;
  const yMin0 = Number.isFinite(viz.yMin as any) ? (viz.yMin as number) : ys.length ? Math.min(...ys) : 0;
  const yMax0 = Number.isFinite(viz.yMax as any) ? (viz.yMax as number) : ys.length ? Math.max(...ys) : 10;

  const xSpan = Math.max(1e-9, xMax0 - xMin0);
  const ySpan = Math.max(1e-9, yMax0 - yMin0);

  const xTickStep = Number.isFinite(viz.xTickStep as any) ? (viz.xTickStep as number) : xSpan <= 12 ? 1 : xSpan <= 24 ? 2 : 5;
  const yTickStep = Number.isFinite(viz.yTickStep as any) ? (viz.yTickStep as number) : ySpan <= 12 ? 1 : ySpan <= 24 ? 2 : 5;

  const xToSvg = (x: number) => padL + ((x - xMin0) / xSpan) * (w - padL - padR);
  const yToSvg = (y: number) => padT + (1 - (y - yMin0) / ySpan) * (h - padT - padB);

  const xTicks: number[] = [];
  const yTicks: number[] = [];
  const pushTicks = (out: number[], minV: number, maxV: number, step: number) => {
    if (!Number.isFinite(step) || step <= 0) step = 1;
    const start = Math.ceil(minV / step) * step;
    for (let v = start; v <= maxV + step / 2 && out.length < 200; v += step) {
      const vv = Number((Math.round(v / step) * step).toFixed(6));
      if (vv >= minV - 1e-9 && vv <= maxV + 1e-9) out.push(vv);
    }
  };
  pushTicks(xTicks, xMin0, xMax0, xTickStep);
  pushTicks(yTicks, yMin0, yMax0, yTickStep);

  const line = (viz as any).line as any;
  const guideX = (viz as any).guideX as any;

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
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }} role="img" aria-label={viz.title ?? "scatter plot"}>
        {/* axes */}
        <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="rgba(255,255,255,0.55)" strokeWidth={2} />
        <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="rgba(255,255,255,0.55)" strokeWidth={2} />

        {/* ticks + grid */}
        {xTicks.map((t) => {
          const x = xToSvg(t);
          return (
            <g key={`xt-${t}`}>
              <line x1={x} y1={h - padB} x2={x} y2={h - padB + 8} stroke="rgba(255,255,255,0.45)" strokeWidth={1} />
              <line x1={x} y1={padT} x2={x} y2={h - padB} stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
              <text x={x} y={h - padB + 22} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.75)">{fmt(t)}</text>
            </g>
          );
        })}
        {yTicks.map((t) => {
          const y = yToSvg(t);
          return (
            <g key={`yt-${t}`}>
              <line x1={padL - 8} y1={y} x2={padL} y2={y} stroke="rgba(255,255,255,0.45)" strokeWidth={1} />
              <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
              <text x={padL - 12} y={y + 4} textAnchor="end" fontSize={11} fill="rgba(255,255,255,0.75)">{fmt(t)}</text>
            </g>
          );
        })}

        {/* guideX */}
        {Number.isFinite(Number(guideX)) ? (
          <line x1={xToSvg(Number(guideX))} y1={padT} x2={xToSvg(Number(guideX))} y2={h - padB} stroke="rgba(255,255,255,0.35)" strokeWidth={2} strokeDasharray="6 6" />
        ) : null}

        {/* best-fit line */}
        {line && Number.isFinite(Number(line.m)) && Number.isFinite(Number(line.b)) ? (() => {
          const m = Number(line.m);
          const b = Number(line.b);
          const x1 = xMin0;
          const x2 = xMax0;
          const y1 = m * x1 + b;
          const y2 = m * x2 + b;
          return (
            <line
              x1={xToSvg(x1)}
              y1={yToSvg(y1)}
              x2={xToSvg(x2)}
              y2={yToSvg(y2)}
              stroke="rgba(34,197,94,0.75)"
              strokeWidth={3}
              strokeLinecap="round"
            />
          );
        })() : null}

        {/* points */}
        {pts.map((p, i) => {
          const x = xToSvg(Number(p.x));
          const y = yToSvg(Number(p.y));
          return (
            <g key={`p-${i}`}>
              <circle cx={x} cy={y} r={5} fill="rgba(255,255,255,0.85)" />
              <circle cx={x} cy={y} r={5} fill="rgba(0,0,0,0.0)" stroke="rgba(0,0,0,0.35)" strokeWidth={1} />
              {p.label ? (
                <text x={x + 8} y={y - 8} fontSize={12} fill="rgba(255,255,255,0.9)" fontWeight={900}>{p.label}</text>
              ) : null}
            </g>
          );
        })}

        {/* axis labels */}
        {viz.xLabel ? (
          <text x={(padL + (w - padR)) / 2} y={h - 8} textAnchor="middle" fontSize={12} fill="rgba(255,255,255,0.85)" fontWeight={800}>
            {viz.xLabel}
          </text>
        ) : null}
        {viz.yLabel ? (
          <text x={14} y={(padT + (h - padB)) / 2} textAnchor="middle" fontSize={12} fill="rgba(255,255,255,0.85)" fontWeight={800} transform={`rotate(-90 14 ${(padT + (h - padB)) / 2})`}>
            {viz.yLabel}
          </text>
        ) : null}
      </svg>
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
