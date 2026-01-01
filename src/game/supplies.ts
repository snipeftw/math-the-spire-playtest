// src/game/supplies.ts
import type { BattleState } from "./battle";
import { addEnemyStatus, addPlayerStatus } from "./effects";
import { upgradeCardId } from "../content/cards";
import { SUPPLIES_POOL_10 } from "../content/supplies";

function pushBattleLog(state: BattleState, text: string): BattleState {
  const line = {
    t: Date.now(),
    turn: Math.max(1, Math.floor(Number(state.turn ?? 1))),
    text: String(text ?? ""),
  };
  const meta: any = { ...(state as any).meta };
  meta.battleLog = [...(meta.battleLog ?? []), line].slice(-400);
  return { ...(state as any), meta };
}

export type SupplyId = string;

export function applySupplyToNewBattle(battle: BattleState, supplyId: SupplyId | null | undefined): BattleState {
  if (!supplyId) return battle;

  let next = battle;

  switch (supplyId) {
    case "sup_start_strength": {
      next = addPlayerStatus(next, "strength", 2);
      next = markSupplyProc(next, supplyId);
      break;
    }
    case "sup_bicycle": {
      // +2 energy every turn
      const newMax = (next.maxEnergy ?? 3) + 2;
      next = { ...next, maxEnergy: newMax, energy: newMax };
      next = markSupplyProc(next, supplyId);
      break;
    }
    default:
      break;
  }
  // Supplies that proc at the start of each turn should also proc on Turn 1.
  next = applySupplyStartOfTurn(next, supplyId);

  return next;
}

export function applySuppliesToNewBattle(battle: BattleState, supplyIds: SupplyId[] | null | undefined): BattleState {
  if (!supplyIds || supplyIds.length === 0) return battle;
  let next = battle;
  for (const supplyId of supplyIds) {
    next = applySupplyToNewBattle(next, supplyId);
  }
  return next;
}

export function applySupplyStartOfTurn(battle: BattleState, supplyId: SupplyId | null | undefined): BattleState {
  if (!supplyId) return battle;
  let next = battle;

  if (supplyId === "sup_block_gain") {
    next = { ...next, playerBlock: (next.playerBlock ?? 0) + 5 };
    next = markSupplyProc(next, supplyId);
  }

  if (supplyId === "sup_apply_poison") {
    // Apply 2 Poison to ALL living enemies
    for (const en of next.enemies) {
      if ((en.hp ?? 0) > 0) next = addEnemyStatus(next, en.id, "poison", 2);
    }
    next = markSupplyProc(next, supplyId);
  }

  return next;
}

export function applySuppliesStartOfTurn(battle: BattleState, supplyIds: SupplyId[] | null | undefined): BattleState {
  if (!supplyIds || supplyIds.length === 0) return battle;
  let next = battle;
  for (const supplyId of supplyIds) {
    next = applySupplyStartOfTurn(next, supplyId);
  }
  return next;
}

export function applySupplyToGoldGain(base: number, supplyId: SupplyId | null | undefined): number {
  if (!supplyId) return base;
  switch (supplyId) {
    case "sup_gold_boost":
      return Math.ceil(base * 1.5);
    default:
      return base;
  }
}

export function applySuppliesToGoldGain(base: number, supplyIds: SupplyId[] | null | undefined): number {
  if (!supplyIds || supplyIds.length === 0) return base;
  let result = base;
  for (const supplyId of supplyIds) {
    result = applySupplyToGoldGain(result, supplyId);
  }
  return result;
}

export function cardOfferCountForSupply(supplyId: SupplyId | null | undefined): number {
  if (supplyId === "sup_double_offers") return 6;
  return 3;
}

export function cardOfferCountForSupplies(supplyIds: SupplyId[] | null | undefined): number {
  if (!supplyIds || supplyIds.length === 0) return 3;
  let max = 3;
  for (const supplyId of supplyIds) {
    const count = cardOfferCountForSupply(supplyId);
    if (count > max) max = count;
  }
  return max;
}

export function shouldUpgradeRewardCards(supplyId: SupplyId | null | undefined): boolean {
  return supplyId === "sup_upgraded_rewards";
}

export function shouldUpgradeRewardCardsForSupplies(supplyIds: SupplyId[] | null | undefined): boolean {
  if (!supplyIds || supplyIds.length === 0) return false;
  return supplyIds.some(id => shouldUpgradeRewardCards(id));
}

export function upgradeRewardCardId(cardId: string, supplyId: SupplyId | null | undefined): string {
  if (!shouldUpgradeRewardCards(supplyId)) return cardId;
  return upgradeCardId(cardId);
}

export function upgradeRewardCardIdForSupplies(cardId: string, supplyIds: SupplyId[] | null | undefined): string {
  if (!shouldUpgradeRewardCardsForSupplies(supplyIds)) return cardId;
  return upgradeCardId(cardId);
}

export function applySupplyPostBattleHeal(hpAfter: number, maxHp: number, supplyId: SupplyId | null | undefined): number {
  const hp = Math.max(0, Math.floor(hpAfter));
  const max = Math.max(1, Math.floor(maxHp));
  if (!supplyId) return Math.min(max, hp);

  switch (supplyId) {
    case "sup_post_battle_heal":
      return Math.min(max, hp + 10);
    default:
      return Math.min(max, hp);
  }
}

export function applySuppliesPostBattleHeal(hpAfter: number, maxHp: number, supplyIds: SupplyId[] | null | undefined): number {
  if (!supplyIds || supplyIds.length === 0) return Math.min(maxHp, hpAfter);
  let result = hpAfter;
  for (const supplyId of supplyIds) {
    result = applySupplyPostBattleHeal(result, maxHp, supplyId);
  }
  return result;
}

export function markSupplyProc(battle: BattleState, supplyId: string): BattleState {
  const next: BattleState = {
    ...(battle as any),
    meta: {
      ...((battle as any).meta ?? {}),
      supplyId,
      procSupplyIds: Array.from(new Set([...(((battle as any).meta?.procSupplyIds ?? []) as any[]), supplyId])),
    },
  };

  const def = SUPPLIES_POOL_10.find((s) => s.id === supplyId);
  const nm = String(def?.name ?? supplyId);
  return pushBattleLog(next, `Supply activated: ${nm}.`);
}
