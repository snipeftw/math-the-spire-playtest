// src/components/ScatterBuilders.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

type Axis = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xTickStep: number;
  yTickStep: number;
  xLabel?: string;
  yLabel?: string;
};

type Pt = { x: number; y: number; label?: string };

export type ScatterLineFitValue = { yLeft: number; yRight: number };
export type ScatterPredictValue = { y: number };

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function fmt(x: number): string {
  if (!Number.isFinite(x)) return "";
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
  return String(Number(x.toFixed(2)));
}

function useRafPointerMove(onMove: (clientX: number, clientY: number) => void) {
  const rafRef = useRef<number>(0);
  const last = useRef<{ x: number; y: number } | null>(null);

  const handler = (e: PointerEvent) => {
    last.current = { x: e.clientX, y: e.clientY };
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (!last.current) return;
      onMove(last.current.x, last.current.y);
    });
  };

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      last.current = null;
    };
  }, []);

  return handler;
}

function ScatterFrame({
  axis,
  points,
  children,
}: {
  axis: Axis;
  points: Pt[];
  children?: React.ReactNode;
}) {
  const w = 520;
  const h = 280;
  const padL = 48;
  const padR = 18;
  const padT = 18;
  const padB = 42;

  const xSpan = Math.max(1e-9, axis.xMax - axis.xMin);
  const ySpan = Math.max(1e-9, axis.yMax - axis.yMin);

  const xToSvg = (x: number) => padL + ((x - axis.xMin) / xSpan) * (w - padL - padR);
  const yToSvg = (y: number) => padT + (1 - (y - axis.yMin) / ySpan) * (h - padT - padB);

  const xTicks = useMemo(() => {
    const out: number[] = [];
    const step = Number.isFinite(axis.xTickStep) && axis.xTickStep > 0 ? axis.xTickStep : 1;
    const start = Math.ceil(axis.xMin / step) * step;
    for (let v = start; v <= axis.xMax + step / 2 && out.length < 200; v += step) {
      const vv = Number((Math.round(v / step) * step).toFixed(6));
      if (vv >= axis.xMin - 1e-9 && vv <= axis.xMax + 1e-9) out.push(vv);
    }
    return out;
  }, [axis.xMin, axis.xMax, axis.xTickStep]);

  const yTicks = useMemo(() => {
    const out: number[] = [];
    const step = Number.isFinite(axis.yTickStep) && axis.yTickStep > 0 ? axis.yTickStep : 1;
    const start = Math.ceil(axis.yMin / step) * step;
    for (let v = start; v <= axis.yMax + step / 2 && out.length < 200; v += step) {
      const vv = Number((Math.round(v / step) * step).toFixed(6));
      if (vv >= axis.yMin - 1e-9 && vv <= axis.yMax + 1e-9) out.push(vv);
    }
    return out;
  }, [axis.yMin, axis.yMax, axis.yTickStep]);

  return (
    <div
      className="panel soft"
      style={{
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.35)",
      }}
    >
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }} role="img" aria-label="scatter plot builder">
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
              <text x={x} y={h - padB + 22} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.75)">
                {fmt(t)}
              </text>
            </g>
          );
        })}
        {yTicks.map((t) => {
          const y = yToSvg(t);
          return (
            <g key={`yt-${t}`}>
              <line x1={padL - 8} y1={y} x2={padL} y2={y} stroke="rgba(255,255,255,0.45)" strokeWidth={1} />
              <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
              <text x={padL - 12} y={y + 4} textAnchor="end" fontSize={11} fill="rgba(255,255,255,0.75)">
                {fmt(t)}
              </text>
            </g>
          );
        })}

        {/* points */}
        {points.map((p, i) => {
          const x = xToSvg(p.x);
          const y = yToSvg(p.y);
          return (
            <g key={`p-${i}`}>
              <circle cx={x} cy={y} r={5} fill="rgba(255,255,255,0.85)" />
              <circle cx={x} cy={y} r={5} fill="rgba(0,0,0,0.0)" stroke="rgba(0,0,0,0.35)" strokeWidth={1} />
              {p.label ? (
                <text x={x + 8} y={y - 8} fontSize={12} fill="rgba(255,255,255,0.9)" fontWeight={900}>
                  {p.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {children}

        {/* axis labels */}
        {axis.xLabel ? (
          <text x={(padL + (w - padR)) / 2} y={h - 8} textAnchor="middle" fontSize={12} fill="rgba(255,255,255,0.85)" fontWeight={800}>
            {axis.xLabel}
          </text>
        ) : null}
        {axis.yLabel ? (
          <text
            x={14}
            y={(padT + (h - padB)) / 2}
            textAnchor="middle"
            fontSize={12}
            fill="rgba(255,255,255,0.85)"
            fontWeight={800}
            transform={`rotate(-90 14 ${(padT + (h - padB)) / 2})`}
          >
            {axis.yLabel}
          </text>
        ) : null}
      </svg>
    </div>
  );
}

export function ScatterLineFitBuilder({
  axis,
  points,
  value,
  onChange,
}: {
  axis: Axis;
  points: Pt[];
  value: ScatterLineFitValue;
  onChange: (v: ScatterLineFitValue) => void;
}) {
  const w = 520;
  const h = 280;
  const padL = 48;
  const padR = 18;
  const padT = 18;
  const padB = 42;

  const xSpan = Math.max(1e-9, axis.xMax - axis.xMin);
  const ySpan = Math.max(1e-9, axis.yMax - axis.yMin);

  const xLeft = axis.xMin;
  const xRight = axis.xMax;

  const xToSvg = (x: number) => padL + ((x - axis.xMin) / xSpan) * (w - padL - padR);
  const yToSvg = (y: number) => padT + (1 - (y - axis.yMin) / ySpan) * (h - padT - padB);
  const svgToY = (svgY: number) => {
    const t = (svgY - padT) / Math.max(1e-9, h - padT - padB);
    return axis.yMax - t * (axis.yMax - axis.yMin);
  };

  const [drag, setDrag] = useState<null | "L" | "R" | "LINE">(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const leftSvgX = xToSvg(xLeft);
  const rightSvgX = xToSvg(xRight);

  const yLeft = clamp(value.yLeft, axis.yMin, axis.yMax);
  const yRight = clamp(value.yRight, axis.yMin, axis.yMax);

  const yLeftSvg = yToSvg(yLeft);
  const yRightSvg = yToSvg(yRight);

  const onPointerMove = useRafPointerMove((clientX, clientY) => {
    if (!drag) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const newY = clamp(svgToY(y / (rect.height / h)), axis.yMin, axis.yMax);

    if (drag === "L") {
      onChange({ yLeft: newY, yRight });
      return;
    }
    if (drag === "R") {
      onChange({ yLeft, yRight: newY });
      return;
    }
    // Dragging line: shift both endpoints by the same delta in y
    // Estimate delta by comparing cursor y to closest point on line at that x.
    const xData = axis.xMin + ((x / (rect.width / w) - padL) / Math.max(1e-9, w - padL - padR)) * (axis.xMax - axis.xMin);
    const t = clamp((xData - axis.xMin) / Math.max(1e-9, axis.xMax - axis.xMin), 0, 1);
    const currentYAtX = yLeft + t * (yRight - yLeft);
    const delta = newY - currentYAtX;
    onChange({ yLeft: clamp(yLeft + delta, axis.yMin, axis.yMax), yRight: clamp(yRight + delta, axis.yMin, axis.yMax) });
  });

  useEffect(() => {
    if (!drag) return;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", () => setDrag(null), { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [drag]);

  return (
    <ScatterFrame axis={axis} points={points}>
      <svg ref={svgRef} width="100%" viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", left: -99999, top: -99999 }} />
      {/* overlay interactive line */}
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        style={{ display: "block", marginTop: -(h) }}
        aria-hidden
      >
        {/* line */}
        <line
          x1={leftSvgX}
          y1={yLeftSvg}
          x2={rightSvgX}
          y2={yRightSvg}
          stroke="rgba(34,197,94,0.85)"
          strokeWidth={4}
          strokeLinecap="round"
          onPointerDown={(e) => {
            e.preventDefault();
            (e.target as any).setPointerCapture?.(e.pointerId);
            setDrag("LINE");
          }}
          style={{ cursor: "grab" }}
        />
        {/* handles */}
        <circle
          cx={leftSvgX}
          cy={yLeftSvg}
          r={8}
          fill="rgba(255,255,255,0.92)"
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={2}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.target as any).setPointerCapture?.(e.pointerId);
            setDrag("L");
          }}
          style={{ cursor: "ns-resize" }}
        />
        <circle
          cx={rightSvgX}
          cy={yRightSvg}
          r={8}
          fill="rgba(255,255,255,0.92)"
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={2}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.target as any).setPointerCapture?.(e.pointerId);
            setDrag("R");
          }}
          style={{ cursor: "ns-resize" }}
        />
      </svg>

      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Tip: try to balance points above and below the line.
      </div>
    </ScatterFrame>
  );
}

export function ScatterPredictBuilder({
  axis,
  points,
  line,
  targetX,
  value,
  onChange,
}: {
  axis: Axis;
  points: Pt[];
  line: { m: number; b: number };
  targetX: number;
  value: ScatterPredictValue;
  onChange: (v: ScatterPredictValue) => void;
}) {
  const w = 520;
  const h = 280;
  const padL = 48;
  const padR = 18;
  const padT = 18;
  const padB = 42;

  const xSpan = Math.max(1e-9, axis.xMax - axis.xMin);
  const ySpan = Math.max(1e-9, axis.yMax - axis.yMin);

  const xToSvg = (x: number) => padL + ((x - axis.xMin) / xSpan) * (w - padL - padR);
  const yToSvg = (y: number) => padT + (1 - (y - axis.yMin) / ySpan) * (h - padT - padB);
  const svgToY = (svgY: number) => {
    const t = (svgY - padT) / Math.max(1e-9, h - padT - padB);
    return axis.yMax - t * (axis.yMax - axis.yMin);
  };

  const xGuide = clamp(targetX, axis.xMin, axis.xMax);
  const xGuideSvg = xToSvg(xGuide);
  const yVal = clamp(value.y, axis.yMin, axis.yMax);
  const yValSvg = yToSvg(yVal);

  const [drag, setDrag] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const onPointerMove = useRafPointerMove((clientX, clientY) => {
    if (!drag) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const y = clientY - rect.top;
    const newY = clamp(svgToY(y / (rect.height / h)), axis.yMin, axis.yMax);
    onChange({ y: newY });
  });

  useEffect(() => {
    if (!drag) return;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", () => setDrag(false), { once: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [drag]);

  const y1 = line.m * axis.xMin + line.b;
  const y2 = line.m * axis.xMax + line.b;

  return (
    <ScatterFrame axis={axis} points={points}>
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        style={{ display: "block", marginTop: -(h) }}
        aria-hidden
      >
        {/* best-fit line */}
        <line
          x1={xToSvg(axis.xMin)}
          y1={yToSvg(y1)}
          x2={xToSvg(axis.xMax)}
          y2={yToSvg(y2)}
          stroke="rgba(34,197,94,0.75)"
          strokeWidth={3}
          strokeLinecap="round"
        />

        {/* vertical guide */}
        <line
          x1={xGuideSvg}
          y1={padT}
          x2={xGuideSvg}
          y2={h - padB}
          stroke="rgba(255,255,255,0.35)"
          strokeWidth={2}
          strokeDasharray="6 6"
        />

        {/* draggable dot */}
        <circle
          cx={xGuideSvg}
          cy={yValSvg}
          r={9}
          fill="rgba(59,130,246,0.92)"
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={2}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.target as any).setPointerCapture?.(e.pointerId);
            setDrag(true);
          }}
          style={{ cursor: "ns-resize" }}
        />
      </svg>

      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Drag the dot up/down at x = <b>{fmt(xGuide)}</b>.
      </div>
    </ScatterFrame>
  );
}
