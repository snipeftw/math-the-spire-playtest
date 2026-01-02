// src/screens/OverworldScreen.tsx
import React, { useMemo, useRef, useState } from "react";
import type { RunMap, MapNode, NodeType } from "../game/map";
import { sfx } from "../game/sfx";

type Pos = { x: number; y: number };

function iconFor(type: NodeType) {
  switch (type) {
    case "START":
      return "🏠";
    case "FIGHT":
      return "⚔️";
    case "CHALLENGE":
      return "💀";
    case "EVENT":
      return "❓";
    case "REST":
      return "🔥";
    case "SHOP":
      return "🛒";
    case "BOSS":
      return "👑";
    default:
      return "•";
  }
}

type LegendHighlight =
  | { kind: "TYPE"; nodeType: NodeType }
  | { kind: "NEXT" }
  | null;

export function OverworldScreen(props: {
  map: RunMap;
  currentNodeId: string;
  setupDone: boolean;
  gold: number;
  teacherUnlocked: boolean;
  lockedNodeIds?: string[];

  /** If true, show the map but disable all node clicks (view-only). */
  readOnly?: boolean;

  onClickStart: () => void;
  onOpenNode: (node: MapNode) => void;
}) {
  const { nodes, startId, bossDepth } = props.map;
  const current = nodes[props.currentNodeId];

  // Only next nodes are clickable; before setup is done only START is clickable
  const nextIds = new Set(current.next);
  const locked = new Set(props.lockedNodeIds ?? []);

  const canClick = (n: MapNode) => {
    if (props.readOnly) return false;
    if (props.teacherUnlocked) return true; // teacher-mode free clicking
    if (locked.has(n.id)) return false;
    if (!props.setupDone) return n.id === startId;
    return nextIds.has(n.id) || n.id === props.currentNodeId;
  };

  // ----- Hover highlight + hover SFX -----
  const [legendHover, setLegendHover] = useState<LegendHighlight>(null);
  const [nodeHoverType, setNodeHoverType] = useState<NodeType | null>(null);

  const lastHoverAtRef = useRef<number>(0);
  function hoverSfx() {
    const now = Date.now();
    if (now - lastHoverAtRef.current < 65) return; // throttle to prevent spam
    lastHoverAtRef.current = now;
    sfx.cardHover();
  }

  function nodeIsHighlighted(n: MapNode) {
    if (!legendHover) return false;
    if (legendHover.kind === "NEXT") return canClick(n);
    return n.type === legendHover.nodeType;
  }

  // Layout constants
  const W = 1000;
  const rowH = 84;
  const topPad = 56;
  const sidePad = 90;

  const depthGroups = useMemo(() => {
    const byDepth: Record<number, MapNode[]> = {};
    Object.values(nodes).forEach((n) => {
      (byDepth[n.depth] ??= []).push(n);
    });
    Object.keys(byDepth).forEach((k) =>
      byDepth[Number(k)].sort((a, b) => a.id.localeCompare(b.id))
    );
    return byDepth;
  }, [nodes]);

  // Invert Y so START (depth 0) is at bottom, BOSS at top
  const positions = useMemo(() => {
    const pos: Record<string, Pos> = {};
    for (let d = 0; d <= bossDepth; d++) {
      const row = depthGroups[d] ?? [];
      const count = row.length;
      for (let i = 0; i < count; i++) {
        const x = sidePad + ((W - sidePad * 2) * (i + 1)) / (count + 1);
        const y = topPad + (bossDepth - d) * rowH; // inverted
        pos[row[i].id] = { x, y };
      }
    }
    return pos;
  }, [depthGroups, bossDepth]);

  const H = topPad + bossDepth * rowH + 90;

  const edges = useMemo(() => {
    const lines: Array<{ from: Pos; to: Pos; active: boolean }> = [];
    Object.values(nodes).forEach((n) => {
      const from = positions[n.id];
      n.next.forEach((toId) => {
        const to = positions[toId];
        if (!from || !to) return;

        // Highlight edges from current node
        const active = n.id === props.currentNodeId;
        lines.push({ from, to, active });
      });
    });
    return lines;
  }, [nodes, positions, props.currentNodeId]);

  function LegendItem(props2: {
    label: string;
    icon: string;
    kind: LegendHighlight;
    badgeClass?: string;
  }) {
    const activeFromLegend =
      !!legendHover &&
      ((legendHover.kind === "NEXT" && props2.kind?.kind === "NEXT") ||
        (legendHover.kind === "TYPE" &&
          props2.kind?.kind === "TYPE" &&
          legendHover.nodeType === props2.kind.nodeType));

    const activeFromNode =
      props2.kind?.kind === "TYPE" && !!nodeHoverType && nodeHoverType === props2.kind.nodeType;

    const active = activeFromLegend || activeFromNode;

    return (
      <span
        className={"badge " + (props2.badgeClass ?? "")}
        onMouseEnter={() => {
          hoverSfx();
          setLegendHover(props2.kind);
        }}
        style={{
          cursor: "pointer",
          userSelect: "none",
          outline: active ? "2px solid rgba(255,255,255,0.65)" : "none",
          outlineOffset: 2,
          boxShadow: active ? "0 0 0 3px rgba(120,140,255,0.18)" : "none",
        }}
        title="Hover to highlight matching nodes"
      >
        {props2.label} <strong>{props2.icon}</strong>
      </span>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <div>
          <h2 className="h2">Overworld</h2>
          <div className="sub">
            Current: <strong>{current.type}</strong> (Depth {current.depth})
          </div>
        </div>

        <div
          className="mapLegend"
          onMouseLeave={() => setLegendHover(null)}
          style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
        >
          <LegendItem
            label="Battle"
            icon="⚔️"
            kind={{ kind: "TYPE", nodeType: "FIGHT" }}
          />
          <LegendItem
            label="Challenge"
            icon="☠️"
            kind={{ kind: "TYPE", nodeType: "CHALLENGE" }}
            badgeClass="warn"
          />
          <LegendItem
            label="Event"
            icon="❓"
            kind={{ kind: "TYPE", nodeType: "EVENT" }}
          />
          <LegendItem
            label="Rest"
            icon="🔥"
            kind={{ kind: "TYPE", nodeType: "REST" }}
          />
          <LegendItem
            label="Shop"
            icon="🛒"
            kind={{ kind: "TYPE", nodeType: "SHOP" }}
          />

          <span style={{ width: 10 }} />

          <LegendItem
            label="Start"
            icon="🏠"
            kind={{ kind: "TYPE", nodeType: "START" }}
          />
          <LegendItem
            label="Next"
            icon="●"
            kind={{ kind: "NEXT" }}
            badgeClass="good"
          />
          <LegendItem
            label="Boss"
            icon="👑"
            kind={{ kind: "TYPE", nodeType: "BOSS" }}
            badgeClass="warn"
          />
        </div>
      </div>

      <div
        className="panel mapFrame"
        onMouseLeave={() => setNodeHoverType(null)}
      >
        <svg className="mapSvg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {edges.map((e, idx) => (
            <line
              key={idx}
              x1={e.from.x}
              y1={e.from.y}
              x2={e.to.x}
              y2={e.to.y}
              stroke={e.active ? "rgba(34,197,94,0.65)" : "rgba(255,255,255,0.12)"}
              strokeWidth={e.active ? 4 : 2}
              strokeLinecap="round"
            />
          ))}
        </svg>

        {Object.values(nodes).map((n) => {
          const p = positions[n.id];
          if (!p) return null;

          const isBoss = n.type === "BOSS";
          const isStart = n.type === "START";
          const startPrompt = !props.setupDone && n.id === startId;

          const highlighted = nodeIsHighlighted(n);

          const cls =
            "mapNode " +
            (isBoss ? "boss " : "") +
            (n.id === props.currentNodeId ? "current " : "") +
            (canClick(n) ? "next " : "") +
            (startPrompt ? "startPrompt " : "");

          return (
            <button
              key={n.id}
              className={cls}
              style={{
                left: `${(p.x / W) * 100}%`,
                top: `${(p.y / H) * 100}%`,
                zIndex: highlighted ? 3 : 1,
                boxShadow: highlighted
                  ? "0 0 0 3px rgba(120,140,255,0.35), 0 0 18px rgba(120,140,255,0.18)"
                  : undefined,
                outline: highlighted ? "2px solid rgba(255,255,255,0.55)" : undefined,
                outlineOffset: highlighted ? 2 : undefined,
                transform: highlighted ? "translate(-50%, -50%) scale(1.06)" : undefined,
              }}
              disabled={!canClick(n)}
              title={`${n.type} • Depth ${n.depth}`}
              onMouseEnter={() => {
                hoverSfx();
                setNodeHoverType(n.type);
              }}
              onMouseLeave={() => setNodeHoverType(null)}
              onClick={() => {
                if (isStart) props.onClickStart();
                else props.onOpenNode(n);
              }}
            >
              <div style={{ fontSize: 22, transform: "translateY(1px)" }}>
                {iconFor(n.type)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
