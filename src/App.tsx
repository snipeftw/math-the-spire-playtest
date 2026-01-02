// src/App.tsx
import React, { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Rnd } from "react-rnd";
import { initialState, reducer } from "./game/state";

import { TitleScreen } from "./screens/TitleScreen";
import { OverworldScreen } from "./screens/OverworldScreen";
import { SetupScreen } from "./screens/SetupScreen";
import { NodeScreen } from "./screens/NodeScreen";
import BattleScreen from "./screens/BattleScreen";
import { RewardScreen } from "./screens/RewardScreen";

import { makeRng } from "./game/rng";
import type { MapNode } from "./game/map";

import { sfx } from "./game/sfx";
import { music } from "./game/music";
import { decodeRunCode, encodeRunCode } from "./game/runCode";

import { CHARACTERS_3 } from "./content/characters";
import { SUPPLIES_POOL_10 } from "./content/supplies";
import { CONSUMABLES_10 } from "./content/consumables";
import { ALL_CARDS_40ish, cardDescForUi, EXHAUST_TOOLTIP } from "./content/cards";

const BEST_TIME_KEY = "math-roguelike-best-ms";

const SFX_VOL_KEY = "math-roguelike-sfx-vol";
const SFX_MUTE_KEY = "math-roguelike-sfx-mute";

const MUSIC_VOL_KEY = "math-roguelike-music-vol";
const MUSIC_MUTE_KEY = "math-roguelike-music-mute";

// Legacy keys (migration only)
const BGM_VOL_KEY = "math-roguelike-bgm-vol";
const BGM_MUTE_KEY = "math-roguelike-bgm-mute";
const BOSS_VOL_KEY = "math-roguelike-boss-vol";
const BOSS_MUTE_KEY = "math-roguelike-boss-mute";

const COMPACT_MODE_KEY = "math-roguelike-compact-mode";

// Run Loadout window position/size persistence
const LOADOUT_BOX_KEY = "math-the-spire-loadout-box";

type LoadoutBox = { x: number; y: number; w: number; h: number };

// floating tooltip for loadout (not clipped by Run Loadout scroll)
type FloatingTip = { text: string; x: number; y: number };

function loadBestMs(): number | null {
  try {
    const raw = localStorage.getItem(BEST_TIME_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }

}

function clampLoadoutBoxToWindow(b: LoadoutBox): LoadoutBox {
  try {
    const ww = typeof window !== "undefined" ? window.innerWidth : 1200;
    const wh = typeof window !== "undefined" ? window.innerHeight : 800;
    const pad = 8;

    // Ensure the box itself fits within the viewport first (important when the window becomes smaller).
    const maxW = Math.max(240, ww - pad * 2);
    const maxH = Math.max(240, wh - pad * 2);

    const w = Math.min(Math.max(260, b.w), maxW);
    const h = Math.min(Math.max(240, b.h), maxH);

    const maxX = Math.max(pad, ww - w - pad);
    const maxY = Math.max(pad, wh - h - pad);

    const x = Math.min(Math.max(pad, b.x), maxX);
    const y = Math.min(Math.max(pad, b.y), maxY);

    return { ...b, x, y, w, h };
  } catch {
    return b;
  }
}
function saveBestMs(ms: number) {
  try {
    localStorage.setItem(BEST_TIME_KEY, String(ms));
  } catch {}
}

function loadSfxVol() {
  try {
    const n = Number(localStorage.getItem(SFX_VOL_KEY));
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.35;
  } catch {
    return 0.35;
  }
}
function loadSfxMute(): boolean {
  try {
    return localStorage.getItem(SFX_MUTE_KEY) === "1";
  } catch {
    return false;
  }
}
function loadCompactMode(): boolean {
  try {
    return localStorage.getItem(COMPACT_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveSfxVol(v: number) {
  try {
    localStorage.setItem(SFX_VOL_KEY, String(v));
  } catch {}
}
function saveSfxMute(m: boolean) {
  try {
    localStorage.setItem(SFX_MUTE_KEY, m ? "1" : "0");
  } catch {}
}

function loadMusicVol() {
  try {
    const raw = localStorage.getItem(MUSIC_VOL_KEY);
    if (raw != null) {
      const n = Number(raw);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.25;
    }
    // migrate from legacy keys
    const legacy = localStorage.getItem(BGM_VOL_KEY) ?? localStorage.getItem(BOSS_VOL_KEY);
    if (legacy != null) {
      const n = Number(legacy);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.25;
    }
    return 0.25;
  } catch {
    return 0.25;
  }
}
function loadMusicMute(): boolean {
  try {
    const raw = localStorage.getItem(MUSIC_MUTE_KEY);
    if (raw != null) return raw === "1";
    // migrate from legacy keys (mute all if either was muted)
    return localStorage.getItem(BGM_MUTE_KEY) === "1" || localStorage.getItem(BOSS_MUTE_KEY) === "1";
  } catch {
    return false;
  }
}
function saveMusicVol(v: number) {
  try {
    localStorage.setItem(MUSIC_VOL_KEY, String(v));
  } catch {}
}
function saveMusicMute(m: boolean) {
  try {
    localStorage.setItem(MUSIC_MUTE_KEY, m ? "1" : "0");
  } catch {}
}

function saveCompactMode(v: boolean) {
  try {
    localStorage.setItem(COMPACT_MODE_KEY, v ? "1" : "0");
  } catch {}
}

// load/save Run Loadout window layout
function defaultLoadoutBox(): LoadoutBox {
  try {
    const ww = typeof window !== "undefined" ? window.innerWidth : 1200;
    const x = Math.max(24, ww - 360 - 24);
    return clampLoadoutBoxToWindow({ x, y: 120, w: 320, h: 560 });
  } catch {
    return clampLoadoutBoxToWindow({ x: 24, y: 120, w: 320, h: 560 });
  }
}

function compactLoadoutBox(): LoadoutBox {
  try {
    const ww = typeof window !== "undefined" ? window.innerWidth : 1200;
    const x = Math.max(12, ww - 320 - 12);
    return clampLoadoutBoxToWindow({ x, y: 92, w: 300, h: 440 });
  } catch {
    return clampLoadoutBoxToWindow({ x: 12, y: 92, w: 300, h: 440 });
  }
}
function loadLoadoutBox(): LoadoutBox {
  try {
    const raw = localStorage.getItem(LOADOUT_BOX_KEY);
    if (!raw) return defaultLoadoutBox();
    const obj = JSON.parse(raw);
    const x = Number(obj?.x);
    const y = Number(obj?.y);
    const w = Number(obj?.w);
    const h = Number(obj?.h);
    if (![x, y, w, h].every((n) => Number.isFinite(n))) return defaultLoadoutBox();
    return clampLoadoutBoxToWindow({
      x: Math.max(0, x),
      y: Math.max(0, y),
      w: Math.max(280, w),
      h: Math.max(260, h),
    });
  } catch {
    return defaultLoadoutBox();
  }
}
function saveLoadoutBox(next: LoadoutBox) {
  try {
    localStorage.setItem(LOADOUT_BOX_KEY, JSON.stringify(next));
  } catch {}
}

function formatDuration(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export default function App() {
  const [state, dispatch] = useReducer(reducer as any, initialState as any);
  const [topBarExpanded, setTopBarExpanded] = useState(false);

  // Cross-device resume code modal
  const [runCodeOpen, setRunCodeOpen] = useState(false);
  const [runCodeCopied, setRunCodeCopied] = useState(false);
  const [runCodeModalErr, setRunCodeModalErr] = useState<string | null>(null);
  
  // Event inventory hover highlights (gold/HP/supplies)
  const [invHoverTargets, setInvHoverTargets] = useState<
    { gold?: boolean; hp?: "heal" | "damage"; supplyIds?: string[] } | null
  >(null);

  // Flash gold badge (gold border) when gold is REMOVED (spent/lost).
  const [goldSpendFlashNonce, setGoldSpendFlashNonce] = useState(0);
  const [goldSpendFlashOn, setGoldSpendFlashOn] = useState(false);
  const prevGoldForSpendFlashRef = useRef<number | null>(null);
  const prevRunStartForSpendFlashRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const curGold = Number(state.gold ?? 0);
    const curRunStart = (state as any).runStartMs ?? null;

    if (prevGoldForSpendFlashRef.current === null) {
      prevGoldForSpendFlashRef.current = curGold;
      prevRunStartForSpendFlashRef.current = curRunStart;
      return;
    }

    if (prevRunStartForSpendFlashRef.current !== curRunStart) {
      prevRunStartForSpendFlashRef.current = curRunStart;
      prevGoldForSpendFlashRef.current = curGold;
      return;
    }

    const prevGold = prevGoldForSpendFlashRef.current;
    if (curGold < prevGold) {
      setGoldSpendFlashNonce((n) => n + 1);
    }
    prevGoldForSpendFlashRef.current = curGold;
  }, [state.gold, (state as any).runStartMs]);
  useEffect(() => {
    if (goldSpendFlashNonce === 0) return;
    setGoldSpendFlashOn(true);
    const t = window.setTimeout(() => setGoldSpendFlashOn(false), 700);
    return () => window.clearTimeout(t);
  }, [goldSpendFlashNonce]);

  // Flash HP badge when HP is LOST (damage). Useful feedback for wrong answers / traps.
  const [hpDamageFlashNonce, setHpDamageFlashNonce] = useState(0);
  const [hpDamageFlashOn, setHpDamageFlashOn] = useState(false);

  // Floating red HP loss numbers on the Run Loadout HP badge (for event/overworld damage).
  type HpBadgePopup = { id: string; amount: number; kind: "damage" | "heal"; createdAt: number };
  const [hpBadgePopups, setHpBadgePopups] = useState<HpBadgePopup[]>([]);
  const spawnHpBadgePopup = (kind: "damage" | "heal", amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const id = `hpBadge:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const popup: HpBadgePopup = { id, amount, kind, createdAt: Date.now() };
    setHpBadgePopups((prev) => [...prev, popup]);
    window.setTimeout(() => {
      setHpBadgePopups((prev) => prev.filter((p) => p.id !== id));
    }, 1400);
  };

  const prevHpForDamageFlashRef = useRef<number | null>(null);
  const prevRunStartForHpFlashRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const curHp = Number(state.hp ?? 0);
    const curRunStart = (state as any).runStartMs ?? null;

    if (prevHpForDamageFlashRef.current === null) {
      prevHpForDamageFlashRef.current = curHp;
      prevRunStartForHpFlashRef.current = curRunStart;
      return;
    }

    if (prevRunStartForHpFlashRef.current !== curRunStart) {
      prevRunStartForHpFlashRef.current = curRunStart;
      prevHpForDamageFlashRef.current = curHp;
      setHpBadgePopups([]);
      return;
    }

    const prevHp = prevHpForDamageFlashRef.current;
    if (curHp < prevHp) {
      const amt = Math.max(1, Math.floor(prevHp - curHp));
      setHpDamageFlashNonce((n) => n + 1);
      // Avoid doubling up with the battle UI popups; only show this badge popup outside battles.
      if (String(state.screen ?? "") !== "BATTLE") {
        try {
          spawnHpBadgePopup("damage", amt);
        } catch {}
      }
    }

    if (curHp > prevHp) {
      const amt = Math.max(1, Math.floor(curHp - prevHp));
      // Avoid doubling up with the battle UI popups; only show this badge popup outside battles.
      if (String(state.screen ?? "") !== "BATTLE") {
        try {
          spawnHpBadgePopup("heal", amt);
        } catch {}
      }
    }

    prevHpForDamageFlashRef.current = curHp;
  }, [state.hp, state.screen, (state as any).runStartMs]);
  useEffect(() => {
    if (hpDamageFlashNonce === 0) return;
    setHpDamageFlashOn(true);
    const t = window.setTimeout(() => setHpDamageFlashOn(false), 700);
    return () => window.clearTimeout(t);
  }, [hpDamageFlashNonce]);

  // Flash a ghost badge for supplies that were just removed, so players see what was lost.
  const [ghostRemovedSupplies, setGhostRemovedSupplies] = useState<{ id: string; until: number; nonce: number }[]>([]);
  const prevSupplyIdsRef = useRef<string[] | null>(null);
  const prevRunStartForSuppliesRef = useRef<number | null>(null);
  useEffect(() => {
    const curRunStart = (state as any).runStartMs ?? null;
    const cur = (state.currentSupplyIds ?? []).slice();

    if (prevSupplyIdsRef.current === null) {
      prevSupplyIdsRef.current = cur;
      prevRunStartForSuppliesRef.current = curRunStart;
      return;
    }

    if (prevRunStartForSuppliesRef.current !== curRunStart) {
      prevRunStartForSuppliesRef.current = curRunStart;
      prevSupplyIdsRef.current = cur;
      setGhostRemovedSupplies([]);
      return;
    }

    const prev = prevSupplyIdsRef.current;
    const removed = prev.filter((id) => !cur.includes(id));
    if (removed.length) {
      const now = Date.now();
      setGhostRemovedSupplies((old) => [
        ...old.filter((g) => g.until > now),
        ...removed.map((id) => ({ id, until: now + 1100, nonce: now + Math.floor(Math.random() * 100000) })),
      ]);
    }
    prevSupplyIdsRef.current = cur;
  }, [state.currentSupplyIds, (state as any).runStartMs]);
  useEffect(() => {
    if (!ghostRemovedSupplies.length) return;
    const t = window.setInterval(() => {
      const now = Date.now();
      setGhostRemovedSupplies((old) => old.filter((g) => g.until > now));
    }, 120);
    return () => window.clearInterval(t);
  }, [ghostRemovedSupplies.length]);

  // Auto-clear hover targets when leaving an event node.
  useEffect(() => {
    const isEventNode = state.screen === "NODE" && (state.nodeScreen as any)?.type === "EVENT";
    if (!isEventNode && invHoverTargets) setInvHoverTargets(null);
  }, [state.screen, (state as any).nodeScreen?.type]);


  // --- SFX warmup/unlock ---
  // Vite/Netlify builds + mobile Safari benefit a lot from preloading common file SFX and
  // unlocking WebAudio on the first user interaction (prevents "late" playback).
  useEffect(() => {
    try {
      sfx.preloadCommon();
    } catch {}

    let unlocked = false;
    const unlockOnce = () => {
      if (unlocked) return;
      unlocked = true;
      try {
        sfx.unlock();
        sfx.preloadCommon();
      } catch {}
    };

    window.addEventListener("pointerdown", unlockOnce, { passive: true });
    window.addEventListener("touchstart", unlockOnce, { passive: true });
    window.addEventListener("keydown", unlockOnce);

    return () => {
      window.removeEventListener("pointerdown", unlockOnce);
      window.removeEventListener("touchstart", unlockOnce);
      window.removeEventListener("keydown", unlockOnce);
    };
  }, []);

  // Play coin SFX any time gold changes (gain OR spend), everywhere (shops, rewards, events, debug).
  // We suppress it on NEW_RUN initialization so starting a run doesn't "ding".
  const prevGoldRef = useRef<number | null>(null);
  const prevRunStartRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const curGold = Number(state.gold ?? 0);
    const curRunStart = (state as any).runStartMs ?? null;

    // First render: seed refs, no sound.
    if (prevGoldRef.current === null) {
      prevGoldRef.current = curGold;
      prevRunStartRef.current = curRunStart;
      return;
    }

    // New run: reset refs, no sound.
    if (prevRunStartRef.current !== curRunStart) {
      prevRunStartRef.current = curRunStart;
      prevGoldRef.current = curGold;
      return;
    }

    const prevGold = prevGoldRef.current;
    if (prevGold !== curGold) {
      try {
        sfx.coinDrop();
      } catch {}
    }
    prevGoldRef.current = curGold;
  }, [state.gold, (state as any).runStartMs]);
  const [now, setNow] = useState(() => Date.now());
  const [bestMs, setBestMs] = useState<number | null>(() => loadBestMs());

  const [sfxVol, setSfxVol] = useState(loadSfxVol());
  const [sfxMute, setSfxMute] = useState(loadSfxMute());
  const [musicVol, setMusicVol] = useState(loadMusicVol());
  const [musicMute, setMusicMute] = useState(loadMusicMute());
  const [compactMode, setCompactMode] = useState(loadCompactMode());

  const [showDeck, setShowDeck] = useState(false);
  const [consumableModalId, setConsumableModalId] = useState<string | null>(null);
  const [trashRemoveOpen, setTrashRemoveOpen] = useState(false);
  const [trashPick, setTrashPick] = useState<string | null>(null);
  const [trashPickId, setTrashPickId] = useState<string | null>(null);

  // Run Loadout draggable/resizable window state
  const [loadoutBox, setLoadoutBox] = useState<LoadoutBox>(() => loadLoadoutBox());

  // Viewport (used for responsive loadout bounds + min sizes)
  const [viewport, setViewport] = useState(() => {
    try {
      return {
        w: typeof window !== "undefined" ? window.innerWidth : 1200,
        h: typeof window !== "undefined" ? window.innerHeight : 800,
      };
    } catch {
      return { w: 1200, h: 800 };
    }
  });

  // Track viewport changes robustly (window resize + mobile visual viewport).
  useEffect(() => {
    let raf = 0;
    const update = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try {
          setViewport({
            w: window.innerWidth,
            h: window.innerHeight,
          });
        } catch {}
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    const vv = (window as any).visualViewport as VisualViewport | undefined;
    if (vv) {
      vv.addEventListener("resize", update);
      vv.addEventListener("scroll", update);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      if (vv) {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
      }
    };
  }, []);

  const resetLoadoutBox = () => {
    const d = defaultLoadoutBox();
    setLoadoutBox(d);
    saveLoadoutBox(d);
  };

  // floating tip state (rendered to body)
  const [floatingTip, setFloatingTip] = useState<FloatingTip | null>(null);

  const charById = useMemo(() => new Map(CHARACTERS_3.map((c) => [c.id, c])), []);
  const supplyById = useMemo(() => new Map(SUPPLIES_POOL_10.map((s) => [s.id, s])), []);
  const consumableById = useMemo(() => new Map(CONSUMABLES_10.map((c) => [c.id, c])), []);
  const cardById = useMemo(() => new Map(ALL_CARDS_40ish.map((c) => [c.id, c])), []);

  const setup = state.setup ?? null;

  function consumableIcon(id: string | null | undefined): string {
    switch (id) {
      case "con_apple": return "🍎";
      case "con_sandwich": return "🥪";
      case "con_rain_coat": return "🧥";
      case "con_cookie": return "🍪";
      case "con_shake": return "🥤";
      case "con_trailmix": return "🥜";
      case "con_water": return "💧";
      case "con_eraser": return "🧽";
      case "con_chips": return "🍟";
      case "con_answer_key": return "🔑";
      case "con_moldy_food": return "🤢";
      case "con_absence_note": return "📝";
      case "con_cheat_sheet": return "📄";
      case "con_trash_bin": return "🗑️";

      // legacy ids
      case "con_banana": return "🍌";
      case "con_juice": return "🧃";
      case "con_yogurt": return "🥣";
      case "con_granola": return "🥣";
      default: return "🎒";
    }
  }

  function deckCounts() {
    const ids = setup?.deckCardIds ?? [];
    const counts = new Map<string, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);

    const rows = Array.from(counts.entries())
      .map(([id, count]) => {
        const def = cardById.get(id);
        return { id, count, name: def?.name ?? id, type: def?.type ?? "?" };
      })
      .sort((a, b) => (a.type + a.name).localeCompare(b.type + a.name));

    return rows;
  }

  const DeckModal = !showDeck ? null : (
    <div
      onClick={() => setShowDeck(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
      }}
    >
      <div
        className="panel"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(760px, 100%)", maxHeight: "80vh", overflow: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Your Deck</div>
          <button className="btn" onClick={() => setShowDeck(false)}>
            Close
          </button>
        </div>

        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          {setup?.deckCardIds?.length ?? 0} cards total
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {deckCounts().map((r) => {
            const def = cardById.get(r.id);
            const name = def?.name ?? r.id;
            const type = def?.type ?? "?";
            const desc = cardDescForUi(def as any);
            const rarity = String((def as any)?.rarity ?? "Common");
            const isNeg = String(r.id ?? "").startsWith("neg_");

            return (
              <div
                key={r.id}
                className={
                  "panel soft deck-row cardTile rarity-" +
                  rarity.toLowerCase() +
                  (isNeg ? " negativeCard" : "")
                }
                onMouseEnter={() => sfx.cardHover()}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>{name}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {type}
                  </div>
                  <div
                    className="muted"
                    style={{ fontSize: 12, marginTop: 8 }}
                    title={(def as any)?.exhaust ? EXHAUST_TOOLTIP : undefined}
                  >
                    {desc}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div className="badge" title="Energy cost">
                    ⚡ <strong>{def?.cost ?? 0}</strong>
                  </div>
                  <div className="badge" title="Rarity">
                    {rarity}
                  </div>
                  <div className="badge">
                    x <strong>{r.count}</strong>
                  </div>
                </div>
              </div>
            );

          })}
        </div>
      </div>
    </div>
  );

  const TrashRemoveModal = !trashRemoveOpen ? null : (
    <div
      onClick={() => { setTrashRemoveOpen(false); setTrashPick(null); setTrashPickId(null); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
      }}
    >
      <div
        className="panel"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(860px, 100%)", maxHeight: "80vh", overflow: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Trash Bin — Remove a Card</div>
          <button className="btn" onClick={() => { setTrashRemoveOpen(false); setTrashPick(null); setTrashPickId(null); }}>
            Cancel
          </button>
        </div>

        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          Select a card to remove permanently. Cost: 🪙 <strong>0</strong>
        </div>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {(setup?.deckCardIds ?? []).map((cid: string, idx: number) => {
            const def: any = cardById.get(cid);
            const rarity = String(def?.rarity ?? "Common").toLowerCase();
            const isNeg = String(cid ?? "").startsWith("neg_");
            const pickKey = `${cid}:${idx}`;
            const selected = trashPick === pickKey;
            const title = `${def?.name ?? cid}\n${cardDescForUi(def as any)}${(def as any)?.exhaust ? `\n${EXHAUST_TOOLTIP}` : ""}\nRarity: ${String(def?.rarity ?? "Common")}`;

            return (
              <button
                key={pickKey}
                className={
                  "handCard panel soft cardTile shopCardTile " +
                  `rarity-${rarity}` +
                  (isNeg ? " negativeCard" : "") +
                  (selected ? " selected" : "")
                }
                style={{
                  width: 205,
                  minWidth: 205,
                  height: 132,
                  minHeight: 132,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  textAlign: "left",
                  cursor: "pointer",
                  outline: selected ? "4px solid rgba(255,255,255,0.85)" : "none",
                  outlineOffset: 2,
                }}
                onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
                onClick={() => {
                  try { sfx.click(); } catch {}
                  setTrashPick(pickKey);
                  setTrashPickId(cid);
                }}
                title={title}
              >
                <div style={{ position: "relative" }}>
                  {selected ? (
                    <div
                      className="badge"
                      style={{
                        position: "absolute",
                        right: 0,
                        top: 0,
                        transform: "translate(6px, -6px)",
                        background: "rgba(239,68,68,0.18)",
                        borderColor: "rgba(239,68,68,0.55)",
                        color: "rgba(255,255,255,0.95)",
                        pointerEvents: "none",
                      }}
                      aria-hidden
                    >
                      ✕
                    </div>
                  ) : null}
                  <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {def?.name ?? cid}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {cardDescForUi(def as any)}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div className="badge" title="Energy cost">
                    ⚡ <strong>{def?.cost ?? 0}</strong>
                  </div>
                  <div className="badge" title="Rarity">{String(def?.rarity ?? "Common")}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
          <button
            className="btn danger"
            disabled={!trashPickId}
            onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
            onClick={() => {
              if (!trashPickId) return;
              try { sfx.confirm(); } catch {}
              dispatch({ type: "TRASH_BIN_REMOVE_CARD", cardId: trashPickId } as any);
              setTrashRemoveOpen(false);
              setTrashPick(null);
              setTrashPickId(null);
            }}
          >
            Confirm Remove
          </button>
        </div>
      </div>
    </div>
  );

  const RunCodeModal = !runCodeOpen
    ? null
    : (() => {
        let code = "";
        let err: string | null = null;
        try {
          code = encodeRunCode(state as any);
        } catch (e: any) {
          err = e?.message ?? String(e);
        }

        const copy = async () => {
          try {
            if (!code) return;
            if (navigator?.clipboard?.writeText) {
              await navigator.clipboard.writeText(code);
            } else {
              // Fallback: temporary textarea
              const ta = document.createElement("textarea");
              ta.value = code;
              ta.style.position = "fixed";
              ta.style.left = "-9999px";
              ta.style.top = "-9999px";
              document.body.appendChild(ta);
              ta.select();
              document.execCommand("copy");
              document.body.removeChild(ta);
            }
            setRunCodeCopied(true);
            setRunCodeModalErr(null);
            try { sfx.confirm(); } catch {}
          } catch (e: any) {
            setRunCodeModalErr(e?.message ?? String(e));
            try { sfx.bad(); } catch {}
          }
        };

        return (
          <div
            onClick={() => {
              setRunCodeOpen(false);
              setRunCodeCopied(false);
              setRunCodeModalErr(null);
            }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10000,
              background: "rgba(0,0,0,0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <div
              className="panel"
              onClick={(e) => e.stopPropagation()}
              style={{ width: "min(860px, 96vw)", maxHeight: "85vh", overflow: "auto" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 900 }}>📋 Resume Code</div>
                <button
                  className="btn"
                  onClick={() => {
                    setRunCodeOpen(false);
                    setRunCodeCopied(false);
                    setRunCodeModalErr(null);
                  }}
                >
                  Close
                </button>
              </div>

              <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                Copy this code to continue your run on another device (Title Screen → Resume Run).
              </div>

              {err ? (
                <div style={{ marginTop: 10 }} className="muted">
                  Could not generate code: <strong>{err}</strong>
                </div>
              ) : (
                <>
                  <textarea
                    value={code}
                    readOnly
                    onFocus={(e) => e.currentTarget.select()}
                    style={{
                      width: "100%",
                      marginTop: 12,
                      minHeight: 120,
                      padding: 10,
                      fontSize: 12,
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                    }}
                  />

                  {runCodeModalErr ? (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 10,
                        border: "1px solid rgba(255,0,0,0.35)",
                        background: "rgba(255,0,0,0.08)",
                        borderRadius: 10,
                        color: "#ff6b6b",
                      }}
                    >
                      {runCodeModalErr}
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
                    <button className="btn" onClick={copy}>
                      {runCodeCopied ? "Copied ✅" : "Copy"}
                    </button>
                    <button
                      className="btn primary"
                      onClick={() => {
                        // Also close, to reduce friction.
                        setRunCodeOpen(false);
                        setRunCodeCopied(false);
                        setRunCodeModalErr(null);
                      }}
                    >
                      Done
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })();

  // Boss intro overlay state
  const [bossIntro, setBossIntro] = useState<null | { nodeId: string; difficulty: 1 | 2 | 3 }>(null);

  const rng = useMemo(() => makeRng(state.seed), [state.seed]);

  useEffect(() => {
    sfx.setVolume(sfxVol);
    sfx.setMuted(sfxMute);
  }, [sfxVol, sfxMute]);

  useEffect(() => {
    try {
      music.setMusicVolume(musicVol);
      music.setMusicMuted(musicMute);

      if (!music.isBossActive() && !musicMute) {
        music.playBgm();
      }
    } catch {}
  }, [musicVol, musicMute]);

  // Unlock music on first user gesture (autoplay restrictions)
  const musicUnlockedRef = useRef(false);
  useEffect(() => {
    const unlock = () => {
      if (musicUnlockedRef.current) return;
      musicUnlockedRef.current = true;
      try {
        music.unlockFromUserGesture();
        music.setMusicVolume(musicVol);
        music.setMusicMuted(musicMute);
        if (!musicMute) music.playBgm();
      } catch {}
    };

    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock as any);
      window.removeEventListener("keydown", unlock as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      // Warm up file-based sfx so they fire instantly (important for gold pickup, upgrades, etc.)
      (sfx as any).preloadCommon?.();
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (compactMode) document.body.classList.add("compactMode");
      else document.body.classList.remove("compactMode");
    } catch {}
  }, [compactMode]);

  useEffect(() => {
    const running = state.runStartMs != null && state.runEndMs == null && state.screen !== "TITLE";
    if (!running) return;

    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [state.runStartMs, state.runEndMs, state.screen]);

  useEffect(() => {
    if (state.runStartMs == null || state.runEndMs == null) return;
    const finalMs = state.runEndMs - state.runStartMs;
    if (finalMs <= 0) return;

    setBestMs((prev) => {
      const stored = loadBestMs();
      const currentBest = prev ?? stored;
      if (currentBest == null || finalMs < currentBest) {
        saveBestMs(finalMs);
        return finalMs;
      }
      return currentBest;
    });
  }, [state.runStartMs, state.runEndMs]);

  const restartRun = () => {
    setBossIntro(null);
    sfx.confirm();
    dispatch({ type: "NEW_RUN" });
  };

  const elapsedMs = state.runStartMs == null ? 0 : (state.runEndMs ?? now) - state.runStartMs;

  const timerBadge = (
    <span className={"badge " + (state.runEndMs ? "good" : "")}>
      Run Time <strong>{formatDuration(elapsedMs)}</strong>
    </span>
  );

  const bestBadge = (
    <span className="badge">
      Best <strong>{bestMs == null ? "—" : formatDuration(bestMs)}</strong>
    </span>
  );

  const sfxControls = (
    <span className="badge" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <button
        className="btn btn-sm"
        onClick={() => {
          const next = !sfxMute;
          setSfxMute(next);
          saveSfxMute(next);
          if (!next) sfx.click();
        }}
        title={sfxMute ? "Unmute SFX" : "Mute SFX"}
      >
        {sfxMute ? "🔇" : "🔊"}
      </button>

      <span className="muted" style={{ fontSize: 12 }}>SFX</span>

      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={sfxVol}
        onChange={(e) => setSfxVol(Number(e.target.value))}
        style={{ width: 80 }}
        title="SFX Volume"
      />
    </span>
  );

  
  
  const musicControls = (
    <span className="badge" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <button
        className="btn btn-sm"
        onClick={() => {
          const next = !musicMute;
          setMusicMute(next);
          saveMusicMute(next);
          if (!next) {
            try { music.playBgm(); } catch {}
            try { sfx.click(); } catch {}
          }
        }}
        title={musicMute ? "Unmute Music" : "Mute Music"}
      >
        {musicMute ? "🔇" : "🎵"}
      </button>

      <span className="muted" style={{ fontSize: 12 }}>MUSIC</span>

      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={musicVol}
        onChange={(e) => {
          const v = Number(e.target.value);
          setMusicVol(v);
          saveMusicVol(v);
          try { music.setMusicVolume(v); } catch {}
        }}
        style={{ width: 80 }}
        title="Music Volume"
      />
    </span>
  );

  const bossOverlay = bossIntro ? (
    <div
      onClick={() => startBossBattleNow(bossIntro)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "radial-gradient(circle at 50% 40%, rgba(255,255,255,0.10), rgba(0,0,0,0.92))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        cursor: "pointer",
      }}
    >
      <div
        className="panel"
        style={{
          maxWidth: 720,
          width: "100%",
          textAlign: "center",
          border: "1px solid rgba(255,255,255,0.18)",
          boxShadow: "0 20px 80px rgba(0,0,0,0.55)",
        }}
      >
        <div style={{ fontSize: 12, letterSpacing: 2, opacity: 0.85 }}>FINAL ENCOUNTER</div>
        <div style={{ fontSize: 44, fontWeight: 800, marginTop: 6, lineHeight: 1.05 }}>
          THE FINAL BOSS
        </div>
        <div style={{ marginTop: 10, opacity: 0.85 }}>The Grand Equation awaits.</div>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
          <button
            className="btn primary"
            onClick={(e) => {
              e.stopPropagation();
              startBossBattleNow(bossIntro);
            }}
          >
            Enter Boss
          </button>
          <button
            className="btn"
            onClick={(e) => {
              e.stopPropagation();
              setBossIntro(null);
            }}
          >
            Cancel
          </button>
        </div>

        <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
          (click anywhere to enter)
        </div>
      </div>
    </div>
  ) : null;

  const TopBar = (label: string) => (
    <div className="topBarSticky">
      <div className="container" style={{ paddingBottom: 0 }}>
        <div className="panel soft" style={{ padding: compactMode ? 10 : 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
              <span className="badge">{label}</span>
              {timerBadge}
              {bestBadge}
              {sfxControls}
              {musicControls}
              <button
                className={"btn btn-sm " + (compactMode ? "primary" : "")}
                onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
                onClick={() => {
                  try { sfx.click(); } catch {}
                  setCompactMode((prev) => {
                    const next = !prev;
                    saveCompactMode(next);
                    return next;
                  });
                }}
                title="Compact Mode (tighter layout)"
              >
                Compact {compactMode ? "ON" : "OFF"}
              </button>
            </div>

            <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
              <button className="btn btn-sm danger" onClick={restartRun}>
                Restart
              </button>
              <button
                className={"btn btn-sm" + (topBarExpanded ? " primary" : "")}
                onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
                onClick={() => {
                  try { sfx.click(); } catch {}
                  setTopBarExpanded((v) => !v);
                }}
                title="Toggle settings"
              >
                {topBarExpanded ? "Hide" : "Settings"}
              </button>
            </div>
          </div>

          {topBarExpanded && (
            <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="badge">
                  Seed <strong>{state.seed}</strong>
                </span>
                <button
                  className="btn btn-sm"
                  onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
                  onClick={() => {
                    try { sfx.click(); } catch {}
                    setRunCodeCopied(false);
                    setRunCodeModalErr(null);
                    setRunCodeOpen(true);
                  }}
                  title="Copy/paste a code to resume this run on another device"
                >
                  Run Code
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

    const finalBossMusicRef = useRef(false);

// Boss intro: enter boss battle (includes deckCardIds)
  const startBossBattleNow = (payload: { nodeId: string; difficulty: 1 | 2 | 3 }) => {
    setBossIntro(null);
    try { finalBossMusicRef.current = true; music.startBoss({ restart: true }); } catch {}
    dispatch({
      type: "START_BATTLE",
      nodeId: payload.nodeId,
      isBoss: true,
      difficulty: payload.difficulty,
      deckCardIds: state.setup?.deckCardIds ?? [],
    });
  };

  // Boss intro auto-advance (ONLY for teacher testing)
  useEffect(() => {
    if (!bossIntro) return;
    if (!state.teacherUnlocked) return;

    const t = window.setTimeout(() => startBossBattleNow(bossIntro), 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bossIntro, state.teacherUnlocked]);

  useEffect(() => {
    if (!finalBossMusicRef.current) return;
    if (state.screen !== "BATTLE") {
      finalBossMusicRef.current = false;
      try { music.stopBoss(true); } catch {}
    }
  }, [state.screen]);


  // ---------- Global Loadout Overlay (shows on ALL screens except TITLE/SETUP) ----------
  const showLoadoutOverlay =
    state.setupDone &&
    !!setup &&
    state.screen !== "TITLE" &&
    state.screen !== "SETUP";

  // Keep the Run Loadout window on-screen (important when the viewport becomes smaller).
  useEffect(() => {
    if (!showLoadoutOverlay) return;

    const clampNow = () => {
      setLoadoutBox((prev) => {
        const next = clampLoadoutBoxToWindow(prev);
        if (next.x === prev.x && next.y === prev.y && next.w === prev.w && next.h === prev.h) return prev;
        saveLoadoutBox(next);
        return next;
      });
    };

    // Clamp immediately and whenever the viewport changes.
    clampNow();
    return undefined;
  }, [showLoadoutOverlay, viewport.w, viewport.h]);

  const tipNode = floatingTip
    ? (() => {
        const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
        const vh = typeof window !== "undefined" ? window.innerHeight : 800;

        const maxW = 320;
        const pad = 12;

        let left = floatingTip.x + 14;
        let top = floatingTip.y + 14;

        if (left + maxW + pad > vw) left = Math.max(pad, vw - maxW - pad);
        if (top + 120 + pad > vh) top = Math.max(pad, vh - 120 - pad);

        return createPortal(
          <div
            style={{
              position: "fixed",
              left,
              top,
              zIndex: 100000,
              pointerEvents: "none",
              maxWidth: maxW,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(15,18,28,0.92)",
              boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
              color: "rgba(255,255,255,0.92)",
              fontSize: 12,
              lineHeight: 1.35,
              whiteSpace: "normal",
            }}
          >
            {floatingTip.text}
          </div>,
          document.body
        );
      })()
    : null;

  const LoadoutOverlay = !showLoadoutOverlay ? null : (() => {
    const char = setup ? charById.get(setup.characterId) : null;
    const supply = setup?.supplyId ? supplyById.get(setup.supplyId) : null;
    const consumables = ((state as any).consumables ?? [])
      .map((id: string) => consumableById.get(id))
      .filter(Boolean);

    const inBattle = state.screen === "BATTLE" && !!state.battle;
    const b = state.battle;
    const enemiesAlive = !!b && Array.isArray((b as any).enemies) ? ((b as any).enemies as any[]).some((en) => (en?.hp ?? 0) > 0) : ((b?.enemyHP ?? 0) > 0);
    const battleOver = !!b && ((b.playerHP ?? 0) <= 0 || !enemiesAlive);
    const canUseConsumables = inBattle && !!b && !battleOver;

    const supplyTip = supply
      ? `${supply.name}${supply.desc ? ` — ${supply.desc}` : ""}`
      : "";

    return (
      <>
        <Rnd
          bounds="window"
          size={{ width: loadoutBox.w, height: loadoutBox.h }}
          position={{ x: loadoutBox.x, y: loadoutBox.y }}
          // On smaller screens, the panel must be allowed to shrink so it doesn't get pushed off-screen.
          minWidth={Math.min(280, Math.max(220, viewport.w - 16))}
          // Allow shrinking below the old 460px floor so the panel remains usable while resizing.
          minHeight={Math.min(320, Math.max(240, viewport.h - 16))}
          dragHandleClassName="runLoadoutHandle"
          onDragStop={(_, d) => {
            const next: LoadoutBox = clampLoadoutBoxToWindow({ ...loadoutBox, x: d.x, y: d.y });
            setLoadoutBox(next);
            saveLoadoutBox(next);
          }}
          onResizeStop={(_, __, ref, ___, pos) => {
            const next: LoadoutBox = clampLoadoutBoxToWindow({
              x: pos.x,
              y: pos.y,
              w: ref.offsetWidth,
              h: ref.offsetHeight,
            });
            setLoadoutBox(next);
            saveLoadoutBox(next);
          }}
          style={{ zIndex: 9999 }}
        >
          <div className="panel runLoadoutPanel" style={{ height: "100%", overflow: "auto" }}>
            <div className="runLoadoutInner">
              <div
                className="runLoadoutHandle"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  cursor: "move",
                  userSelect: "none",
                  paddingBottom: 10,
                  borderBottom: "1px solid rgba(255,255,255,0.10)",
                }}
                title="Drag to move. Resize from edges/corners."
                onMouseEnter={() => sfx.cardHover()}
              >
                <div style={{ fontSize: 16, fontWeight: 800 }}>Run Loadout</div>
                <button
                  className="btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    sfx.click();
                    resetLoadoutBox();
                  }}
                  title="Reset position/size"
                >
                  Reset
                </button>
              </div>

              <div style={{ marginTop: 10 }} className="row">
                <span
                  className={
                    "badge" +
                    (invHoverTargets?.hp === "heal"
                      ? " invHiliteHpHeal"
                      : invHoverTargets?.hp === "damage"
                        ? " invHiliteHp"
                        : "")
                    + (hpDamageFlashOn ? " invFlashHp" : "")
                  }
                  style={{ position: "relative" }}
                >
                  HP <strong>{state.hp}/{state.maxHp}</strong>
                  {hpBadgePopups.map((p, i) => (
                    <span
                      key={p.id}
                      className={"hpBadgePopup" + (p.kind === "heal" ? " hpBadgePopupHeal" : "")}
                      style={{ top: -6 - i * 14 }}
                      aria-hidden
                    >
                      {p.kind === "heal" ? "+" : "-"}{p.amount}
                    </span>
                  ))}
                </span>
                <span
                  className={
                    "badge" +
                    (invHoverTargets?.gold ? " invHiliteGold" : "") +
                    (goldSpendFlashOn ? " invFlashGold" : "")
                  }
                >
                  🪙 Gold <strong>{state.gold}</strong>
                </span>
              </div>

              <div className="panel soft" style={{ marginTop: 10 }}>
                <div className="muted" style={{ fontSize: 12 }}>Character</div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
                  {(() => {
                    const sp = (setup as any)?.playerSprite;
                    if (sp && sp.kind === "image" && sp.src) {
                      return (
                        <img
                          src={sp.src}
                          alt={sp.alt ?? (setup as any)?.playerName ?? "Player"}
                          style={{ width: 46, height: 46, borderRadius: 12, objectFit: "cover" }}
                          draggable={false}
                        />
                      );
                    }
                    if (sp && sp.kind === "emoji") {
                      return <div style={{ fontSize: 34 }}>{sp.value}</div>;
                    }
                    return <div style={{ fontSize: 34 }}>{char?.emoji ?? "🙂"}</div>;
                  })()}

                  <div>
                    <div style={{ fontWeight: 800 }}>
                      {(setup as any)?.playerName ?? char?.name ?? (setup as any)?.characterId}
                    </div>
                  </div>
                </div>
              </div>

            {/* Supplies now behaves like consumables: hover tooltip + not clipped */}
            <div className="panel soft" style={{ marginTop: 10 }}>
              <div className="muted" style={{ fontSize: 12 }}>School Supplies</div>

              {(state.currentSupplyIds ?? []).length > 0 ? (
                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(state.currentSupplyIds ?? []).map((supplyId: string) => {
                    const s = supplyById.get(supplyId);
                    if (!s) return null;
                    const tip = `${s.name} — ${s.desc}`;
                    const restSitePillowFlash =
                      state.screen === "NODE" &&
                      (state as any).nodeScreen?.type === "REST" &&
                      supplyId === "sup_upgrade_rest";

                    const shopDiscountFlash =
                      state.screen === "NODE" &&
                      (state as any).nodeScreen?.type === "SHOP" &&
                      supplyId === "sup_shop_discount";
                    const hilite = !!invHoverTargets?.supplyIds?.includes(supplyId);
                    const shouldFlash = (state.supplyFlashIds ?? []).includes(supplyId);
                    return (
                  <span
                        key={"supply:" + supplyId + (shouldFlash ? ":sf" + String(state.supplyFlashNonce ?? 0) : "")}
                    className={
                      "badge" +
                      (shopDiscountFlash
                        ? " supplyFlashLoop"
                        : restSitePillowFlash
                          ? " supplyFlashLoop"
                          : shouldFlash
                            ? " supplyFlash"
                          : "") +
                      (hilite ? " invHiliteGold" : "")
                    }
                    onMouseEnter={(e) => {
                      sfx.cardHover();
                          setFloatingTip({ text: tip, x: e.clientX, y: e.clientY });
                    }}
                    onMouseMove={(e) => {
                      setFloatingTip((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev));
                    }}
                    onMouseLeave={() => setFloatingTip(null)}
                    style={{ cursor: "default" }}
                  >
                        {s.emoji ?? "📎"} {s.name}
                  </span>
                    );
                  })}

                  {ghostRemovedSupplies.map((g) => {
                    const s = supplyById.get(g.id);
                    if (!s) return null;
                    const tip = `${s.name} — ${s.desc} (lost)`;
                    return (
                      <span
                        key={`ghost-supply:${g.id}:${g.nonce}`}
                        className={"badge invFlashGold invGhost"}
                        onMouseEnter={(e) => {
                          try {
                            sfx.cardHover();
                          } catch {}
                          setFloatingTip({ text: tip, x: e.clientX, y: e.clientY });
                        }}
                        onMouseMove={(e) => {
                          setFloatingTip((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev));
                        }}
                        onMouseLeave={() => setFloatingTip(null)}
                        style={{ cursor: "default" }}
                      >
                        {s.emoji ?? "📎"} {s.name}
                      </span>
                    );
                  })}

                </div>
              ) : (
                <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                  None
                </div>
              )}
            </div>

            <div className="panel soft" style={{ marginTop: 10 }}>
              <div className="muted" style={{ fontSize: 12 }}>
                Consumables ({consumables.length}/3)
              </div>


              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {consumables.length ? (
                  consumables.map((c: any, i: number) => {
                    const tip = `${c.name}${c.desc ? ` — ${c.desc}` : ""}`;

                    return (
                      <span
                        key={c.id ?? i}
                        className="badge"
                        onClick={(e) => {
                          e.stopPropagation();
                          sfx.confirm();
                          setConsumableModalId(c.id);
                        }}
                        onMouseEnter={(e) => {
                          sfx.cardHover();
                          setFloatingTip({ text: tip, x: e.clientX, y: e.clientY });
                        }}
                        onMouseMove={(e) => {
                          setFloatingTip((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev));
                        }}
                        onMouseLeave={() => setFloatingTip(null)}
                        style={{ cursor: "pointer", opacity: 1 }}
                      >
                        {consumableIcon(c.id)} {c.name}
                      </span>
                    );
                  })
                ) : (
                  <span className="muted" style={{ fontSize: 12 }}>None</span>
                )}
              </div>
            </div>

              <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                <button className="btn primary" onClick={() => { sfx.click(); setShowDeck(true); }}>
                  View Deck
                </button>
              </div>
            </div>
          </div>
        </Rnd>

        {tipNode}
      </>
    );
  })();



  const ConsumableModal = !consumableModalId ? null : (() => {
    const def: any = consumableById.get(consumableModalId);
    if (!def) return null;

    const inBattle = state.screen === "BATTLE" && !!state.battle;
    const b = state.battle;
    const enemiesAlive = !!b && Array.isArray((b as any).enemies) ? ((b as any).enemies as any[]).some((en) => (en?.hp ?? 0) > 0) : ((b?.enemyHP ?? 0) > 0);
    const battleOver = !!b && ((b.playerHP ?? 0) <= 0 || !enemiesAlive);
    const questionOpen = inBattle && !!b && !!b.awaiting;
    const isAnswerKey = consumableModalId === "con_answer_key";
    const isWater = consumableModalId === "con_water";
    const isTrashBin = consumableModalId === "con_trash_bin";

    const canUse =
      (isWater && !inBattle) ||
      (isTrashBin && !inBattle) ||
      (inBattle && !!b && !battleOver && (!questionOpen || isAnswerKey || isWater));

    let reason = "";
    if (!inBattle && !isWater && !isTrashBin) reason = "Consumables can only be used during battle.";
    else if (!inBattle && (isWater || isTrashBin)) reason = "";
    else if (battleOver) reason = "Battle is over.";
    else if (questionOpen && !isAnswerKey && !isWater) reason = "Can't use consumables while a question is open (except Answer Key).";

    const tip = `${def.name}${def.desc ? ` — ${def.desc}` : ""}`;

    return (
      <div
        onClick={() => setConsumableModalId(null)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 200,
          padding: 16,
        }}
      >
        <div
          className="panel"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "min(520px, 96vw)",
            maxHeight: "80vh",
            overflow: "auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>
              {consumableIcon(consumableModalId)} {def.name}
            </div>
            <button className="btn" onClick={() => setConsumableModalId(null)}>
              Close
            </button>
          </div>

          <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
            {tip}
          </div>

          {reason ? (
            <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
              {reason}
            </div>
          ) : null}

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="btn primary"
              disabled={!canUse}
              onClick={() => {
                sfx.confirm();
                if (isTrashBin) {
                  setConsumableModalId(null);
                  setTrashRemoveOpen(true);
                  setTrashPick(null);
                  setTrashPickId(null);
                  return;
                }
                dispatch({ type: "USE_CONSUMABLE", consumableId: consumableModalId } as any);
                setConsumableModalId(null);
              }}
              title={canUse ? "Use" : reason}
            >
              Use
            </button>

            <button
              className="btn"
              onClick={() => {
                sfx.click();
                dispatch({ type: "DISCARD_CONSUMABLE", consumableId: consumableModalId } as any);
                setConsumableModalId(null);
              }}
              title="Remove this consumable from your inventory"
            >
              Discard
            </button>
          </div>

          <div className="muted" style={{ marginTop: 12, fontSize: 11 }}>
            Tip: Discard is useful when your inventory is full and you want to take a different consumable reward.
          </div>
        </div>
      </div>
    );
  })();

  // ---------- Screens ----------


  // ---------- Wrong answer log export ----------
  const wrongAnswerLog = Array.isArray((state as any).wrongAnswerLog) ? ((state as any).wrongAnswerLog as any[]) : [];
  const canDownloadWrongAnswers = wrongAnswerLog.length > 0;

  const buildWrongAnswersText = () => {
    const lines: string[] = [];
    lines.push("Math the Spire - Wrong Answers Log");
    lines.push(`Seed: ${state.seed}`);
    if (state.runStartMs) lines.push(`Run start: ${new Date(state.runStartMs).toLocaleString()}`);
    if (state.runEndMs) lines.push(`Run end: ${new Date(state.runEndMs).toLocaleString()}`);
    lines.push(`Total wrong answers: ${wrongAnswerLog.length}`);
    lines.push("");

    wrongAnswerLog.forEach((e: any, i: number) => {
      const source = String(e?.source ?? "");
      const location = String(e?.location ?? "");
      const prompt = String(e?.prompt ?? "");
      const expected = String(e?.expected ?? "");
      const given = String(e?.given ?? "");
      const at = Number(e?.atMs);
      const atStr = Number.isFinite(at) ? new Date(at).toLocaleString() : "";

      lines.push(`${i + 1}. [${source}] ${location}${atStr ? ` (${atStr})` : ""}`);
      lines.push(`Q: ${prompt}`);
      lines.push(`Your answer: ${given}`);
      lines.push(`Correct answer: ${expected}`);
      lines.push("");
    });

    return lines.join("\n");
  };

  const downloadWrongAnswersTxt = () => {
    try {
      const txt = buildWrongAnswersText();
      const stamp = new Date().toISOString().replace(/[:]/g, "-").slice(0, 19);
      const filename = `maththespire_wrong_answers_${state.seed}_${stamp}.txt`;
      const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Failed to download wrong answers log", err);
    }
  };

  // Always-visible panel (details/summary can be easy to miss and some browsers/extensions
  // can style it oddly, making it look like it "isn't there").
  const WrongAnswersPanel = (
    <div style={{ marginTop: 14, textAlign: "left" }}>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>
        Wrong Answer Log ({wrongAnswerLog.length})
      </div>
      {canDownloadWrongAnswers ? (
        <div className="panel">
          <pre style={{ whiteSpace: "pre-wrap", maxHeight: 260, overflow: "auto", fontSize: 12, margin: 0 }}>
            {buildWrongAnswersText()}
          </pre>
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12 }}>
          No wrong answers were logged this run.
        </div>
      )}
    </div>
  );

  // ---------- Run stats (Victory screen) ----------
  const runStats = (() => {
    const cache = (state as any).nodeScreenCache ?? {};
    const cachedScreens: any[] = Object.values(cache ?? {});
    const visitedNodes = Object.keys(cache ?? {}).length;
    const maxCachedDepth = cachedScreens.reduce((m, s) => {
      const d = Number((s as any)?.depth ?? 0);
      return Number.isFinite(d) ? Math.max(m, d) : m;
    }, 0);
    const curDepth0 = Number((state.map as any)?.nodes?.[(state as any).currentNodeId ?? ""]?.depth ?? 0);
    const curDepth = Number.isFinite(curDepth0) ? curDepth0 : 0;
    const maxDepth = Math.max(maxCachedDepth, curDepth);

    const byType = (t: string) => cachedScreens.filter((s) => String((s as any)?.type ?? "") === t).length;
    const fights = byType("FIGHT");
    const challenges = byType("CHALLENGE");
    const events = byType("EVENT");
    const shops = byType("SHOP");
    const rests = byType("REST");
    const bosses = byType("BOSS");

    const deckIds: string[] = Array.isArray((state as any)?.setup?.deckCardIds) ? ((state as any).setup.deckCardIds as string[]) : [];
    const upgraded = deckIds.reduce((n, id) => ((cardById.get(id) as any)?.upgradeOf ? n + 1 : n), 0);
    const negative = deckIds.reduce((n, id) => (String(id).startsWith("neg_") ? n + 1 : n), 0);
    const uniqueCards = new Set(deckIds.map(String)).size;

    const durMs0 = (state.runStartMs && state.runEndMs) ? Number(state.runEndMs - state.runStartMs) : NaN;
    const durMs = Number.isFinite(durMs0) && durMs0 >= 0 ? durMs0 : null;
    const fmtDuration = (ms: number) => {
      const s = Math.floor(ms / 1000);
      const hh = Math.floor(s / 3600);
      const mm = Math.floor((s % 3600) / 60);
      const ss = s % 60;
      const pad = (x: number) => String(x).padStart(2, "0");
      return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
    };

    return {
      visitedNodes,
      maxDepth,
      fights,
      challenges,
      events,
      shops,
      rests,
      bosses,
      deckSize: deckIds.length,
      uniqueCards,
      upgraded,
      negative,
      supplies: Array.isArray((state as any).currentSupplyIds) ? ((state as any).currentSupplyIds as any[]).length : 0,
      consumables: Array.isArray((state as any).consumables) ? ((state as any).consumables as any[]).length : 0,
      wrongAnswers: wrongAnswerLog.length,
      durationText: durMs !== null ? fmtDuration(durMs) : "—",
    };
  })();

  if (state.screen === "TITLE") {
    return (
      <div>
        {bossOverlay}
        {ConsumableModal}
        {TrashRemoveModal}
        {RunCodeModal}
        <TitleScreen
          onStart={(seed) => {
            try { sfx.confirm(); } catch {}
            dispatch({ type: "NEW_RUN", seed });
          }}
          onResumeFromCode={(code) => {
            const res = decodeRunCode(code, { teacherUnlockedFallback: !!state.teacherUnlocked });
            if (!res.ok) {
              try { sfx.bad(); } catch {}
              return res.error;
            }

            try { sfx.confirm(); } catch {}
            setBossIntro(null);
            setRunCodeOpen(false);
            setRunCodeCopied(false);
            setRunCodeModalErr(null);
            dispatch({ type: "LOAD_STATE", state: res.state } as any);

            // Music: if resuming into final boss, swap to boss track.
            try {
              music.unlockFromUserGesture();
              music.setMusicVolume(musicVol);
              music.setMusicMuted(musicMute);

              const isBoss = res.state.screen === "BATTLE" && !!(res.state as any)?.battle?.isBoss;
              if (isBoss) {
                finalBossMusicRef.current = true;
                music.startBoss({ restart: false });
              } else {
                finalBossMusicRef.current = false;
                music.stopBoss(true);
                if (!musicMute) music.playBgm();
              }
            } catch {}

            return null;
          }}
        />
      </div>
    );
  }

  if (state.screen === "OVERWORLD") {
    return (
      <div>
        {bossOverlay}
        {ConsumableModal}
        {TrashRemoveModal}
        {RunCodeModal}
        {TopBar("Overworld")}

        <OverworldScreen
          map={state.map!}
          currentNodeId={state.currentNodeId!}
          setupDone={state.setupDone}
          gold={state.gold}
          teacherUnlocked={state.teacherUnlocked}
          lockedNodeIds={state.lockedNodeIds}
          onClickStart={() => {
            sfx.click();
            dispatch({ type: "OPEN_SETUP" });
          }}
          onOpenNode={(node: MapNode) => openNode(node)}
        />

        {LoadoutOverlay}
        {DeckModal}
      </div>
    );
  }

  if (state.screen === "SETUP") {
    return (
      <div>
        {bossOverlay}
        {ConsumableModal}
        {TrashRemoveModal}
        {RunCodeModal}
        {TopBar("Starting Area")}
        <SetupScreen
          seed={state.seed}
          teacherUnlocked={state.teacherUnlocked}
          lockedNodeIds={state.lockedNodeIds}
          onComplete={(setup2) => {
            sfx.confirm();
            dispatch({ type: "COMPLETE_SETUP", setup: setup2 });
          }}
        />
      </div>
    );
  }

  if (state.screen === "NODE" && state.nodeScreen) {
    return (
      <div>
        {bossOverlay}
        {ConsumableModal}
        {TrashRemoveModal}
        {RunCodeModal}
        {TopBar(`Node • ${state.nodeScreen.type} (Depth ${state.nodeScreen.depth})`)}
        <NodeScreen
          node={state.nodeScreen as any}
          gold={state.gold}
          hp={state.hp}
          maxHp={state.maxHp}
          deckCardIds={state.setup?.deckCardIds ?? []}
          supplyIds={state.currentSupplyIds ?? []}
          consumables={state.consumables ?? []}
          onBuy={(kind, id) => {
            dispatch({ type: "SHOP_BUY", kind: kind as any, id } as any);
          }}
          onShopRefresh={() => {
            dispatch({ type: "SHOP_REFRESH" } as any);
          }}
          onRemoveCard={(cardId: string) => {
            dispatch({ type: "SHOP_REMOVE_CARD", cardId } as any);
          }}
          onRestHeal={() => {
            dispatch({ type: "REST_HEAL" } as any);
          }}
          onRestUpgrade={(cardId) => {
            dispatch({ type: "REST_UPGRADE", cardId } as any);
          }}
          onEventChoose={(choiceId) => {
            try {
              console.log("[DISPATCH] EVENT_CHOOSE", {
                choiceId,
                screen: state.screen,
                nodeType: (state as any).nodeScreen?.type,
                eventId: (state as any).nodeScreen?.eventId,
                step: (state as any).nodeScreen?.step,
              });
            } catch {}
            dispatch({ type: "EVENT_CHOOSE", choiceId } as any);
          }}
          onEventPickUpgrade={(cardId) => {
            dispatch({ type: "EVENT_PICK_UPGRADE", cardId } as any);
          }}
          onEventPickCard={(cardId) => {
            dispatch({ type: "EVENT_PICK_CARD", cardId } as any);
          }}
          onEventPickConsumable={(consumableId) => {
            dispatch({ type: "EVENT_PICK_CONSUMABLE", consumableId } as any);
          }}
          onEventPickSupply={(supplyId) => {
            dispatch({ type: "EVENT_PICK_SUPPLY", supplyId } as any);
          }}
          onEventHallwayAnswer={(answer) => {
            try {
              console.log("[DISPATCH] EVENT_HALLWAY_ANSWER", {
                answer,
                screen: state.screen,
                nodeType: (state as any).nodeScreen?.type,
                eventId: (state as any).nodeScreen?.eventId,
                step: (state as any).nodeScreen?.step,
              });
            } catch {}
            dispatch({ type: "EVENT_HALLWAY_ANSWER", answer } as any);
          }}
          onEventGateAnswer={(answer) => {
            try {
              console.log("[DISPATCH] EVENT_GATE_ANSWER", {
                answer,
                screen: state.screen,
                nodeType: (state as any).nodeScreen?.type,
                eventId: (state as any).nodeScreen?.eventId,
                step: (state as any).nodeScreen?.step,
              });
            } catch {}
            dispatch({ type: "EVENT_GATE_ANSWER", answer } as any);
          }}
          onDiscardConsumable={(consumableId) => {
            dispatch({ type: "DISCARD_CONSUMABLE", consumableId } as any);
          }}
          onInventoryHoverChange={setInvHoverTargets}
          onComplete={() => {
            sfx.confirm();
            dispatch({ type: "CLOSE_NODE" });
          }}
        />
        {LoadoutOverlay}
        {DeckModal}
      </div>
    );
  }

  if (state.screen === "BATTLE") {
    if (!state.battle) {
      return (
        <div className="container">
          {TopBar("Battle")}
          <div className="panel">
            <div style={{ fontWeight: 900, fontSize: 18 }}>Battle failed to load</div>
            <div className="muted" style={{ marginTop: 8 }}>
              state.screen is BATTLE but state.battle is missing.
            </div>
            <button className="btn primary" onClick={() => dispatch({ type: "CLAIM_REWARD" } as any)}>
              Back to Overworld
            </button>
          </div>
        </div>
      );
    }

    return (
      <div>
        {bossOverlay}
        {ConsumableModal}
        {TrashRemoveModal}
        {RunCodeModal}
        {TopBar(`Battle${state.battle.isBoss ? " • BOSS" : ""}`)}
        <BattleScreen
          rng={rng}
          battle={state.battle}
          setup={state.setup}
          debugSkipQuestions={state.debugSkipQuestions ?? false}
          onUpdate={(next: any) => dispatch({ type: "BATTLE_UPDATE", battle: next })}
          onEnd={(victory: boolean, goldGained: number, playerHpAfter: number, skipRewards?: boolean) => {
            const isBoss = state.battle?.isBoss ?? false;

            if (victory && isBoss) sfx.bossWin();
            else if (victory) sfx.win();
            else sfx.bad();

            dispatch({
              type: "BATTLE_ENDED",
              victory,
              goldGained,
              isBoss,
              playerHpAfter,
              skipRewards: !!skipRewards,
            });
          }}
        />

        {LoadoutOverlay}
        {DeckModal}
      </div>
    );
  }

  if (state.screen === "REWARD") {
    const reward = (state as any).reward;
    return (
      <div>
        {bossOverlay}
        {ConsumableModal}
        {TrashRemoveModal}
        {RunCodeModal}
        {TopBar("Rewards")}
        {reward ? (
          <RewardScreen
            totalGold={state.gold}
            reward={reward}
            consumablesCount={((state as any).consumables ?? []).length}
            consumablesMax={3}
            onSelectCard={(cardId) => dispatch({ type: "REWARD_SELECT_CARD", cardId } as any)}
            onConfirmCard={() => dispatch({ type: "REWARD_CONFIRM_CARD" } as any)}
            onSkipCards={() => dispatch({ type: "REWARD_SKIP_CARDS" } as any)}
            onClaimGold={() => dispatch({ type: "REWARD_CLAIM_GOLD" } as any)}
            onClaimConsumable={() => dispatch({ type: "REWARD_CLAIM_CONSUMABLE" } as any)}
            onSkipExtras={() => dispatch({ type: "REWARD_SKIP_EXTRAS" } as any)}
            onClaimSupply={() => dispatch({ type: "REWARD_CLAIM_SUPPLY" } as any)}
            onContinue={() => dispatch({ type: "CLAIM_REWARD" } as any)}
          />
        ) : (
          <div className="container">
            <div className="panel">
              <div style={{ fontWeight: 900, fontSize: 18 }}>Rewards</div>
              <div className="muted" style={{ marginTop: 6 }}>No rewards available.</div>
              <hr className="sep" />
              <button
                className="btn primary"
                onClick={() => {
                  sfx.confirm();
                  dispatch({ type: "CLAIM_REWARD" } as any);
                }}
              >
                Back to Map
              </button>
            </div>
          </div>
        )}

        {LoadoutOverlay}
        {DeckModal}
      </div>
    );
  }



  if (state.screen === "DEFEAT") {
    return (
      <div>
        {bossOverlay}
        {ConsumableModal}
        {TrashRemoveModal}
        {RunCodeModal}
        {TopBar("Defeat")}
        <div className="container">
          <div className="panel" style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 900, fontSize: 24 }}>Defeat ❌</div>
            <div className="muted" style={{ marginTop: 8 }}>
              Your run has ended. Hit Restart Run to try again.
            </div>
            <hr className="sep" />
            <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
              <button
                className="btn primary"
                onClick={() => {
                  sfx.confirm();
                  dispatch({ type: "NEW_RUN" });
                }}
              >
                New Run
              </button>

              {canDownloadWrongAnswers ? (
                <button
                  className="btn"
                  onClick={() => {
                    sfx.click();
                    downloadWrongAnswersTxt();
                  }}
                  title="Download a .txt file of every question you answered wrong in this run"
                >
                  Download Wrong Answers (.txt)
                </button>
              ) : null}
            </div>

            
            <div style={{ marginTop: 14, textAlign: "left" }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Run Stats</div>
              <div className="panel">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                    fontSize: 13,
                  }}
                >
                  <div>
                    <span className="muted">Time:</span> <strong>{runStats.durationText}</strong>
                  </div>
                  <div>
                    <span className="muted">Farthest floor:</span> <strong>{runStats.maxDepth}</strong>
                  </div>
                  <div>
                    <span className="muted">Nodes visited:</span> <strong>{runStats.visitedNodes}</strong>
                  </div>
                  <div>
                    <span className="muted">Deck:</span> <strong>{runStats.deckSize}</strong> cards ({runStats.uniqueCards} unique)
                  </div>
                  <div>
                    <span className="muted">Upgraded cards:</span> <strong>{runStats.upgraded}</strong>
                  </div>
                  <div>
                    <span className="muted">Negative cards:</span> <strong>{runStats.negative}</strong>
                  </div>
                  <div>
                    <span className="muted">Supplies:</span> <strong>{runStats.supplies}</strong>
                  </div>
                  <div>
                    <span className="muted">Consumables:</span> <strong>{runStats.consumables}</strong>
                  </div>
                  <div>
                    <span className="muted">Fights:</span> <strong>{runStats.fights}</strong>
                  </div>
                  <div>
                    <span className="muted">Events:</span> <strong>{runStats.events}</strong>
                  </div>
                  <div>
                    <span className="muted">Shops:</span> <strong>{runStats.shops}</strong>
                  </div>
                  <div>
                    <span className="muted">Rests:</span> <strong>{runStats.rests}</strong>
                  </div>
                  <div>
                    <span className="muted">Challenges:</span> <strong>{runStats.challenges}</strong>
                  </div>
                  <div>
                    <span className="muted">Bosses:</span> <strong>{runStats.bosses}</strong>
                  </div>
                  <div>
                    <span className="muted">Wrong answers:</span> <strong>{runStats.wrongAnswers}</strong>
                  </div>
                </div>
              </div>
            </div>


            {WrongAnswersPanel}
          </div>
        </div>
      </div>
    );
  }

  if (state.screen === "VICTORY") {
    return (
      <div>
        {bossOverlay}
        {ConsumableModal}
        {TrashRemoveModal}
        {RunCodeModal}
        {TopBar("Victory")}
        <div className="container">
          <div className="panel" style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 900, fontSize: 24 }}>Victory ✅</div>
            <div className="muted" style={{ marginTop: 8 }}>
              Run complete! Hit New Run whenever you want to play again.
            </div>
            <hr className="sep" />
            <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
              <button
                className="btn primary"
                onClick={() => {
                  sfx.confirm();
                  dispatch({ type: "NEW_RUN" });
                }}
              >
                New Run
              </button>

              {canDownloadWrongAnswers ? (
                <button
                  className="btn"
                  onClick={() => {
                    sfx.click();
                    downloadWrongAnswersTxt();
                  }}
                  title="Download a .txt file of every question you answered wrong in this run"
                >
                  Download Wrong Answers (.txt)
                </button>
              ) : null}
            </div>

            <div style={{ marginTop: 14, textAlign: "left" }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Run Stats</div>
              <div className="panel">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                    fontSize: 13,
                  }}
                >
                  <div>
                    <span className="muted">Time:</span> <strong>{runStats.durationText}</strong>
                  </div>
                  <div>
                    <span className="muted">Farthest floor:</span> <strong>{runStats.maxDepth}</strong>
                  </div>
                  <div>
                    <span className="muted">Nodes visited:</span> <strong>{runStats.visitedNodes}</strong>
                  </div>
                  <div>
                    <span className="muted">Deck:</span> <strong>{runStats.deckSize}</strong> cards ({runStats.uniqueCards} unique)
                  </div>
                  <div>
                    <span className="muted">Upgraded cards:</span> <strong>{runStats.upgraded}</strong>
                  </div>
                  <div>
                    <span className="muted">Negative cards:</span> <strong>{runStats.negative}</strong>
                  </div>
                  <div>
                    <span className="muted">Supplies:</span> <strong>{runStats.supplies}</strong>
                  </div>
                  <div>
                    <span className="muted">Consumables:</span> <strong>{runStats.consumables}</strong>
                  </div>
                  <div style={{ gridColumn: "1 / span 2" }}>
                    <span className="muted">Wrong answers:</span> <strong>{runStats.wrongAnswers}</strong>
                  </div>
                </div>
              </div>
            </div>

            {WrongAnswersPanel}
          </div>
        </div>
      </div>
    );
  }
  return null;

  // ---------- Node open logic ----------
  function openNode(node: MapNode) {
    // If this node has pending rewards, always reopen the Reward screen (even for fight nodes)
    // until the player advances to a different node.
    if (state.reward && state.rewardNodeId === node.id) {
      sfx.click();
      dispatch({ type: "OPEN_REWARD" } as any);
      return;
    }

    // Adjusted difficulty scaling for longer game (14 sets instead of 10)
    const difficulty: 1 | 2 | 3 = node.depth <= 4 ? 1 : node.depth <= 9 ? 2 : 3;

    if (node.type === "BOSS") {
      sfx.bossSelect();
      setBossIntro({ nodeId: node.id, difficulty });
      return;
    }

    if (node.type === "FIGHT" || node.type === "CHALLENGE") {
      sfx.confirm();
      dispatch({
        type: "START_BATTLE",
        nodeId: node.id,
        isBoss: false,
        isChallenge: node.type === "CHALLENGE",
        difficulty,
        deckCardIds: state.setup?.deckCardIds ?? [],
      });
      return;
    }

    sfx.click();
    dispatch({ type: "OPEN_NODE", nodeId: node.id });
  }
}
