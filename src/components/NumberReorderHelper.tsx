// src/components/NumberReorderHelper.tsx
import React, { useMemo, useState } from "react";

type Props = {
  values: number[];
  label?: string;
};

type Item = { id: string; value: number };

function makeItems(values: number[]): Item[] {
  // Use the original index to keep ids stable even when values repeat.
  return values.map((v, i) => ({ id: `${i}-${v}`, value: v }));
}

export function NumberReorderHelper(props: Props) {
  const initial = useMemo(() => makeItems(props.values), [props.values]);
  const [items, setItems] = useState<Item[]>(initial);
  const [pickedId, setPickedId] = useState<string | null>(null);

  // If values change (new question), reset.
  React.useEffect(() => {
    setItems(makeItems(props.values));
    setPickedId(null);
  }, [props.values]);

  function moveItem(srcId: string, targetId: string) {
    if (!srcId || !targetId || srcId === targetId) return;
    setItems((prev) => {
      const srcIdx = prev.findIndex((x) => x.id === srcId);
      const tgtIdx = prev.findIndex((x) => x.id === targetId);
      if (srcIdx < 0 || tgtIdx < 0) return prev;
      const next = prev.slice();
      const [it] = next.splice(srcIdx, 1);
      next.splice(tgtIdx, 0, it);
      return next;
    });
  }

  function swapItems(aId: string, bId: string) {
    if (!aId || !bId || aId === bId) return;
    setItems((prev) => {
      const ai = prev.findIndex((x) => x.id === aId);
      const bi = prev.findIndex((x) => x.id === bId);
      if (ai < 0 || bi < 0) return prev;
      const next = prev.slice();
      const tmp = next[ai];
      next[ai] = next[bi];
      next[bi] = tmp;
      return next;
    });
  }

  return (
    <div
      className="panel soft"
      style={{
        marginTop: 10,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 13 }}>
          {props.label ?? "Sorting helper"}
        </div>
        <button
          type="button"
          className="btn"
          style={{ padding: "6px 10px", fontSize: 12 }}
          onClick={() => {
            setItems(makeItems(props.values));
            setPickedId(null);
          }}
        >
          Reset
        </button>
      </div>

      <div className="muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.4 }}>
        Drag the numbers to rearrange them (not graded). If drag-and-drop is awkward on your device, click one number,
        then click another to swap.
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {items.map((it) => {
          const picked = pickedId === it.id;
          return (
            <div
              key={it.id}
              draggable
              onDragStart={(e) => {
                try {
                  e.dataTransfer.setData("text/plain", it.id);
                  e.dataTransfer.effectAllowed = "move";
                } catch {}
              }}
              onDragOver={(e) => {
                e.preventDefault();
                try {
                  e.dataTransfer.dropEffect = "move";
                } catch {}
              }}
              onDrop={(e) => {
                e.preventDefault();
                const srcId = String(e.dataTransfer.getData("text/plain") ?? "");
                moveItem(srcId, it.id);
              }}
              onClick={() => {
                // click-to-swap fallback
                if (!pickedId) {
                  setPickedId(it.id);
                  return;
                }
                if (pickedId === it.id) {
                  setPickedId(null);
                  return;
                }
                swapItems(pickedId, it.id);
                setPickedId(null);
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 999,
                border: picked ? "2px solid rgba(34,197,94,0.8)" : "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                cursor: "grab",
                userSelect: "none",
                fontWeight: 900,
                minWidth: 40,
                textAlign: "center",
              }}
              title="Drag to reorder"
            >
              {it.value}
            </div>
          );
        })}
      </div>
    </div>
  );
}
