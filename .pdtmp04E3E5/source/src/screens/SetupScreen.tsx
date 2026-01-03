// src/screens/SetupScreen.tsx
import React, { useMemo, useState } from "react";
import { CHARACTERS_3 } from "../content/characters";
import { ALL_CARDS_40ish, BASE_CARDS, cardDescForUi, EXHAUST_TOOLTIP } from "../content/cards";
import { SUPPLIES_POOL_10 } from "../content/supplies";
import { CONSUMABLES_10 } from "../content/consumables";
import { makeRng } from "../game/rng";
import { pickWeighted, pickWeightedUnique, weightByRarity } from "../game/weighted";
import { sfx } from "../game/sfx";
import { QUESTION_PACKS } from "../game/questions";
import type { SetupSelection } from "../game/state";
import type { CardType, SpriteRef } from "../game/battle";

type Props = {
  seed: number;
  teacherUnlocked: boolean;
  lockedNodeIds?: string[];
  onComplete: (setup: SetupSelection) => void;
};

function shuffleSeeded<T>(seed: number, arr: T[]) {
  const rng = makeRng(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Step = 0 | 1 | 2 | 3;

type DraftCardInstance = {
  instId: string; // unique per tile
  cardId: string; // refers to ALL_CARDS_40ish id
};

export function SetupScreen({ seed, teacherUnlocked, onComplete }: Props) {
  // Offers (seeded)
  const supplyOffers = useMemo(() => {
    const rng = makeRng(seed + 111);
    return pickWeightedUnique(
      rng,
      SUPPLIES_POOL_10.filter((s: any) => !(s as any)?.eventOnly),
      3,
      (s) => weightByRarity((s as any).rarity)
    );
  }, [seed]);

const lunchOffers = useMemo(() => {
    const rng = makeRng(seed + 2222);
    return pickWeightedUnique(
      rng,
      CONSUMABLES_10.filter((c: any) => !(c as any)?.eventOnly),
      3,
      (c) => weightByRarity((c as any).rarity)
    );
  }, [seed]);

// Build a "draft pool" of 20 cards from the overall pool (WITH replacement)
  const draftCards20 = useMemo(() => {
    const rng = makeRng(seed + 4444);
    const out: DraftCardInstance[] = [];
    // Setup draft: only Common/Uncommon. Rare/Ultra Rare should NOT appear here.
    const pool = BASE_CARDS.filter(
      (c) => String((c as any).rarity ?? "Common") !== "Rare" && String((c as any).rarity ?? "Common") !== "Ultra Rare"
    );
    const pool2 = pool.filter((c: any) => !(c as any)?.eventOnly);
    const n = 20;

    for (let i = 0; i < n; i++) {
      const pick = pool2[Math.floor(rng() * pool2.length)];
      out.push({ instId: `draft_${i}`, cardId: pick.id });
    }
    return out;
  }, [seed]);

  const cardById = useMemo(() => {
    const m = new Map<string, (typeof ALL_CARDS_40ish)[number]>();
    for (const c of ALL_CARDS_40ish) m.set(c.id, c);
    return m;
  }, []);

  const instToCardId = useMemo(() => {
    const m = new Map<string, string>();
    for (const inst of draftCards20) m.set(inst.instId, inst.cardId);
    return m;
  }, [draftCards20]);

  const [step, setStep] = useState<Step>(0);

  // 1) Character
  const [characterId, setCharacterId] = useState<string>(CHARACTERS_3[0].id);
  const [customAvatarDataUrl, setCustomAvatarDataUrl] = useState<string | null>(null);

  // NEW: Custom name (only used when custom avatar exists)
  const [customName, setCustomName] = useState<string>("");

  // Question packs (units/lessons) to include in this run
  const [questionPackIds, setQuestionPackIds] = useState<string[]>(() => QUESTION_PACKS.map((p) => p.id));

  // 2) Deck (select 10 tiles from draft list)
  const [cardTypeFilter, setCardTypeFilter] = useState<CardType | "ALL">("ALL");
  const [selectedInstIds, setSelectedInstIds] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selectedInstIds), [selectedInstIds]);
  const selectedCount = selectedInstIds.length;

  // 3) Supply
  const [supplyId, setSupplyId] = useState<string>(
    supplyOffers[0]?.id ?? SUPPLIES_POOL_10[0].id
  );

  // 4) Lunch (pick 1 of 3)
  const [lunchItemId, setLunchItemId] = useState<string>(
    lunchOffers[0]?.id ?? CONSUMABLES_10[0].id
  );

  const filteredDraftCards = useMemo(() => {
    if (cardTypeFilter === "ALL") return draftCards20;
    return draftCards20.filter((inst) => {
      const def = cardById.get(inst.cardId);
      return def?.type === cardTypeFilter;
    });
  }, [cardTypeFilter, draftCards20, cardById]);

  function toggleCard(instId: string) {
    setSelectedInstIds((prev) => {
      const has = prev.includes(instId);
      if (has) {
        sfx.selectOff();
        return prev.filter((x) => x !== instId);
      }
      if (prev.length >= 10) return prev;
      sfx.selectOn();
      return [...prev, instId];
    });
  }

  function togglePack(packId: string) {
    setQuestionPackIds((prev) => {
      const has = prev.includes(packId);
      const next = has ? prev.filter((x) => x !== packId) : [...prev, packId];
      if (has) sfx.selectOff(); else sfx.selectOn();
      return next;
    });
  }

  function handleUpload(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCustomAvatarDataUrl(String(reader.result));
      // optional: keep existing customName, but if empty, give a nicer starting point
      setCustomName((prev) => (prev.trim() ? prev : "Player"));
    };
    reader.readAsDataURL(file);
  }

  function canNext(): boolean {
    if (step === 0) return !!characterId && questionPackIds.length > 0;
    if (step === 1) return selectedCount === 10;
    if (step === 2) return !!supplyId;
    if (step === 3) return !!lunchItemId;
    return false;
  }

  function next() {
    if (!canNext()) return;
    setStep((s) => (s < 3 ? ((s + 1) as Step) : s));
  }

  function back() {
    setStep((s) => (s > 0 ? ((s - 1) as Step) : s));
  }

  function finish() {
    if (!canNext()) return;

    // Map selected tile instances -> actual card ids (duplicates preserved)
    const deckCardIds = selectedInstIds
      .map((instId) => instToCardId.get(instId)!)
      .filter(Boolean);

    const chosen = CHARACTERS_3.find((c) => c.id === characterId) ?? CHARACTERS_3[0];
    const chosenName = chosen?.name ?? "Player";
    const chosenEmoji = (chosen as any)?.emoji ?? "🧑‍🎓";

    const playerName = customAvatarDataUrl
      ? (customName.trim() || "Player")
      : chosenName;

    const playerSprite: SpriteRef = customAvatarDataUrl
      ? { kind: "image", src: customAvatarDataUrl, alt: playerName }
      : ((chosen as any).sprite ?? { kind: "emoji", value: chosenEmoji });

    onComplete({
      characterId,
      customAvatarDataUrl,
      customName: customAvatarDataUrl ? (customName.trim() || "Player") : null,

      // NEW fields used by battle:
      playerName,
      playerSprite,

      deckCardIds,
      supplyId,
      supplyIds: [supplyId],
      lunchItemId,

      questionPackIds: questionPackIds.slice(),
    });
  }

  function teacherAutoPickAll() {
    const rng = makeRng(seed + 999);
    const insts = shuffleSeeded(seed + 5555, draftCards20)
      .slice(0, 10)
      .map((x) => x.instId);
    const supply =
      supplyOffers[Math.floor(rng() * supplyOffers.length)]?.id ?? supplyOffers[0].id;
    const lunch =
      lunchOffers[Math.floor(rng() * lunchOffers.length)]?.id ?? lunchOffers[0].id;
    const char = CHARACTERS_3[Math.floor(rng() * CHARACTERS_3.length)].id;

    setCharacterId(char);
    setCustomAvatarDataUrl(null);
    setCustomName(""); // NEW
    setQuestionPackIds(QUESTION_PACKS.map((p) => p.id));
    setSelectedInstIds(insts);
    setSupplyId(supply);
    setLunchItemId(lunch);
    setStep(3);
    
    // Auto-complete setup after a brief delay to ensure state is set
    setTimeout(() => {
      const deckCardIds = insts
        .map((instId) => instToCardId.get(instId)!)
        .filter(Boolean);
      
      const chosen = CHARACTERS_3.find((c) => c.id === char) ?? CHARACTERS_3[0];
      const chosenName = chosen?.name ?? "Player";
      const chosenEmoji = (chosen as any)?.emoji ?? "🧑‍🎓";
      
      onComplete({
        characterId: char,
        customAvatarDataUrl: null,
        customName: null,
        playerName: chosenName,
        playerSprite: (chosen as any).sprite ?? { kind: "emoji", value: chosenEmoji },
        deckCardIds,
        supplyId: supply,
        supplyIds: [supply],
        lunchItemId: lunch,

        questionPackIds: QUESTION_PACKS.map((p) => p.id),
      });
    }, 100);
  }

  const stepTitles = ["Character", "Deck", "School Supply", "Consumables"] as const;

  const Progress = (
    <div
      className="panel soft"
      style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
    >
      <span className="badge">
        Setup Step <strong>{step + 1}/4</strong>
      </span>
      <span className="badge">
        Now: <strong>{stepTitles[step]}</strong>
      </span>

      <span className={"badge " + (selectedCount === 10 ? "good" : "")}>
        Deck <strong>{selectedCount}/10</strong>
      </span>

      <span className={"badge " + (supplyId ? "good" : "")}>
        Supply <strong>{supplyId ? "✓" : "—"}</strong>
      </span>

      <span className={"badge " + (lunchItemId ? "good" : "")}> 
        Consumables <strong>{lunchItemId ? "✓" : "—"}</strong>
      </span>

      <span className={"badge " + (questionPackIds.length > 0 ? "good" : "")}> 
        Packs <strong>{questionPackIds.length}</strong>
      </span>

      <span className={"badge " + (questionPackIds.length > 0 ? "good" : "")}> 
        Packs <strong>{questionPackIds.length}</strong>
      </span>

      {teacherUnlocked && (
        <button
          type="button"
          className="btn"
          onClick={teacherAutoPickAll}
          title="Teacher: auto-pick everything and jump to final step"
        >
          Auto-Pick All (Teacher)
        </button>
      )}
    </div>
  );

  const Footer = (
    <div
      className="panel soft"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        position: "sticky",
        bottom: 12,
        marginTop: 12,
      }}
    >
      <div className="muted" style={{ fontSize: 12 }}>
        {step === 0 && questionPackIds.length === 0
          ? "Choose at least one Question Pack to continue."
          : step === 1 && selectedCount !== 10
            ? "Pick 10 cards to continue."
            : " "}
      </div>

      <div className="row">
        <button type="button" className="btn" onClick={back} disabled={step === 0}>
          Back
        </button>

        {step < 3 ? (
          <button type="button" className="btn primary" onClick={next} disabled={!canNext()}>
            Next
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={finish} disabled={!canNext()}>
            Begin Journey
          </button>
        )}
      </div>
    </div>
  );

  const chosen = CHARACTERS_3.find((c) => c.id === characterId) ?? CHARACTERS_3[0];
  const chosenDisplayName = chosen?.name ?? "Player";

  return (
    <div className="container">
      <div className="panel">
        <div style={{ fontSize: 26, fontWeight: 800 }}>Setup</div>
        <div className="muted" style={{ marginTop: 4 }}>
          Characters are cosmetic only. Cards / Supplies / Consumables will matter in battles.
        </div>
      </div>

      <div style={{ marginTop: 12 }}>{Progress}</div>

      {/* STEP 1: CHARACTER */}
      {step === 0 && (
        <div className="panel" style={{ marginTop: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Choose your character</div>
          <div className="muted" style={{ marginTop: 4 }}>Same stats/abilities — visuals only.</div>

          <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
            Selected:{" "}
            <strong>
              {customAvatarDataUrl ? (customName.trim() || "Custom Avatar") : chosenDisplayName}
            </strong>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
              marginTop: 12,
            }}
          >
            {CHARACTERS_3.map((c) => {
              const active = characterId === c.id && !customAvatarDataUrl;

              return (
                <button
                  type="button"
                  key={c.id}
                  className={"panel soft cardTile " + (active ? "selected" : "")}
                  onMouseEnter={() => sfx.cardHover()}
                  onClick={() => {
                    if (active) {
                      sfx.selectOff();
                      return;
                    }
                    sfx.selectOn();
                    setCustomAvatarDataUrl(null);
                    setCustomName(""); // NEW: clear custom name when picking a preset
                    setCharacterId(c.id);
                  }}
                  style={{ textAlign: "left", cursor: "pointer" as const }}
                  title={`${c.name} — ${c.tagline}`}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 12,
                          overflow: "hidden",
                          border: "1px solid rgba(255,255,255,0.18)",
                          background: "rgba(255,255,255,0.04)",
                        }}
                      >
                        {(() => {
                          const sp: any = (c as any).sprite;
                          if (sp && sp.kind === "image" && sp.src) {
                            return (
                              <img
                                src={sp.src}
                                alt={sp.alt ?? c.name}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                draggable={false}
                              />
                            );
                          }
                          return <div style={{ fontSize: 32 }}>{(c as any).emoji ?? "🧑‍🎓"}</div>;
                        })()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800 }}>{c.name}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{c.tagline}</div>
                      </div>
                    </div>

                    <div style={{ fontSize: 18 }}>{active ? "✅" : ""}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <label className="btn" style={{ cursor: "pointer" }}>
              Upload your own image
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => handleUpload(e.target.files?.[0] ?? null)}
              />
            </label>

            {customAvatarDataUrl && (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setCustomAvatarDataUrl(null);
                    setCustomName("");
                  }}
                >
                  Use preset instead
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <img
                    src={customAvatarDataUrl}
                    alt="Custom avatar preview"
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 12,
                      objectFit: "cover",
                      border: "1px solid rgba(255,255,255,0.18)",
                    }}
                  />

                  <div style={{ minWidth: 220 }}>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                      Custom name
                    </div>
                    <input
                      className="input"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="Type a name…"
                      maxLength={24}
                      style={{ width: "100%" }}
                    />
                    <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                      Image stays on this device (not uploaded).
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="panel soft" style={{ marginTop: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Question packs</div>
            <div className="muted" style={{ marginTop: 4 }}>
              Choose which lesson questions can appear during battles and events.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 10,
                marginTop: 12,
              }}
            >
              {QUESTION_PACKS.map((p) => {
                const checked = questionPackIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={"panel soft"}
                    style={{
                      cursor: "pointer",
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      userSelect: "none",
                      border: checked ? "1px solid rgba(100,255,180,0.45)" : "1px solid rgba(255,255,255,0.12)",
                      boxShadow: checked ? "0 0 0 1px rgba(100,255,180,0.25) inset" : undefined,
                    }}
                    onMouseEnter={() => sfx.cardHover()}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePack(p.id)}
                      style={{ marginTop: 3 }}
                    />
                    <div>
                      <div style={{ fontWeight: 800 }}>{p.label}</div>
                      {p.description ? (
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          {p.description}
                        </div>
                      ) : null}
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
              {questionPackIds.length === 0 ? "Select at least one pack to continue." : " "}
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: DECK */}
      {step === 1 && (
        <div className="panel" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Build your 10-card starter deck</div>
              <div className="muted" style={{ marginTop: 4 }}>
                These <strong>20</strong> options are randomized each run.
              </div>
            </div>

            <div className="row">
              <span className={"badge " + (selectedCount === 10 ? "good" : "")}>
                Selected <strong>{selectedCount}/10</strong>
              </span>

              <select
                value={cardTypeFilter}
                onChange={(e) => setCardTypeFilter(e.target.value as any)}
                className="btn"
                style={{ padding: "8px 10px" }}
                title="Filter cards"
              >
                <option value="ALL">All</option>
                <option value="ATTACK">Attack</option>
                <option value="BLOCK">Block</option>
                <option value="SKILL">Skill</option>
              </select>

              <button type="button" className="btn" onClick={() => setSelectedInstIds([])} disabled={selectedCount === 0}>
                Clear
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 12 }}>
            {filteredDraftCards.map((inst) => {
              const def = cardById.get(inst.cardId);
              if (!def) return null;

              const picked = selectedSet.has(inst.instId);
              const disabled = !picked && selectedCount >= 10;
              const isNeg = String(inst.cardId ?? "").startsWith("neg_");

              return (
                <button
                  type="button"
                  className={
                    "panel soft cardTile " +
                    `rarity-${String((def as any).rarity ?? "Common").toLowerCase()}` +
                    (isNeg ? " negativeCard" : "") +
                    " " +
                    (picked ? "selected" : "")
                  }
                  disabled={disabled}
                  title={
                    disabled
                      ? "Deck is full (10/10)"
                      : `${def.name} (${def.type}) — ${cardDescForUi(def as any)}${(def as any)?.exhaust ? `\n${EXHAUST_TOOLTIP}` : ""}\nRarity: ${String((def as any).rarity ?? "Common")}`
                  }
                  onMouseEnter={() => sfx.cardHover()}
                  onClick={() => {
                    if (disabled) return;
                    toggleCard(inst.instId);
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{def.name}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{def.type}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="badge" title="Energy cost" style={{ minWidth: 28, textAlign: "center", fontWeight: 900 }}>⚡ {def.cost}</div>
                      <div style={{ fontSize: 18 }}>{picked ? "✅" : "➕"}</div>
                    </div>
                  </div>

                  <div
                    className="muted"
                    style={{ fontSize: 12, marginTop: 8 }}
                    title={(def as any)?.exhaust ? EXHAUST_TOOLTIP : undefined}
                  >
                    {cardDescForUi(def as any)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 3: SUPPLY */}
      {step === 2 && (
        <div className="panel" style={{ marginTop: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Choose a School Supply</div>
          <div className="muted" style={{ marginTop: 4 }}>Pick 1 of these 3 offers.</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginTop: 12 }}>
            {supplyOffers.map((s) => {
              const active = supplyId === s.id;
              return (
                <button
                  type="button"
                  key={s.id}
                  className={"panel soft cardTile " + (active ? "selected" : "")}
                  onMouseEnter={() => sfx.cardHover()}
                  onClick={() => {
                    if (active) {
                      sfx.selectOff();
                      return;
                    }
                    sfx.selectOn();
                    setSupplyId(s.id);
                  }}
                  style={{ textAlign: "left", cursor: "pointer" as const }}
                  title={`${s.name} — ${s.desc}`}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ fontSize: 22, width: 28, textAlign: "center" }} aria-hidden>
                        {(s as any).emoji ?? "🎒"}
                      </div>
                      <div style={{ fontWeight: 800 }}>{s.name}</div>
                    </div>
                    <div style={{ fontSize: 18 }}>{active ? "✅" : ""}</div>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{s.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 4: CONSUMABLES */}
      {step === 3 && (
        <div className="panel" style={{ marginTop: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Choose your consumable</div>
          <div className="muted" style={{ marginTop: 4 }}>Pick 1 consumable (later you can carry up to 3).</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginTop: 12 }}>
            {lunchOffers.map((c) => {
              const active = lunchItemId === c.id;
              return (
                <button
                  type="button"
                  key={c.id}
                  className={"panel soft cardTile " + (active ? "selected" : "")}
                  onMouseEnter={() => sfx.cardHover()}
                  onClick={() => {
                    if (active) {
                      sfx.selectOff();
                      return;
                    }
                    sfx.selectOn();
                    setLunchItemId(c.id);
                  }}
                  style={{ textAlign: "left", cursor: "pointer" as const }}
                  title={`${c.name} — ${c.desc}`}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ fontSize: 22, width: 28, textAlign: "center" }} aria-hidden>
                        {(c as any).emoji ?? "🍎"}
                      </div>
                      <div style={{ fontWeight: 800 }}>{c.name}</div>
                    </div>
                    <div style={{ fontSize: 18 }}>{active ? "✅" : ""}</div>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{c.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {Footer}
    </div>
  );
}
