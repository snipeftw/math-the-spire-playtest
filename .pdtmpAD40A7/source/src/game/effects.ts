// src/game/effects.ts
import type { Status, BattleState, EnemyState } from "./battle";
import { getEffectDef } from "../content/effects";

// ---- Status helpers ----

export function normalizeStatus(id: string, stacks: number): Status {
  const def = getEffectDef(id);
  return {
    id,
    icon: def?.icon ?? "✨",
    label: def ? `${def.name} — ${def.description}` : id,
    stacks,
  };
}

function upsertStatus(list: Status[], id: string, deltaStacks: number): Status[] {
  const next = list.slice();
  const idx = next.findIndex((s) => s.id === id);
  if (idx >= 0) {
    const current = next[idx];
    const stacks = Math.max(0, (current.stacks ?? 0) + deltaStacks);
    if (stacks <= 0) next.splice(idx, 1);
    else next[idx] = { ...current, ...normalizeStatus(id, stacks), stacks };
    return next;
  }
  if (deltaStacks <= 0) return next;
  next.push(normalizeStatus(id, deltaStacks));
  return next;
}

export function addPlayerStatus(state: BattleState, id: string, stacks: number): BattleState {
  // Supply: Headphones — debuffs can't be applied to the player.
  const supplyId = (state as any)?.meta?.supplyId ?? null;
  const isDebuff = id === "poison" || id === "weak" || id === "vulnerable";

  if (supplyId === "sup_no_debuffs" && isDebuff && stacks > 0) {
    // Report a supply proc so the badge can flash.
    const procSupplyIds = Array.from(new Set([...(state.meta?.procSupplyIds ?? []), supplyId]));
    return {
      ...state,
      meta: { ...(state.meta ?? {}), supplyId, procSupplyIds },
    };
  }

  return { ...state, playerStatuses: upsertStatus(state.playerStatuses ?? [], id, stacks) };
}

export function removeStatus(statuses: Status[] | undefined, id: string): Status[] {
  return (statuses ?? []).filter((s) => s.id !== id);
}

export function addEnemyStatus(state: BattleState, enemyId: string, id: string, stacks: number): BattleState {
  // Helper: read multiple supplies from battle meta (supports legacy supplyId)
  const metaAny: any = state.meta ?? {};
  const supplyIds: string[] = Array.isArray(metaAny.supplyIds) ? metaAny.supplyIds.slice() : [];
  const legacy = String(metaAny.supplyId ?? "");
  if (legacy && !supplyIds.includes(legacy)) supplyIds.push(legacy);

  const target = state.enemies.find((en) => String(en.id) === String(enemyId));
  const isPoisonImmune = getStacks((target as any)?.statuses ?? [], "toxic_immunity") > 0;

  if (id === "poison" && stacks > 0 && isPoisonImmune) {
    const meta: any = { ...(state.meta ?? {}) };
    meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
    meta.statusFlashId = "toxic_immunity";
    meta.statusFlashTarget = String(enemyId);
    return { ...state, meta };
  }

  // Event-only supply: poison spreads to ALL enemies when applied.
  // Only triggers for positive poison application.
  const spreadsPoison = supplyIds.includes("sup_poison_spreads");
  if (id === "poison" && stacks > 0 && spreadsPoison) {
    let next = state;

    const meta: any = { ...(next.meta ?? {}) };
    // If the *target* is immune, flash immunity feedback.
    if (isPoisonImmune) {
      meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
      meta.statusFlashId = "toxic_immunity";
      meta.statusFlashTarget = String(enemyId);
    }

    const enemies = (next.enemies ?? []).map((en: any) => {
      if ((en?.hp ?? 0) <= 0) return en;
      const immune = getStacks((en as any)?.statuses ?? [], "toxic_immunity") > 0;
      if (immune) return en;
      return { ...en, statuses: upsertStatus(en.statuses ?? [], "poison", stacks) };
    });

    return { ...next, enemies, meta };
  }

  const enemies = state.enemies.map((en) =>
    en.id === enemyId ? { ...en, statuses: upsertStatus(en.statuses ?? [], id, stacks) } : en
  );
  return { ...state, enemies };
}

export function getStacks(statuses: Status[] | undefined, id: string): number {
  return Math.max(0, Number(statuses?.find((s) => s.id === id)?.stacks ?? 0));
}

// ---- Combat modifiers ----
// This is intentionally tiny now, but gives you a real "effects system" foundation.

export function modifyAttackDamage(base: number, attacker: Status[] | undefined, defender: Status[] | undefined): number {
  let dmg = base;

  // Strength is additive before multipliers (StS-style)
  const str = getStacks(attacker, "strength");
  if (str > 0) dmg += str;

  const weak = getStacks(attacker, "weak");
  if (weak > 0) dmg = Math.floor(dmg * 0.75);

  const vuln = getStacks(defender, "vulnerable");
  if (vuln > 0) dmg = Math.floor(dmg * 1.25);

  return Math.max(0, dmg);
}


// ---- End-of-turn ticking effects ----

function tickList(statuses: Status[]): { next: Status[]; poison: number; regen: number } {
  const poison = getStacks(statuses, "poison");
  const regen = getStacks(statuses, "regen");

  let next = statuses.slice();
  if (poison > 0) next = upsertStatus(next, "poison", -1);
  if (regen > 0) next = upsertStatus(next, "regen", -1);

  return { next, poison, regen };
}

export function applyEndOfTurnTicks(state: BattleState): BattleState {
  // Player
  const pTick = tickList(state.playerStatuses ?? []);
  let playerHP = state.playerHP;

  // Track whether regen actually healed so UI can flash even if enemies hit right after.
  let regenHealed = 0;

  if (pTick.poison > 0) playerHP = Math.max(0, playerHP - pTick.poison);
  if (pTick.regen > 0) {
    const before = playerHP;
    playerHP = Math.min(state.playerMaxHP, playerHP + pTick.regen);
    regenHealed = Math.max(0, playerHP - before);
  }

  // Enemies
  const metaAny2: any = state.meta ?? {};
  const supplyIds2: string[] = Array.isArray(metaAny2.supplyIds) ? metaAny2.supplyIds.slice() : [];
  const legacy2 = String(metaAny2.supplyId ?? "");
  if (legacy2 && !supplyIds2.includes(legacy2)) supplyIds2.push(legacy2);
  const poisonDouble = supplyIds2.includes("sup_poison_double_damage");

  const regenEnemyHealEvents: Array<{ target: string; amount: number; timestamp: number }> = [];
  const nowTs = Date.now();

  const enemies = state.enemies.map((en) => {
    const t = tickList(en.statuses ?? []);
    const isPoisonImmune = getStacks((en as any)?.statuses ?? [], "toxic_immunity") > 0;

    let hp = en.hp;
    if (!isPoisonImmune && t.poison > 0) {
      const mult = poisonDouble ? 2 : 1;
      hp = Math.max(0, hp - t.poison * mult);
    }
    if (t.regen > 0) {
      const beforeRegen = hp;
      hp = Math.min(en.maxHP, hp + t.regen);
      const healed = Math.max(0, hp - beforeRegen);
      if (healed > 0) regenEnemyHealEvents.push({ target: String((en as any).id ?? ""), amount: healed, timestamp: nowTs });
    }

    const nextStatuses = isPoisonImmune ? removeStatus(t.next, "poison") : t.next;
    return { ...en, statuses: nextStatuses, hp };
  });

  // Keep legacy enemyHP in sync with primary enemy (index 0)
  const enemyHP = enemies[0]?.hp ?? state.enemyHP;

  // If regen healed, bump a nonce so UI can trigger a flash (even if net HP goes down after enemy attacks).
  const meta = { ...(state as any).meta } as any;
  const healEvents: Array<{ target: string; amount: number; timestamp: number }> = Array.isArray(meta.healEvents) ? meta.healEvents.slice() : [];
  if (regenHealed > 0) {
    meta.healFlashNonce = Number(meta.healFlashNonce ?? 0) + 1;
    meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
    meta.statusFlashId = "regen";
    healEvents.push({ target: "player", amount: regenHealed, timestamp: nowTs });
  }

  if (regenEnemyHealEvents.length > 0) {
    regenEnemyHealEvents.forEach((e) => {
      if (e.target) healEvents.push(e);
    });
  }

  if (healEvents.length > 0) meta.healEvents = healEvents;

  return { ...state, meta, playerStatuses: pTick.next, playerHP, enemies, enemyHP };
}
