// src/components/AllConsumablesModal.tsx
import React, { useMemo, useState } from "react";
import { CONSUMABLES_10 } from "../content/consumables";
import type { ConsumableDef } from "../content/consumables";
import { sfx } from "../game/sfx";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AllConsumablesModal({ open, onClose }: Props) {
  const [q, setQ] = useState<string>("");
  const [showEventOnly, setShowEventOnly] = useState<boolean>(true);
  // When true, show ONLY event-only consumables (i.e. hide the base pool).
  const [onlyEventOnly, setOnlyEventOnly] = useState<boolean>(false);

  const consumables = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let list = (CONSUMABLES_10 as ConsumableDef[]).slice();

    if (onlyEventOnly) {
      list = list.filter((c) => !!c.eventOnly);
    } else if (!showEventOnly) {
      list = list.filter((c) => !c.eventOnly);
    }

    if (qq) {
      list = list.filter((c) => {
        const hay = `${c.id} ${c.name} ${c.desc ?? ""}`.toLowerCase();
        return hay.includes(qq);
      });
    }

    return list.sort((a, b) => {
      const ra = String(a.rarity ?? "Common");
      const rb = String(b.rarity ?? "Common");
      const r = ra.localeCompare(rb);
      if (r !== 0) return r;
      return a.name.localeCompare(b.name);
    });
  }, [q, showEventOnly, onlyEventOnly]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300000]" role="dialog" aria-label="All Consumables">
      <button
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-label="Close"
        type="button"
      />

      <div className="absolute inset-3 md:inset-8 rounded-2xl border border-white/15 bg-black/80 shadow-2xl backdrop-blur overflow-hidden flex flex-col">
        <div className="p-3 md:p-4 border-b border-white/10 flex flex-wrap items-center gap-2">
          <div className="text-sm md:text-base font-semibold">All Consumables</div>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 min-w-[220px] rounded-xl bg-black/50 border border-white/10 p-2 text-sm"
            placeholder="Search name / id / text…"
            autoFocus
          />

          <label className="text-xs opacity-90 flex items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={showEventOnly}
              onChange={(e) => setShowEventOnly(e.target.checked)}
              disabled={onlyEventOnly}
            />
            Event-only
          </label>

          <label
            className="text-xs opacity-90 flex items-center gap-2 select-none"
            title="When enabled, only EVENT ONLY consumables are shown."
          >
            <input
              type="checkbox"
              checked={onlyEventOnly}
              onChange={(e) => {
                const v = e.target.checked;
                setOnlyEventOnly(v);
                if (v) setShowEventOnly(true);
              }}
            />
            Hide base
          </label>

          <button className="btn btn-sm" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <div className="p-3 md:p-4 overflow-auto">
          <div className="text-[11px] opacity-70 mb-2">
            Showing <span className="font-mono">{consumables.length}</span> consumables
          </div>

          <div className="grid gap-3 items-stretch" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {consumables.map((def) => {
              const id = def.id;
              const rarity = String(def.rarity ?? "Common").toLowerCase();
              return (
                <div key={id} className="flex flex-col gap-2">
                  <div
                    className={
                      "panel soft cardTile " +
                      `rarity-${rarity}` +
                      (def.eventOnly ? " ring-2 ring-amber-400/40" : "")
                    }
                    onMouseEnter={() => sfx.cardHover()}
                    style={{ textAlign: "left" }}
                    title={`${def.name}\n${def.desc}\nRarity: ${def.rarity}${def.eventOnly ? "\nEVENT ONLY" : ""}\nID: ${def.id}`}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 900, display: "flex", gap: 8, alignItems: "center" }}>
                          <span>{def.name}</span>
                          {def.eventOnly ? (
                            <span className="badge" style={{ fontSize: 10, opacity: 0.95 }}>
                              EVENT
                            </span>
                          ) : null}
                        </div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          <span className="font-mono">{def.id}</span> • {def.rarity}
                        </div>
                      </div>
                    </div>

                    <div className="muted" style={{ fontSize: 12, marginTop: 8, whiteSpace: "pre-wrap" }}>
                      {def.desc}
                    </div>
                  </div>

                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() => {
                      sfx.selectOn();
                      navigator.clipboard?.writeText(id);
                    }}
                    title="Copy consumable id"
                  >
                    Copy id
                  </button>
                </div>
              );
            })}
          </div>

          {consumables.length === 0 ? <div className="text-sm opacity-70 mt-4">No consumables match.</div> : null}
        </div>
      </div>
    </div>
  );
}
