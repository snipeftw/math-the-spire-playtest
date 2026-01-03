// src/screens/MapScreen.tsx
import React from "react";
import type { RunMap, MapNode } from "../game/map";

export function MapScreen(props: {
  map: RunMap;
  currentNodeId: string;
  gold: number;
  onEnterBattle: (node: MapNode) => void;
  onMoveTo: (nodeId: string) => void;
}) {
  const curr = props.map.nodes[props.currentNodeId];
  const nextNodes = curr.next.map((id) => props.map.nodes[id]);

  return (
    <div className="container">
      <div className="header">
        <div>
          <h2 className="h2">Map</h2>
          <div className="sub">
            Seed <strong>{props.map.seed}</strong> • Gold <strong>{props.gold}</strong>
          </div>
        </div>

        <span className="badge">
          Current: <strong>{curr.type}</strong> • Depth <strong>{curr.depth}</strong>
        </span>
      </div>

      <div className="panel soft">
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Where to next?</div>
        <div className="muted">
          (Framework note: EVENT/REST/SHOP nodes exist, but only FIGHT/BOSS launch battles right now.)
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        {nextNodes.map((n) => {
          const badgeClass =
            n.type === "BOSS" ? "badge warn" :
            n.type === "FIGHT" ? "badge good" :
            "badge";

          return (
            <button
              key={n.id}
              className="nodeBtn"
              onClick={() => {
                props.onMoveTo(n.id);
                if (n.type === "FIGHT" || n.type === "BOSS") props.onEnterBattle(n);
              }}
            >
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div className="nodeType">{n.type}</div>
                <span className={badgeClass}>
                  Depth <strong>{n.depth}</strong>
                </span>
              </div>

              <div className="small" style={{ marginTop: 8 }}>
                Node ID: {n.id}
              </div>
              <div className="muted" style={{ marginTop: 6 }}>
                Click to travel {n.type === "FIGHT" || n.type === "BOSS" ? "and begin" : ""}.
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
