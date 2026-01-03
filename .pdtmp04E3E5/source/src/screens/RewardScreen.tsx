// src/screens/RewardScreen.tsx
import React, { useMemo } from "react";
import type { RewardState } from "../game/state";
import { ALL_CARDS_40ish, cardDescForUi, EXHAUST_TOOLTIP } from "../content/cards";
import { CONSUMABLES_10 } from "../content/consumables";
import { SUPPLIES_POOL_10 } from "../content/supplies";
import { sfx } from "../game/sfx";

type Props = {
  totalGold: number;

  reward: RewardState;

  // inventory info (for capacity display)
  consumablesCount: number;
  consumablesMax: number;

  // actions
  onSelectCard: (cardId: string) => void;
  onConfirmCard: () => void;
  onSkipCards: () => void;

  onClaimGold: () => void;
  onClaimConsumable: () => void;
  onSkipExtras: () => void;

  onClaimSupply: () => void;

  onContinue: () => void;
};

function consumableIcon(id: string | null | undefined): string {
  switch (id) {
    case "con_apple": return "🍎";
    case "con_sandwich": return "🥪";
    case "con_rain_coat": return "🧥";
    case "con_cookie": return "🍪";
    case "con_shake": return "🥤";
    case "con_trailmix": return "🥜";
    case "con_water": return "💧";
    case "con_chips": return "🍟";
    case "con_answer_key": return "🔑";
    case "con_moldy_food": return "🤢";
    case "con_absence_note": return "📝";
    case "con_cheat_sheet": return "📄";

    // legacy ids (older runs)
    case "con_banana": return "🍌";
    case "con_juice": return "🧃";
    case "con_yogurt": return "🥣";
    case "con_granola": return "🥣";
    default: return "🎒";
  }
}

function effectLine(cardId: string): string {
  const def = ALL_CARDS_40ish.find((c) => c.id === cardId);
  if (!def) return "";

  const h: any = (def as any).hook;
  if (!h) return cardDescForUi(def as any);

  const num = (v: any) => (typeof v === "number" ? v : 0);
  const base = num(h.base ?? h.amount ?? h.damage ?? h.block);

  // Prefer something quantitative for rewards (especially damage).
  switch (h.kind) {
    case "damage":
      return `Deal ${base} damage.`;
    case "damage_multi":
      return `Deal ${base} damage twice.`;
    case "pierce":
      return `Deal ${base} damage (piercing).`;
    case "risk_damage":
      return `Deal ${base} damage (risky).`;
    case "combo":
      return `Deal ${base} damage (combo).`;
    case "tempo":
      return `Deal ${base} damage (tempo).`;

    case "block":
      return `Gain ${base} block.`;
    case "risk_block":
      return `Gain ${base} block (risky).`;
    case "block_damage":
      return `Gain ${base} block, then deal ${base} damage.`;
    case "block_draw":
      return `Gain ${base} block, then draw.`;
    case "counter":
      return `Gain ${base} block (counter).`;

    case "draw":
      return `Draw ${base} cards.`;
    case "energy":
      return `Gain ${base} energy.`;
    case "heal":
      return `Heal ${base} HP.`;
    case "cleanse":
      return `Cleanse a debuff.`;
    case "cycle":
      return `Cycle cards.`;
    case "boost":
      return `Boost a stat (${base}).`;
    case "hint":
      return `Get a hint.`;
    case "reroll":
      return `Reroll rewards.`;
    case "upgrade":
      return `Upgrade a card.`;
    default: {
      // Generic fallback by card type
      if (def.type === "ATTACK" && base > 0) return `Deal ${base} damage.`;
      if (def.type === "BLOCK" && base > 0) return `Gain ${base} block.`;
      return cardDescForUi(def as any);
    }
  }
}

export function RewardScreen(props: Props) {
  const cardById = useMemo(() => new Map(ALL_CARDS_40ish.map((c) => [c.id, c])), []);
  const consumableById = useMemo(() => new Map(CONSUMABLES_10.map((c) => [c.id, c])), []);
  const supplyById = useMemo(() => new Map(SUPPLIES_POOL_10.map((s) => [s.id, s])), []);

  const reward = props.reward;

  const selectedCardId = reward.selectedCardId;
  const cardConfirmed = reward.cardConfirmed;

  const goldClaimed = reward.goldClaimed;
  const consumableClaimed = reward.consumableClaimed;

  const goldAmount = Math.max(0, reward.goldAmount ?? 0);

  const consumable = reward.consumableOfferId ? consumableById.get(reward.consumableOfferId) : null;
  const bagFull = props.consumablesCount >= props.consumablesMax;

  const showCards = !cardConfirmed && reward.cardOffers.length > 0;
  const supplyOfferId = reward.supplyOfferId;
  const supplyClaimed = !supplyOfferId;
  const showLoot = !(goldClaimed && consumableClaimed && supplyClaimed);

  return (
    <div className="container">
      <div className="header">
        <div>
          <h2 className="h2">Rewards</h2>
          <div className="sub">Grab what you want, then head back to the map.</div>
        </div>

        <span className="badge good">
          Total Gold <strong>{props.totalGold}</strong>
        </span>
      </div>

      {/* CARD REWARD */}
      <div className="panel" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Card Reward</div>

          {!cardConfirmed ? (
            <button
              type="button"
              className="btn"
              onMouseEnter={() => sfx.cardHover()}
              onClick={() => {
                sfx.selectOff();
                props.onSkipCards();
              }}
              title="Skip the card reward"
            >
              Skip Card
            </button>
          ) : (
            <span className="badge good">Card {selectedCardId ? "claimed" : "skipped"} ✓</span>
          )}
        </div>

        {showCards ? (
          <>
            <div className="muted" style={{ marginTop: 6 }}>
              Click a card to select it, then confirm.
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                marginTop: 12,
                flexWrap: "wrap",
                alignItems: "stretch",
              }}
            >
              {reward.cardOffers.map((id) => {
                const def = cardById.get(id);
                if (!def) return null;

                const active = selectedCardId === id;
                const isNeg = String(id ?? "").startsWith("neg_");

                return (
                  <button
                    key={id}
                    type="button"
                    className={
                      "panel soft cardTile rewardTile " +
                      `rarity-${String(def?.rarity ?? "Common").toLowerCase()}` +
                      (isNeg ? " negativeCard" : "") +
                      " " +
                      (active ? "selected" : "")
                    }
                    onMouseEnter={() => sfx.cardHover()}
                    onClick={() => {
                      sfx.selectOn();
                      props.onSelectCard(id);
                    }}
                    style={{
                      width: 280,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                    title={`${def.name} (${def.type})\n${cardDescForUi(def as any)}${(def as any)?.exhaust ? `\n${EXHAUST_TOOLTIP}` : ""}\nRarity: ${String((def as any).rarity ?? "Common")}`}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 900 }}>{def.name}</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {def.type}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                        <div className="badge" title="Energy cost">
                          ⚡ <strong>{Number(def.cost ?? 0)}</strong>
                        </div>
                        <div style={{ fontSize: 18 }}>{active ? "✅" : "➕"}</div>
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

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                className="btn primary"
                disabled={!selectedCardId}
                onMouseEnter={() => sfx.cardHover()}
                onClick={() => {
                  if (!selectedCardId) return;
                  sfx.confirm();
                  props.onConfirmCard();
                }}
                title={!selectedCardId ? "Select a card first" : "Add the selected card to your deck"}
              >
                Confirm Card
              </button>

              {selectedCardId ? (
                <span className="muted" style={{ fontSize: 12 }}>
                  Selected:{" "}
                  <strong>{cardById.get(selectedCardId)?.name ?? "Card"}</strong>
                </span>
              ) : (
                <span className="muted" style={{ fontSize: 12 }}>No card selected.</span>
              )}
            </div>
          </>
        ) : (
          <div className="muted" style={{ marginTop: 10 }}>
            {selectedCardId && cardConfirmed ? (
              <>
                Added <strong>{cardById.get(selectedCardId)?.name ?? "a card"}</strong> to your deck.
              </>
            ) : (
              <>No card taken.</>
            )}
          </div>
        )}
      </div>

      {/* LOOT */}
      <div className="panel" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Loot</div>

          {showLoot ? (
            <button
              type="button"
              className="btn"
              onMouseEnter={() => sfx.cardHover()}
              onClick={() => {
                sfx.selectOff();
                props.onSkipExtras();
              }}
              title="Skip the remaining loot (gold / consumable)"
            >
              Skip Loot
            </button>
          ) : (
            <span className="badge good">Loot collected ✓</span>
          )}
        </div>

        <div className="muted" style={{ marginTop: 6 }}>
          Click to collect. (Consumable capacity: {props.consumablesCount}/{props.consumablesMax})
          {supplyOfferId && !supplyClaimed && " • Supply available for challenge fights"}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
          {/* GOLD */}
          {!goldClaimed ? (
            <button
              type="button"
              className={"panel soft rewardTile"}
              onMouseEnter={() => sfx.cardHover()}
              onClick={() => {
                props.onClaimGold();
              }}
              style={{ width: 280, textAlign: "left", cursor: "pointer" }}
              title="Collect gold"
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 900 }}>Gold</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    +{goldAmount}
                  </div>
                </div>
                <div style={{ fontSize: 22 }}>🪙</div>
              </div>
            </button>
          ) : null}

          {/* CONSUMABLE */}
          {!consumableClaimed ? (
            <button
              type="button"
              className={"panel soft rewardTile"}
              disabled={!consumable || bagFull}
              onMouseEnter={() => sfx.cardHover()}
              onClick={() => {
                if (!consumable || bagFull) return;
                sfx.selectOn();
                props.onClaimConsumable();
              }}
              style={{
                width: 280,
                textAlign: "left",
                cursor: !consumable || bagFull ? "not-allowed" : "pointer",
                opacity: !consumable ? 0.65 : 1,
              }}
              title={
                !consumable
                  ? "No consumable reward"
                  : bagFull
                  ? "Consumable bag is full (max 3)"
                  : `Collect ${consumable.name}`
              }
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{consumable ? consumable.name : "Consumable"}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {bagFull ? "Bag full (3/3)" : "Collect"}
                  </div>
                </div>
                <div style={{ fontSize: 22 }}>{consumableIcon(consumable?.id)}</div>
              </div>

              {consumable?.desc && (
                <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  {consumable.desc}
                </div>
              )}
            </button>
          ) : null}

          {/* SUPPLY (for challenge fights) */}
          {!supplyClaimed && supplyOfferId ? (
            <button
              type="button"
              className={"panel soft rewardTile"}
              onMouseEnter={() => sfx.cardHover()}
              onClick={() => {
                sfx.selectOn();
                props.onClaimSupply();
              }}
              style={{
                width: 280,
                textAlign: "left",
                cursor: "pointer",
              }}
              title={`Collect ${supplyById.get(supplyOfferId)?.name ?? "Supply"}`}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{supplyById.get(supplyOfferId)?.name ?? "Supply"}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    Supply
                  </div>
                </div>
                <div style={{ fontSize: 22 }}>{supplyById.get(supplyOfferId)?.emoji ?? "📦"}</div>
              </div>

              {supplyById.get(supplyOfferId)?.desc && (
                <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  {supplyById.get(supplyOfferId)?.desc}
                </div>
              )}
            </button>
          ) : null}
        </div>

        <hr className="sep" />

        <button
          type="button"
          className="btn primary"
          onMouseEnter={() => sfx.cardHover()}
          onClick={() => {
            sfx.confirm();
            props.onContinue();
          }}
        >
          Back to Map
        </button>
      </div>

    </div>
  );
}
