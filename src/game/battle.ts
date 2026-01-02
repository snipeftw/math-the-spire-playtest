// src/game/battle.ts
import type { RNG } from "./rng";
import { getQuestion } from "./questions";
import { ALL_CARDS_40ish, type CardDef as CardDefContent } from "../content/cards";
import { enemyImg } from "../content/assetUrls";
import { addEnemyStatus, addPlayerStatus, applyEndOfTurnTicks, getStacks, modifyAttackDamage, removeStatus } from "./effects";
import { applySupplyStartOfTurn, applySuppliesStartOfTurn, markSupplyProc } from "./supplies";

function getBattleSupplyIds(state: any): string[] {
  const meta: any = state?.meta ?? {};
  const ids: string[] = Array.isArray(meta.supplyIds) ? meta.supplyIds.slice() : [];
  const legacy = String(meta.supplyId ?? "");
  if (legacy && !ids.includes(legacy)) ids.push(legacy);
  return ids;
}

function battleHasSupply(state: any, supplyId: string): boolean {
  return getBattleSupplyIds(state).includes(supplyId);
}

export type Difficulty = 1 | 2 | 3;
export type BossMode = "NONE" | "WARD" | "STRIKE";
export type CardType = "ATTACK" | "BLOCK" | "SKILL";

export type SpriteRef =
  | { kind: "emoji"; value: string }
  | { kind: "image"; src: string; alt?: string };

export type Status = {
  id?: string;
  icon?: string;
  label?: string;
  stacks?: number;
};

export type EnemyMoveDefNoSummon =
  | { kind: "ATTACK"; dmg: number; hits?: number; weight?: number }
  | { kind: "BLOCK"; block: number; weight?: number }
  | { kind: "DEBUFF"; statusId: string; stacks: number; weight?: number }
  | { kind: "BUFF"; statusId: string; stacks: number; weight?: number }
  | { kind: "HEAL"; heal: number; weight?: number }
  | { kind: "ADD_NEGATIVE_CARD"; cardId?: string; weight?: number }
  | { kind: "ERASE_BUFFS"; weight?: number }
  | { kind: "CONSUME_MINIONS_HEAL"; weight?: number }
  | { kind: "EXHAUST_RANDOM_CARD"; weight?: number }
  | { kind: "FORCE_QUESTION"; dmgOnWrong: number; weight?: number }
  | { kind: "CLEANSE_SELF"; weight?: number };

export type EnemyAISimple = {
  moves?: EnemyMoveDefNoSummon[];
  noRepeatKind?: boolean;
  // Deterministic patterns
  sequence?: Array<EnemyMoveDefNoSummon | EnemyMoveDefNoSummon[]>;
  phases?: Array<{ id: string; atOrBelowHpPct: number; sequence: Array<EnemyMoveDefNoSummon | EnemyMoveDefNoSummon[]> }>;
};

export type EnemySpawnDef = {
  baseId: string;
  name: string;
  hp: number;
  sprite: SpriteRef;
  ai: EnemyAISimple;
  statuses?: Status[];
  block?: number;
};

export type EnemyIntent =
  | { kind: "ATTACK"; dmg: number; hits?: number }
  | { kind: "BLOCK"; block: number }
  | { kind: "DEBUFF"; statusId: string; stacks: number }
  | { kind: "BUFF"; statusId: string; stacks: number }
  | { kind: "HEAL"; heal: number }
  | { kind: "SUMMON"; spawn: EnemySpawnDef; count: number }
  | { kind: "ADD_NEGATIVE_CARD"; cardId?: string }
  | { kind: "ERASE_BUFFS" }
  | { kind: "CONSUME_MINIONS_HEAL" }
  | { kind: "EXHAUST_RANDOM_CARD" }
  | { kind: "FORCE_QUESTION"; dmgOnWrong: number }
  | { kind: "CLEANSE_SELF" };

export type EnemyMoveDef = EnemyMoveDefNoSummon | { kind: "SUMMON"; spawn: EnemySpawnDef; count: number; weight?: number };

export type EnemyAI = {
  moves?: EnemyMoveDef[];
  noRepeatKind?: boolean;
  intentsPerTurn?: number;
  // Deterministic patterns
  sequence?: Array<EnemyMoveDef | EnemyMoveDef[]>;
  // Phase sequences (checked by HP%)
  phases?: Array<{ id: string; atOrBelowHpPct: number; sequence: Array<EnemyMoveDef | EnemyMoveDef[]> }>;
};

export type EnemyState = {
  id: string;
  name: string;
  hp: number;
  maxHP: number;
  block: number;
  intent: EnemyIntent;
  intents?: EnemyIntent[]; // Multiple intents per turn (if set, use this instead of intent)
  lastIntentKind?: EnemyIntent["kind"];
  ai?: EnemyAI;
  // Deterministic AI state
  aiSeqIndex?: number;
  aiSeqKey?: string;
  sprite?: SpriteRef;
  statuses: Status[];
};


function intentLegacyDamage(intent: EnemyIntent | undefined): number {
  if (!intent) return 0;
  if (intent.kind !== "ATTACK") return 0;
  const hits = Math.max(1, Math.floor(Number((intent as any).hits ?? 1)));
  return Math.max(0, Math.floor(Number((intent as any).dmg ?? 0))) * hits;
}

function intentFromMove(m: EnemyMoveDef): EnemyIntent {
  if (m.kind === "ATTACK") return { kind: "ATTACK", dmg: Number((m as any).dmg ?? 0), hits: Number((m as any).hits ?? 1) || 1 };
  if (m.kind === "BLOCK") return { kind: "BLOCK", block: Number((m as any).block ?? 0) };
  if (m.kind === "DEBUFF") return { kind: "DEBUFF", statusId: String((m as any).statusId ?? "weak"), stacks: Number((m as any).stacks ?? 1) };
  if (m.kind === "BUFF") return { kind: "BUFF", statusId: String((m as any).statusId ?? "strength"), stacks: Number((m as any).stacks ?? 1) };
  if (m.kind === "HEAL") return { kind: "HEAL", heal: Number((m as any).heal ?? 0) };
  if (m.kind === "SUMMON") return { kind: "SUMMON", spawn: (m as any).spawn, count: Number((m as any).count ?? 1) || 1 };
  if (m.kind === "ADD_NEGATIVE_CARD") return { kind: "ADD_NEGATIVE_CARD", cardId: String((m as any).cardId ?? "neg_curse") };
  if (m.kind === "ERASE_BUFFS") return { kind: "ERASE_BUFFS" };
  if (m.kind === "CONSUME_MINIONS_HEAL") return { kind: "CONSUME_MINIONS_HEAL" };
  if (m.kind === "EXHAUST_RANDOM_CARD") return { kind: "EXHAUST_RANDOM_CARD" };
  if (m.kind === "FORCE_QUESTION") return { kind: "FORCE_QUESTION", dmgOnWrong: Math.max(0, Math.floor(Number((m as any).dmgOnWrong ?? 0))) };
  if (m.kind === "CLEANSE_SELF") return { kind: "CLEANSE_SELF" };
  return { kind: "ATTACK", dmg: 0, hits: 1 };
}

type EnemyTurnMove = EnemyMoveDef | EnemyMoveDef[];

function isPlayerBuffStatusId(id: string): boolean {
  // "Buffs" here means beneficial statuses on the player.
  // If you add more positive statuses later, include them here.
  return id === "strength" || id === "regen" || id === "double_attack";
}

function getActiveSequence(ai: EnemyAI | undefined, hpPct: number): { key: string | undefined; seq: Array<EnemyMoveDef | EnemyMoveDef[]> | undefined } {
  if (!ai) return { key: undefined, seq: undefined };

  const phases = Array.isArray((ai as any).phases) ? ((ai as any).phases as Array<any>).slice() : [];
  if (phases.length > 0) {
    // Smaller threshold first (ex: 50% triggers before 75%)
    phases.sort((a, b) => Number(a?.atOrBelowHpPct ?? 0) - Number(b?.atOrBelowHpPct ?? 0));
    for (const ph of phases) {
      const thr = Math.max(0, Math.min(100, Number(ph?.atOrBelowHpPct ?? 0)));
      if (hpPct <= thr) {
        const seq = Array.isArray(ph?.sequence) ? (ph.sequence as Array<EnemyMoveDef | EnemyMoveDef[]>) : undefined;
        return { key: String(ph?.id ?? `hp<=${thr}`), seq };
      }
    }
  }

  const seq = Array.isArray((ai as any).sequence) ? ((ai as any).sequence as Array<EnemyMoveDef | EnemyMoveDef[]>) : undefined;
  if (seq && seq.length > 0) return { key: "base", seq };

  return { key: undefined, seq: undefined };
}

export function rollIntentFromAI(
  ai: EnemyAI | undefined,
  rng: RNG,
  params?: {
    lastKind?: EnemyIntent["kind"];
    seqIndex?: number;
    seqKey?: string;
    hp?: number;
    maxHP?: number;
  }
): { intent: EnemyIntent; intents?: EnemyIntent[]; seqIndex: number; seqKey?: string } {
  const lastKind = params?.lastKind;
  const hp = Number(params?.hp ?? 1);
  const maxHP = Math.max(1, Number(params?.maxHP ?? hp));
  const hpPct = Math.max(0, Math.min(100, (hp / maxHP) * 100));

  const { key, seq } = getActiveSequence(ai, hpPct);

  // --- Deterministic sequence (optionally phase-based) ---
  if (seq && seq.length > 0) {
    const sameSeq = key && params?.seqKey && key === params.seqKey;
    const idx = Math.max(0, Math.floor(Number(sameSeq ? params?.seqIndex ?? 0 : 0)));
    const turnMove = (seq[idx % seq.length] as unknown) as EnemyTurnMove;
    if (Array.isArray(turnMove)) {
      const intents = turnMove.map((m) => intentFromMove(m));
      const first = intents[0] ?? { kind: "ATTACK", dmg: 0, hits: 1 };
      return { intent: first, intents, seqIndex: idx + 1, seqKey: key };
    }
    return { intent: intentFromMove(turnMove), seqIndex: idx + 1, seqKey: key };
  }

  // --- Weighted (random) ---
  const moves = (ai?.moves ?? []).filter((m) => !!m);
  if (moves.length <= 0) return { intent: { kind: "ATTACK", dmg: 0, hits: 1 }, seqIndex: params?.seqIndex ?? 0, seqKey: params?.seqKey };

  let pool = moves;
  if (ai?.noRepeatKind && lastKind) {
    const filtered = moves.filter((m) => m.kind !== lastKind);
    pool = filtered.length > 0 ? filtered : moves;
  }

  const total = pool.reduce((sum, m) => sum + Math.max(0, Number((m as any).weight ?? 1)), 0);
  const r = rng() * (total > 0 ? total : pool.length);
  let acc = 0;

  for (const m of pool) {
    const w = Math.max(0, Number((m as any).weight ?? 1));
    acc += total > 0 ? w : 1;
    if (r <= acc) {
      return { intent: intentFromMove(m), seqIndex: params?.seqIndex ?? 0, seqKey: params?.seqKey };
    }
  }

  const last = pool[pool.length - 1];
  const baseResult = { intent: intentFromMove(last), seqIndex: params?.seqIndex ?? 0, seqKey: params?.seqKey };
  
  // Support multiple intents per turn
  const intentsPerTurn = Math.max(1, Math.floor(Number(ai?.intentsPerTurn ?? 1)));
  if (intentsPerTurn > 1) {
    const intents: EnemyIntent[] = [baseResult.intent];
    let lastKindForMulti = baseResult.intent.kind;
    
    for (let i = 1; i < intentsPerTurn; i++) {
      let poolForNext = moves;
      if (ai?.noRepeatKind && lastKindForMulti) {
        const filtered = moves.filter((m) => m.kind !== lastKindForMulti);
        poolForNext = filtered.length > 0 ? filtered : moves;
      }
      
      const totalNext = poolForNext.reduce((sum, m) => sum + Math.max(0, Number((m as any).weight ?? 1)), 0);
      const rNext = rng() * (totalNext > 0 ? totalNext : poolForNext.length);
      let accNext = 0;
      
      for (const m of poolForNext) {
        const w = Math.max(0, Number((m as any).weight ?? 1));
        accNext += totalNext > 0 ? w : 1;
        if (rNext <= accNext) {
          const nextIntent = intentFromMove(m);
          intents.push(nextIntent);
          lastKindForMulti = nextIntent.kind;
          break;
        }
      }
      
      if (intents.length <= i) {
        // Fallback
        const lastMove = poolForNext[poolForNext.length - 1];
        const nextIntent = intentFromMove(lastMove);
        intents.push(nextIntent);
        lastKindForMulti = nextIntent.kind;
      }
    }
    
    return { ...baseResult, intents };
  }
  
  return baseResult;
}

type CardDef = CardDefContent;

const cardById = new Map<string, CardDef>(ALL_CARDS_40ish.map((c) => [c.id, c]));

function getCardDef(cardId: string): CardDef {
  return (
    cardById.get(cardId) ?? {
      id: cardId,
      name: cardId,
      type: "SKILL",
      desc: "Unknown card",
      cost: 1,
      rarity: "Common",
      effect: { kind: "draw", amount: 1 } as any,
    }
  );
}

function cardCost(cardId: string) {
  const def: any = getCardDef(cardId);
  const n = Number(def?.cost ?? 1);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 1;
}

function isAttackCard(cardId: string): boolean {
  return getCardDef(cardId).type === "ATTACK";
}

function isBlockCard(cardId: string): boolean {
  return getCardDef(cardId).type === "BLOCK";
}

function isSkillCard(cardId: string): boolean {
  return getCardDef(cardId).type === "SKILL";
}

function removeOneStack(statuses: Status[] | undefined, id: string): Status[] {
  const list = statuses ?? [];
  const idx = list.findIndex((s) => s.id === id);
  if (idx < 0) return list;
  const cur = list[idx];
  const stacks = Math.max(0, Number(cur.stacks ?? 0) - 1);
  const next = list.slice();
  if (stacks <= 0) next.splice(idx, 1);
  else next[idx] = { ...cur, stacks };
  return next;
}

function removeEnemyStatusById(state: BattleState, enemyId: string, statusId: string): BattleState {
  const enemies = state.enemies.slice();
  const idx = enemies.findIndex((e) => e.id === enemyId);
  if (idx < 0) return state;
  const en = enemies[idx] as any;
  enemies[idx] = { ...en, statuses: (en.statuses ?? []).filter((s: any) => String(s?.id ?? "") !== statusId) };
  return { ...state, enemies };
}

function spawnCloneEnemyFromEnemy(state: BattleState, enemyId: string, hp: number, rng: RNG): BattleState {
  const maxEnemies = 5;
  const existing = state.enemies ?? [];
  if (existing.length >= maxEnemies) return state;

  const src = existing.find((e) => e.id === enemyId);
  if (!src) return state;

  const meta: any = { ...(state as any).meta };
  const nonce = Number(meta.spawnNonce ?? 0) + 1;
  meta.spawnNonce = nonce;

  const baseId = String((src as any).id ?? "enemy").split("_")[0] || "enemy";
  let id = `${baseId}_clone_${nonce}`;
  const ids = new Set(existing.map((e: any) => e.id));
  while (ids.has(id)) {
    meta.spawnNonce += 1;
    id = `${baseId}_clone_${meta.spawnNonce}`;
  }

  const nextEnemy: EnemyState = {
    ...src,
    id,
    hp: Math.max(1, Math.floor(hp)),
    maxHP: Math.max(1, Math.floor(Number((src as any).maxHP ?? hp))),
    block: 0,
    // Roll a fresh intent for the clone.
    intent: { kind: "ATTACK", dmg: 0, hits: 1 },
    intents: undefined,
    lastIntentKind: undefined,
    aiSeqIndex: 0,
    aiSeqKey: undefined,
  };

  const withEnemy = ensureValidTarget({ ...state, meta, enemies: [...existing, nextEnemy] });

  // Immediately roll telegraphed intent for the clone.
  const rolled = rollIntentFromAI((nextEnemy as any).ai, rng, {
    lastKind: undefined,
    seqIndex: 0,
    seqKey: undefined,
    hp: nextEnemy.hp,
    maxHP: nextEnemy.maxHP,
  });

  const enemies2 = withEnemy.enemies.slice();
  const idx2 = enemies2.findIndex((e) => e.id === id);
  if (idx2 >= 0) {
    enemies2[idx2] = {
      ...(enemies2[idx2] as any),
      intent: rolled.intent,
      intents: rolled.intents && rolled.intents.length > 1 ? rolled.intents : undefined,
      lastIntentKind: rolled.intent.kind,
      aiSeqIndex: rolled.seqIndex,
      aiSeqKey: rolled.seqKey,
    };
  }

  return ensureValidTarget({ ...withEnemy, enemies: enemies2 });
}

function applyEnemyHpThresholdTriggers(state: BattleState, enemyId: string, rng: RNG): BattleState {
  const en = state.enemies.find((e) => e.id === enemyId) as any;
  if (!en || (en.hp ?? 0) <= 0) return state;

  const hp = Math.max(0, Math.floor(Number(en.hp ?? 0)));
  const statusIds = new Set((en.statuses ?? []).map((s: any) => String(s?.id ?? "")));
  let next = state;

  // Possessed Pencil: at <=13 HP, gain 10 block (once)
  if (hp <= 13 && statusIds.has("trigger_block_at_13")) {
    const cur = Math.max(0, Math.floor(Number((en as any).block ?? 0)));
    next = setEnemyBlockById(next, enemyId, cur + 10);
    next = removeEnemyStatusById(next, enemyId, "trigger_block_at_13");

    const meta: any = { ...(next.meta ?? {}) };
    meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
    meta.statusFlashId = "trigger_block_at_13";
    meta.statusFlashTarget = enemyId;
    next = { ...next, meta };
  }

  // Possessed Eraser: at <=5 HP, remove all player buffs (once)
  if (hp <= 5 && statusIds.has("trigger_erase_buffs_at_5")) {
    const before = (next.playerStatuses ?? []).slice();
    const after = before.filter((s: any) => !isPlayerBuffStatusId(String(s?.id ?? "")));
    next = { ...next, playerStatuses: after };
    next = removeEnemyStatusById(next, enemyId, "trigger_erase_buffs_at_5");

    const meta: any = { ...(next.meta ?? {}) };
    meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
    meta.statusFlashId = "trigger_erase_buffs_at_5";
    meta.statusFlashTarget = "player";
    next = { ...next, meta };
  }

  // Demonic Dust Bunny: at <=20 HP, clone itself at current HP (once per bunny instance)
  if (hp <= 20 && statusIds.has("trigger_clone_at_20")) {
    next = removeEnemyStatusById(next, enemyId, "trigger_clone_at_20");
    next = spawnCloneEnemyFromEnemy(next, enemyId, hp, rng);

    const meta: any = { ...(next.meta ?? {}) };
    meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
    meta.statusFlashId = "trigger_clone_at_20";
    meta.statusFlashTarget = enemyId;
    next = { ...next, meta };
  }

  return next;
}

function applyDamageToEnemyById(state: BattleState, enemyId: string, dmg: number, rng: RNG, trackHit: boolean = false): BattleState {
  state = ensureDeskShieldTarget(state);
  const meta0: any = { ...(state as any).meta };
  const desk = state.enemies.find((e: any) => String(e?.id ?? "") === "defensive_desk" && (e?.hp ?? 0) > 0) as any;
  const shieldTarget = String(meta0?.deskShieldTargetId ?? "");
  const isPhone = String(enemyId ?? "").startsWith("smartphone_");
  // IMPORTANT: redirect should only apply for single-target hits.
  // AoE uses applyDamageToAllEnemies which passes trackHit=false, so we can key off that.
  const allowRedirect = trackHit;
  const redirected = allowRedirect && isPhone && desk && shieldTarget && shieldTarget === enemyId;
  const effectiveEnemyId = redirected ? String(desk.id) : enemyId;

  const target = state.enemies.find((e) => e.id === effectiveEnemyId) ?? state.enemies[0];
  if (!target) return state;

  let remaining = Math.max(0, Math.floor(Number(dmg ?? 0)));
  const curBlock = Math.max(0, Math.floor(Number((target as any).block ?? 0)));

  const blocked = Math.min(curBlock, remaining);
  const newBlock = curBlock - blocked;
  remaining -= blocked;

  const curHP = Math.max(0, Math.floor(Number(target.hp ?? 0)));
  const newHP = Math.max(0, curHP - remaining);
  
  const actualDamage = curHP - newHP;

  let next = state;
  if (newBlock !== curBlock) next = setEnemyBlockById(next, target.id, newBlock);
  if (newHP !== curHP) {
    next = setEnemyHPById(next, target.id, newHP);

    // Custom passive: when hit, gain Strength (Substitute Teacher).
    if (actualDamage > 0 && getStacks((target as any).statuses, "gain_strength_when_hit") > 0) {
      next = addEnemyStatus(next, target.id, "strength", 1);
    }

    // Track individual hit for multi-attack popups
    if (trackHit && actualDamage > 0) {
      const meta: any = { ...(next.meta ?? {}) };
      meta.damageEvents = [...(meta.damageEvents ?? []), { target: enemyId, amount: actualDamage, timestamp: Date.now() }];
      next = { ...next, meta };
    }

    // Enemy HP-based triggers (custom enemy behaviors)
    next = applyEnemyHpThresholdTriggers(next, target.id, rng);

    // Smart Phones: if this hit caused the fight to become "last phone standing",
    // immediately populate the remaining phone's full 3-step intent list.
    try {
      const phoneIds = ["smartphone_a", "smartphone_b", "smartphone_c"];
      const alivePhones = (next.enemies ?? []).filter((e: any) => phoneIds.includes(String(e?.id ?? "")) && (e?.hp ?? 0) > 0);
      if (alivePhones.length === 1) {
        const only = alivePhones[0] as any;
        const ai: any = only?.ai;
        const seq = Array.isArray(ai?.sequence) ? (ai.sequence as any[]) : [];
        if (seq.length > 0) {
          const baseIdx = Math.max(0, Math.floor(Number((only as any).aiSeqIndex ?? 0)));
          const triple = [0, 1, 2].map((k) => intentFromMove(seq[(baseIdx + k) % seq.length]));
          next = {
            ...next,
            enemies: (next.enemies ?? []).map((e: any) =>
              String(e?.id ?? "") === String(only?.id ?? "") ? { ...e, intent: triple[0], intents: triple } : e
            ),
          };
        }
      }
    } catch {}
    // If a summoner died from this damage, schedule bound minions to collapse.
    next = applySummonerDeathCascade(next, rng);
  }
  if (actualDamage > 0 || blocked > 0) {
    const nm = String((target as any).name ?? target.id);
    const parts: string[] = [];
    if (actualDamage > 0) parts.push(`${actualDamage} dmg`);
    if (blocked > 0) parts.push(`${blocked} blocked`);
    if (redirected) {
      // UI hook: let the BattleScreen flash the shield/defended icons when a redirect happens.
      const metaR: any = { ...(next.meta ?? {}) };
      metaR.deskShieldHitNonce = Number(metaR.deskShieldHitNonce ?? 0) + 1;
      metaR.deskShieldHitPhoneId = String(enemyId);
      metaR.deskShieldHitDeskId = String(desk?.id ?? "defensive_desk");
      next = { ...next, meta: metaR };
      next = pushBattleLog(next, `Player hit ${nm} while it shielded ${String(enemyId).replace("smartphone_", "Smart Phone ")} (${parts.join(", ")}).`);
    } else {
      next = pushBattleLog(next, `Player hit ${nm} (${parts.join(", ")}).`);
    }
  }
  return next;
}

function applyPierceDamageToEnemyById(state: BattleState, enemyId: string, dmg: number, rng: RNG, trackHit: boolean = false): BattleState {
  state = ensureDeskShieldTarget(state);
  const meta0: any = { ...(state as any).meta };
  const desk = state.enemies.find((e: any) => String(e?.id ?? "") === "defensive_desk" && (e?.hp ?? 0) > 0) as any;
  const shieldTarget = String(meta0?.deskShieldTargetId ?? "");
  const isPhone = String(enemyId ?? "").startsWith("smartphone_");
  const redirected = isPhone && desk && shieldTarget && shieldTarget === enemyId;
  const effectiveEnemyId = redirected ? String(desk.id) : enemyId;

  const target = state.enemies.find((e) => e.id === effectiveEnemyId) ?? state.enemies[0];
  if (!target) return state;

  const amount = Math.max(0, Math.floor(Number(dmg ?? 0)));
  const curHP = Math.max(0, Math.floor(Number(target.hp ?? 0)));
  const newHP = Math.max(0, curHP - amount);
  const actualDamage = curHP - newHP;

  let next = state;
  if (newHP !== curHP) {
    next = setEnemyHPById(next, target.id, newHP);

    // Custom passive: when hit, gain Strength (Substitute Teacher).
    if (actualDamage > 0 && getStacks((target as any).statuses, "gain_strength_when_hit") > 0) {
      next = addEnemyStatus(next, target.id, "strength", 1);
      const meta: any = { ...(next.meta ?? {}) };
      meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
      meta.statusFlashId = "gain_strength_when_hit";
      meta.statusFlashTarget = target.id;
      next = { ...next, meta };
    }

    if (trackHit && actualDamage > 0) {
      const meta: any = { ...(next.meta ?? {}) };
      meta.damageEvents = [...(meta.damageEvents ?? []), { target: enemyId, amount: actualDamage, timestamp: Date.now() }];
      next = { ...next, meta };
    }

    next = applyEnemyHpThresholdTriggers(next, target.id, rng);
  }

  if (actualDamage > 0) {
    const nm = String((target as any).name ?? target.id);
    if (redirected) {
      const metaR: any = { ...(next.meta ?? {}) };
      metaR.deskShieldHitNonce = Number(metaR.deskShieldHitNonce ?? 0) + 1;
      metaR.deskShieldHitPhoneId = String(enemyId);
      metaR.deskShieldHitDeskId = String(desk?.id ?? "defensive_desk");
      next = { ...next, meta: metaR };
      next = pushBattleLog(next, `Player pierced ${nm} while it shielded ${String(enemyId).replace("smartphone_", "Smart Phone ")} for ${actualDamage} dmg.`);
    } else {
      next = pushBattleLog(next, `Player pierced ${nm} for ${actualDamage} dmg.`);
    }
  }
  return next;
}

function applyDamageToAllEnemies(state: BattleState, dmgEach: number, rng: RNG): BattleState {
  let next = state;
  const amt = Math.max(0, Math.floor(Number(dmgEach ?? 0)));
  for (const en of next.enemies) {
    if ((en.hp ?? 0) > 0) next = applyDamageToEnemyById(next, en.id, amt, rng);
  }
  return next;
}

function applyCardEffectCorrect(opts: { rng: RNG; state: BattleState; cardId: string }): BattleState {
  try {
  const { rng, state, cardId } = opts;
  const def: any = getCardDef(cardId);
    if (!def) {
      console.error("Card not found:", cardId);
      return state;
    }
  const eff: any = def.effect;

  let next: BattleState = state;

  // Helper: apply block gains from a card, with event-only supply modifiers.
  const gainBlockFromCard = (baseAmt: number) => {
    const base = Math.max(0, Math.floor(Number(baseAmt ?? 0)));
    const isBlockCardPlay = String(def?.type ?? "") === "BLOCK";
    const bonus = isBlockCardPlay && battleHasSupply(next, "sup_strength_to_block")
      ? Math.max(0, Math.floor(Number(getStacks(next.playerStatuses, "strength") ?? 0)))
      : 0;
    const total = base + bonus;
    if (total <= 0) return;
    next = { ...next, playerBlock: (next.playerBlock ?? 0) + total };
    next = pushBattleLog(next, `Player gained ${total} block.`);
  };

  // Confidence: double next attack
  const hasDouble = getStacks(next.playerStatuses, "double_attack") > 0;

  const consumeDoubleAttack = () => {
    if (!hasDouble) return;
    next = { ...next, playerStatuses: removeOneStack(next.playerStatuses, "double_attack") };
  };

  const applySingleHitToTarget = (targetId: string, base: number, trackHit: boolean = false) => {
    // IMPORTANT: If Defensive Desk will redirect this hit, we must calculate damage
    // using the desk's statuses (e.g. Vulnerable) as the defender.
    const meta0: any = { ...(next as any).meta };
    const desk = (next.enemies ?? []).find((e: any) => String(e?.id ?? "") === "defensive_desk" && (e?.hp ?? 0) > 0) as any;
    const shieldTarget = String(meta0?.deskShieldTargetId ?? "");
    const isPhone = String(targetId ?? "").startsWith("smartphone_");
    const willRedirect = Boolean(trackHit && isPhone && desk && shieldTarget && shieldTarget === String(targetId));
    const effectiveTargetId = willRedirect ? String(desk.id) : String(targetId);

    const target = next.enemies.find((e) => e.id === effectiveTargetId) ?? next.enemies[0];
    const modified = modifyAttackDamage(base, next.playerStatuses, target?.statuses);
    const final = hasDouble ? modified * 2 : modified;
    const beforeSel = next.selectedEnemyId;
    next = applyDamageToEnemyById(next, targetId, final, rng, trackHit);

    // Keep selection stable during multi-hit attacks so we don't retarget to another enemy
    // if the original target dies mid-sequence.
    if (beforeSel !== targetId) {
      next = { ...next, selectedEnemyId: beforeSel };
    } else {
      next = { ...next, selectedEnemyId: targetId };
    }
  };

  const applySingleHit = (base: number, trackHit: boolean = false) => {
    const targetId = next.selectedEnemyId || next.enemies[0]?.id || "enemy-1";
    applySingleHitToTarget(targetId, base, trackHit);
  };

  const applyAllHits = (base: number) => {
    // Apply per-target damage with per-target vuln/weak considerations
    const ids = aliveEnemies(next).map((e) => e.id);
    for (const id of ids) {
      const target = next.enemies.find((e) => e.id === id);
      const modified = modifyAttackDamage(base, next.playerStatuses, target?.statuses);
      const final = hasDouble ? modified * 2 : modified;
      next = applyDamageToEnemyById(next, id, final, rng);
    }
  };

  switch (eff?.kind) {
    case "damage": {
      applySingleHit(Number(eff.amount ?? 0), true);
      consumeDoubleAttack();
      break;
    }

    case "damage_equal_gold": {
      const runGold = Math.max(0, Math.floor(Number((next as any)?.meta?.runGold ?? 0)));
      applySingleHit(runGold, true);
      consumeDoubleAttack();
      break;
    }

    case "damage_equal_block": {
      const b = Math.max(0, Math.floor(Number(next.playerBlock ?? 0)));
      applySingleHit(b, true);
      consumeDoubleAttack();
      break;
    }
    case "pierce_damage": {
      const targetId = next.selectedEnemyId || next.enemies[0]?.id || "enemy-1";
      const target = next.enemies.find((e) => e.id === targetId) ?? next.enemies[0];
      const modified = modifyAttackDamage(Number(eff.amount ?? 0), next.playerStatuses, target?.statuses);
      const final = hasDouble ? modified * 2 : modified;
      next = applyPierceDamageToEnemyById(next, targetId, final, rng, true);
      consumeDoubleAttack();
      break;
    }
    case "damage_multi": {
      let hits = Math.max(1, Math.floor(Number(eff.hits ?? 1)));
      // Event-only supply: multi-attack cards hit an additional time.
      if (battleHasSupply(next, "sup_multi_attack_plus")) hits += 1;
      const amt = Number(eff.amount ?? 0);
      const lockedTargetId = next.selectedEnemyId || next.enemies[0]?.id || "enemy-1";
      // Track individual hits for multi-attack popups
      for (let i = 0; i < hits; i++) {
        const target = next.enemies.find((e) => e.id === lockedTargetId);
        if (!target || (target.hp ?? 0) <= 0) break;
        applySingleHitToTarget(lockedTargetId, amt, hits > 1);
      }
      consumeDoubleAttack();
      break;
    }
    case "damage_all": {
      applyAllHits(Number(eff.amount ?? 0));
      consumeDoubleAttack();
      break;
    }
    case "block": {
      gainBlockFromCard(Number(eff.amount ?? 0));
      break;
    }
    case "block_draw": {
      gainBlockFromCard(Number(eff.block ?? 0));
      const draw = Math.max(0, Math.floor(Number(eff.draw ?? 0)));
      if (draw > 0) next = drawCards(next, rng, draw);
      break;
    }
    case "block_damage": {
      gainBlockFromCard(Number(eff.block ?? 0));
      // IMPORTANT: Shield Bash style attacks must be treated as a single-target hit
      // so Defensive Desk redirects can trigger.
      applySingleHit(Number(eff.damage ?? 0), true);
      consumeDoubleAttack();
      break;
    }

    case "spend_all_energy_block": {
      const spent = Math.max(0, Math.floor(Number(next.energy ?? 0)));
      const bonusEnergy = Math.max(0, Math.floor(Number(eff.bonusEnergy ?? 0)));
      // Spend all energy.
      next = { ...next, energy: 0 };
      const stacks = spent + bonusEnergy;
      const per = Math.max(0, Math.floor(Number(eff.blockPerEnergy ?? 0)));
      gainBlockFromCard(per * stacks);
      break;
    }

    case "spend_all_energy_damage": {
      const spent = Math.max(0, Math.floor(Number(next.energy ?? 0)));
      const bonusHits = Math.max(0, Math.floor(Number(eff.bonusHits ?? 0)));
      let hits = spent + bonusHits;
      // Event-only supply: multi-attack cards hit an additional time.
      if (hits > 0 && battleHasSupply(next, "sup_multi_attack_plus")) hits += 1;
      const dmg = Math.max(0, Math.floor(Number(eff.damagePerHit ?? 0)));
      // Spend all energy.
      next = { ...next, energy: 0 };
      if (hits <= 0 || dmg <= 0) break;
      const lockedTargetId = next.selectedEnemyId || next.enemies[0]?.id || "enemy-1";
      for (let i = 0; i < hits; i++) {
        const target = next.enemies.find((e) => e.id === lockedTargetId);
        if (!target || (target.hp ?? 0) <= 0) break;
        applySingleHitToTarget(lockedTargetId, dmg, hits > 1);
      }
      consumeDoubleAttack();
      break;
    }
    case "heal": {
      const amt = Math.max(0, Math.floor(Number(eff.amount ?? 0)));
      const before = next.playerHP;
      const after = Math.max(0, Math.min(next.playerMaxHP, before + amt));
      next = { ...next, playerHP: after };
      const healed = Math.max(0, after - before);
      if (healed > 0) {
        const meta: any = { ...(next.meta ?? {}) };
        meta.healEvents = [...(meta.healEvents ?? []), { target: "player", amount: healed, timestamp: Date.now() }];
        next = { ...next, meta };
        next = pushBattleLog(next, `Player healed ${healed} HP.`);
      }
      break;
    }

    case "heal_half_poison": {
      const targetId = next.selectedEnemyId || next.enemies[0]?.id || "enemy-1";
      const target = next.enemies.find((e) => e.id === targetId) ?? next.enemies[0];
      const poison = Math.max(0, Math.floor(Number(getStacks(target?.statuses, "poison") ?? 0)));
      const amt = Math.floor(poison / 2);
      if (amt > 0) {
        const before = next.playerHP;
        const after = Math.max(0, Math.min(next.playerMaxHP, before + amt));
        next = { ...next, playerHP: after };
        const healed = Math.max(0, after - before);
        if (healed > 0) {
          const meta: any = { ...(next.meta ?? {}) };
          meta.healEvents = [...(meta.healEvents ?? []), { target: "player", amount: healed, timestamp: Date.now() }];
          next = { ...next, meta };
          next = pushBattleLog(next, `Player healed ${healed} HP.`);
        }
      }
      break;
    }
    case "draw": {
      const draw = Math.max(0, Math.floor(Number(eff.amount ?? 0)));
      if (draw > 0) next = drawCards(next, rng, draw);
      break;
    }

    case "increase_max_energy": {
      const amt = Math.max(0, Math.floor(Number(eff.amount ?? 0)));
      if (amt > 0) {
        next = { ...next, maxEnergy: Math.max(0, Math.floor(Number(next.maxEnergy ?? 0))) + amt };
        next = pushBattleLog(next, `Player gained +${amt} max energy each turn.`);
      }
      break;
    }
    case "strength": {
      const amt = Math.max(0, Math.floor(Number(eff.stacks ?? 0)));
      next = addPlayerStatus(next, "strength", amt);
      if (amt > 0) next = pushBattleLog(next, `Player gained ${amt} strength.`);
      break;
    }
    case "double_strength": {
      const s = getStacks(next.playerStatuses, "strength");
      if (s > 0) {
        next = addPlayerStatus(next, "strength", s);
        next = pushBattleLog(next, `Player doubled strength (+${s} strength).`);
      }
      break;
    }
    case "double_block": {
      const before = Math.max(0, Math.floor(Number(next.playerBlock ?? 0)));
      const after = Math.floor(before * 2);
      next = { ...next, playerBlock: after };
      const gained = Math.max(0, after - before);
      if (gained > 0) next = pushBattleLog(next, `Player doubled block (+${gained} block).`);
      break;
    }
    case "double_next_attack": {
      next = addPlayerStatus(next, "double_attack", 1);
      next = pushBattleLog(next, `Player gained Confidence (next attack deals double damage).`);
      break;
    }
    case "cleanse_random_debuff": {
      const debuffs = ["poison", "weak", "vulnerable"].filter((id) => getStacks(next.playerStatuses, id) > 0);
      if (debuffs.length > 0) {
        const pick = debuffs[Math.floor(rng() * debuffs.length)];
        next = { ...next, playerStatuses: (next.playerStatuses ?? []).filter((s) => s.id !== pick) };
        next = pushBattleLog(next, `Player cleansed ${pick}.`);
      }
      break;
    }
    case "apply_poison": {
      const targetId = next.selectedEnemyId || next.enemies[0]?.id || "enemy-1";
      const before = getStacks((next.enemies ?? []).find((e: any) => String(e?.id ?? "") === String(targetId))?.statuses, "poison");
      next = addEnemyStatus(next, targetId, "poison", Math.floor(Number(eff.stacks ?? 0)));
      const after = getStacks((next.enemies ?? []).find((e: any) => String(e?.id ?? "") === String(targetId))?.statuses, "poison");

      // Only flash poison if poison was actually applied. (If the target is Toxic Immune,
      // addEnemyStatus will trigger a toxic_immunity flash instead.)
      if (after > before) {
        const meta: any = { ...(next.meta ?? {}) };
        meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
        meta.statusFlashId = "poison";
        meta.statusFlashTarget = targetId;
        next = { ...next, meta };
      }
      break;
    }
    case "apply_vulnerable": {
      const targetId = next.selectedEnemyId || next.enemies[0]?.id || "enemy-1";
      next = addEnemyStatus(next, targetId, "vulnerable", Math.floor(Number(eff.stacks ?? 0)));

      const meta: any = { ...(next.meta ?? {}) };
      meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
      meta.statusFlashId = "vulnerable";
      meta.statusFlashTarget = targetId;
      next = { ...next, meta };
      break;
    }
    case "apply_weak": {
      const targetId = next.selectedEnemyId || next.enemies[0]?.id || "enemy-1";
      next = addEnemyStatus(next, targetId, "weak", Math.floor(Number(eff.stacks ?? 0)));

      const meta: any = { ...(next.meta ?? {}) };
      meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
      meta.statusFlashId = "weak";
      meta.statusFlashTarget = targetId;
      next = { ...next, meta };
      break;
    }
    case "double_poison_target": {
      const targetId = next.selectedEnemyId || next.enemies[0]?.id || "enemy-1";
      const target = next.enemies.find((e) => e.id === targetId) ?? next.enemies[0];
      const cur = getStacks(target?.statuses, "poison");
      if (cur > 0) {
        const before = getStacks((next.enemies ?? []).find((e: any) => String(e?.id ?? "") === String(targetId))?.statuses, "poison");
        next = addEnemyStatus(next, targetId, "poison", cur);
        const after = getStacks((next.enemies ?? []).find((e: any) => String(e?.id ?? "") === String(targetId))?.statuses, "poison");
        if (after > before) {
          const meta2: any = { ...(next.meta ?? {}) };
          meta2.statusFlashNonce = Number(meta2.statusFlashNonce ?? 0) + 1;
          meta2.statusFlashId = "poison";
          meta2.statusFlashTarget = targetId;
          next = { ...next, meta: meta2 };
        }
      }
      break;
    }
    case "mulligan": {
      // Discard 1 chosen card from hand, then draw 1.
      // We pause the battle UI to let the player pick the discard.
      if ((next.hand ?? []).length === 0) {
        next = drawCards(next, rng, 1);
        break;
      }
      next = { ...next, awaitingDiscard: { count: 1, then: { kind: "draw", amount: 1 } } };
      break;
    }
    default:
      break;
  }

  return next;
} catch (err) {
    console.error("Error applying card effect:", err, { cardId: opts.cardId });
    return opts.state;
  }
}

// Validation function to ensure battle state is always valid
// Only fixes critical issues, doesn't recreate the entire object to preserve structure
function validateBattleState(state: BattleState): BattleState {
  // If state is null/undefined, we can't fix it - return as-is and let error handling catch it
  if (!state || typeof state !== 'object') {
    console.error("validateBattleState: Invalid state", state);
    return state;
  }
  
  // For now, just return the state as-is - the validation was too aggressive
  // Only validate if there are actual issues
  try {
    // Quick sanity check - if critical properties are missing, log but don't break
    if (typeof state.playerHP !== 'number' || typeof state.playerMaxHP !== 'number') {
      console.warn("validateBattleState: Missing critical properties", { 
        playerHP: state.playerHP, 
        playerMaxHP: state.playerMaxHP 
      });
    }
    
    // Return state as-is - don't recreate it
    return state;
  } catch (err) {
    console.error("Error validating battle state:", err, { state });
    // Return original state if validation fails
    return state;
  }
}

function ensureDeskShieldTarget(state: BattleState): BattleState {
  try {
    const deskAlive = (state.enemies ?? []).some((e: any) => String(e?.id ?? "") === "defensive_desk" && (e?.hp ?? 0) > 0);
    if (!deskAlive) return state;

    const order = ["smartphone_a", "smartphone_b", "smartphone_c"];
    const aliveSet = new Set(
      (state.enemies ?? [])
        .filter((e: any) => (e?.hp ?? 0) > 0)
        .map((e: any) => String(e?.id ?? ""))
    );
    const anyPhoneAlive = order.some((id) => aliveSet.has(id));
    if (!anyPhoneAlive) {
      const meta: any = { ...(state.meta ?? {}) };
      meta.deskShieldTargetId = null;
      meta.deskShieldHitPhoneId = null;
      meta.deskShieldHitDeskId = null;
      return { ...state, meta };
    }

    const meta0: any = { ...(state as any).meta };
    const cur = String(meta0?.deskShieldTargetId ?? "");
    if (cur && aliveSet.has(cur)) return state;

    const first = aliveSet.has("smartphone_a")
      ? "smartphone_a"
      : aliveSet.has("smartphone_b")
        ? "smartphone_b"
        : "smartphone_c";

    const meta: any = { ...(state.meta ?? {}) };
    meta.deskShieldTargetId = first;
    meta.deskShieldCycle = first === "smartphone_a" ? 1 : first === "smartphone_b" ? 2 : 0;
    return { ...state, meta };
  } catch {
    return state;
  }
}

export type BattleState = {
  turn: number;
  isBoss: boolean;
  bossMode?: BossMode;

  playerName?: string;
  playerSprite?: SpriteRef;
  playerStatuses: Status[];

  playerHP: number;
  playerMaxHP: number;
  playerBlock: number;

  enemies: EnemyState[];
  selectedEnemyId: string;

  enemyHP: number;
  enemyMaxHP: number;
  enemyIntentDamage: number;

  difficulty: Difficulty;

  // Metadata (non-combat state)
  meta?: {
    supplyId?: string | null; // Legacy: kept for backwards compatibility
    supplyIds?: string[]; // Multiple supplies (new system)
    // UI: battle engine can report that a supply activated; reducer uses this to flash the badge once.
    procSupplyIds?: string[];
    // UI: queue of individual damage hits for multi-attack popups
    damageEvents?: Array<{ target: string; amount: number; timestamp: number }>;

    // UI: queue of individual heal events for heal popups
    healEvents?: Array<{ target: string; amount: number; timestamp: number }>;
    // Streak tracking for consecutive correct answers
    streak?: number;
    streakBonusEnergy?: number; // Temporary energy bonus from streak milestones

    // UI: status effect proc flash hook (player or specific enemy id)
    statusFlashNonce?: number;
    statusFlashId?: string;
    statusFlashTarget?: "player" | string;

    // UI: when Perfect Record blocks a negative-card intent, we can still flash that intent red.
    blockedNegativeCardNonce?: number;
    blockedNegativeCardByEnemyId?: string;

    // Permanent deck mutations that happened during the battle (ex: curses added by enemies)
    deckAdditions?: string[];

    pendingForcedQuestionDamage?: number;
    pendingForcedQuestionByEnemyId?: string;

    pendingHandExhaustCount?: number;
    pendingHandExhaustByEnemyId?: string;
    pendingHandExhaustNonce?: number;

    cleanseFlashNonce?: number;
    cleanseFlashEnemyId?: string;
    cleanseFlashStatusIds?: string[];

    // UI: per-battle log of actions
    battleLog?: Array<{ t: number; turn: number; text: string }>;
  };

  energy: number;
  maxEnergy: number;

  drawPile: string[];
  hand: string[];
  discardPile: string[];
  exhaustPile: string[];

  awaiting: null | {
    cardId: string;
    question: { prompt: string; answer: string | number; hint?: string };
  };

  awaitingDiscard?: null | {
    count: number;
    then?: { kind: "draw"; amount: number };
  };

  lastResult?: { correct: boolean; message: string } | null;
};

function pushBattleLog(state: BattleState, text: string): BattleState {
  const line = {
    t: Date.now(),
    turn: Math.max(1, Math.floor(Number(state.turn ?? 1))),
    text: String(text ?? ""),
  };
  const meta: any = { ...(state.meta ?? {}) };
  meta.battleLog = [...(meta.battleLog ?? []), line].slice(-400);
  return { ...state, meta };
}

function shuffle<T>(rng: RNG, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawOne(state: BattleState, rng: RNG): BattleState {
  let drawPile = state.drawPile.slice();
  let discardPile = state.discardPile.slice();
  const hand = state.hand.slice();
  const exhaustPile = (state.exhaustPile ?? []).slice();

  if (drawPile.length === 0) {
    if (discardPile.length === 0) return state;
    const n = discardPile.length;
    const neg = discardPile.filter((cid) => String(cid ?? "").startsWith("neg_")).length;
    drawPile = shuffle(rng, discardPile);
    discardPile = [];
    state = pushBattleLog(
      state,
      `Reshuffled discard into draw pile (${n} card${n === 1 ? "" : "s"}${neg > 0 ? `, ${neg} cursed` : ""}).`
    );
  }

  const top = drawPile.shift();
  if (!top) return { ...state, drawPile, discardPile };

  const topId = String(top);

  const isNegative = topId.startsWith("neg_");
  const applyNegativeDrawBurst = (s: BattleState): BattleState => {
    if (!isNegative) return s;
    if (!battleHasSupply(s, "sup_negative_draw_burst")) return s;

    const amt = 5;
    let next = s;
    // Deal damage with popups, but treat this like AoE (no Defensive Desk redirect).
    // IMPORTANT: look up the target each time (summoner death cascades can kill minions mid-loop).
    const ids = aliveEnemies(next).map((e) => e.id);
    for (const id of ids) {
      const before = next.enemies.find((e) => e.id === id);
      const beforeHP = Math.max(0, Math.floor(Number(before?.hp ?? 0)));
      if (beforeHP <= 0) continue;

      next = applyDamageToEnemyById(next, id, amt, rng, false);
      const after = next.enemies.find((e) => e.id === id);
      const afterHP = Math.max(0, Math.floor(Number(after?.hp ?? 0)));
      const actual = Math.max(0, beforeHP - afterHP);
      if (actual > 0) {
        const meta: any = { ...(next.meta ?? {}) };
        meta.damageEvents = [...(meta.damageEvents ?? []), { target: id, amount: actual, timestamp: Date.now() }];
        next = { ...next, meta };
      }
    }

    next = markSupplyProc(next, "sup_negative_draw_burst");
    return next;
  };

  if (topId === "neg_radiation" || topId === "neg_radiation_perm") {
    const meta: any = { ...(state.meta ?? {}) };
    meta.energyDrainNonce = Number(meta.energyDrainNonce ?? 0) + 1;
    meta.negativeCardEvents = [...(meta.negativeCardEvents ?? []), { cardId: topId, timestamp: Date.now() }];
    const energy = Math.max(0, Math.floor(Number(state.energy ?? 0)) - 1);
    if (topId === "neg_radiation_perm") {
      // Permanent Radiation should stick around (no Exhaust): it stays in hand like a curse, then discards at end of turn.
      hand.push(topId);
    } else {
      // Temporary Radiation exhausts on draw and is removed after battle.
      exhaustPile.push(topId);
    }
    return applyNegativeDrawBurst({ ...state, meta, energy, drawPile, discardPile, exhaustPile, hand });
  }

  if (topId === "neg_infestation" || topId === "neg_infestation_perm") {
    const meta: any = { ...(state.meta ?? {}) };
    meta.negativeCardEvents = [...(meta.negativeCardEvents ?? []), { cardId: topId, timestamp: Date.now() }];

    if (hand.length > 0) {
      const idx = Math.max(0, Math.min(hand.length - 1, Math.floor(rng() * hand.length)));
      const discarded = String(hand[idx] ?? "");
      if (discarded) {
        hand.splice(idx, 1);
        discardPile.push(discarded);

        meta.handDiscardFlashNonce = Number(meta.handDiscardFlashNonce ?? 0) + 1;
        meta.handDiscardFlashCardId = discarded;
      }
    }

    if (topId === "neg_infestation_perm") {
      // Permanent Infestation should stick around (no Exhaust): it stays in hand like a curse, then discards at end of turn.
      hand.push(topId);
    } else {
      // Temporary Infestation exhausts on draw and is removed after battle.
      exhaustPile.push(topId);
    }
    return applyNegativeDrawBurst({ ...state, meta, drawPile, discardPile, exhaustPile, hand });
  }

  if (isNegative) {
    const meta: any = { ...(state.meta ?? {}) };
    meta.negativeCardEvents = [...(meta.negativeCardEvents ?? []), { cardId: topId, timestamp: Date.now() }];
    state = { ...state, meta };
  }

  hand.push(topId);
  return applyNegativeDrawBurst({ ...state, drawPile, discardPile, exhaustPile, hand });
}

function isExhaustCard(cardId: string): boolean {
  return Boolean((getCardDef(cardId) as any)?.exhaust);
}

function isEndOfTurnExhaustCard(cardId: string): boolean {
  try {
    const noEndTurnExhaust = new Set(["neg_infestation_perm", "neg_radiation_perm"]);
    if (noEndTurnExhaust.has(String(cardId ?? ""))) return false;

    const def: any = getCardDef(cardId);
    const isNegCurse =
      String(cardId ?? "").startsWith("neg_") &&
      String(def?.effect?.kind ?? "") === "curse" &&
      // Pop Quiz is a playable "exhaust on play" card, not an end-of-turn exhaust curse.
      String(cardId ?? "") !== "neg_pop_quiz";
    return isNegCurse;
  } catch {
    return false;
  }
}

function drawToHandSize(state: BattleState, rng: RNG, target: number): BattleState {
  let next = { ...state };
  while (next.hand.length < target) {
    const before = next.hand.length;
    next = drawOne(next, rng);
    if (next.hand.length === before) break;
  }
  return next;
}

// Exposed for consumables and future systems (relics/supplies/etc).
export function drawCards(state: BattleState, rng: RNG, count: number): BattleState {
  let next = { ...state };
  const n = Math.max(0, Math.floor(count));

  for (let i = 0; i < n; i++) {
    const before = next.hand.length;
    next = drawOne(next, rng);
    if (next.hand.length === before) break;
  }

  return next;
}

function bossModeForTurn(isBoss: boolean, turn: number): BossMode {
  // Boss WARD/STRIKE was an old Mrs. Pain mechanic; bosses should not force
  // card types anymore.
  return "NONE";
}

function aliveEnemies(state: BattleState): EnemyState[] {
  return (state.enemies ?? []).filter((e) => (e.hp ?? 0) > 0);
}

function allEnemiesDefeated(state: BattleState): boolean {
  return aliveEnemies(state).length === 0;
}

function ensureValidTarget(state: BattleState): BattleState {
  const alive = aliveEnemies(state);
  if (alive.length === 0) return state;
  const sel = state.selectedEnemyId;
  const selAlive = alive.some((e) => e.id === sel);
  return selAlive ? state : { ...state, selectedEnemyId: alive[0].id };
}

function setEnemyHPById(state: BattleState, enemyId: string, newHP: number): BattleState {
  const enemies = state.enemies.slice();
  const idx = enemies.findIndex((e) => e.id === enemyId);
  if (idx < 0) return state;

  enemies[idx] = { ...enemies[idx], hp: newHP };

  // Keep legacy fields in sync with the primary (index 0)
  const primary = enemies[0];
  const next: BattleState = {
    ...state,
    enemies,
    enemyHP: primary?.hp ?? state.enemyHP,
    enemyMaxHP: primary?.maxHP ?? state.enemyMaxHP,
    enemyIntentDamage: intentLegacyDamage(primary?.intent) ?? state.enemyIntentDamage,
  };

  return ensureValidTarget(next);
}

function setEnemyBlockById(state: BattleState, enemyId: string, newBlock: number): BattleState {
  const enemies = state.enemies.slice();
  const idx = enemies.findIndex((e) => e.id === enemyId);
  if (idx < 0) return state;

  enemies[idx] = { ...enemies[idx], block: Math.max(0, Math.floor(Number(newBlock ?? 0))) };

  // Keep legacy fields in sync with the primary (index 0)
  const primary = enemies[0];
  const next: BattleState = {
    ...state,
    enemies,
    enemyHP: primary?.hp ?? state.enemyHP,
    enemyMaxHP: primary?.maxHP ?? state.enemyMaxHP,
    enemyIntentDamage: intentLegacyDamage(primary?.intent) ?? state.enemyIntentDamage,
  };

  return ensureValidTarget(next);
}

function setEnemyIntentById(
  state: BattleState,
  enemyId: string,
  intent: EnemyIntent,
  lastKind?: EnemyIntent["kind"],
  aiSeqIndex?: number,
  aiSeqKey?: string
): BattleState {
  const enemies = state.enemies.slice();
  const idx = enemies.findIndex((e) => e.id === enemyId);
  if (idx < 0) return state;

  enemies[idx] = {
    ...enemies[idx],
    intent,
    intents: undefined, // Clear intents array when setting single intent
    lastIntentKind: lastKind ?? intent.kind,
    aiSeqIndex: aiSeqIndex ?? (enemies[idx] as any).aiSeqIndex,
    aiSeqKey: aiSeqKey ?? (enemies[idx] as any).aiSeqKey,
  };

  // Keep legacy fields in sync with the primary (index 0)
  const primary = enemies[0];
  const next: BattleState = {
    ...state,
    enemies,
    enemyHP: primary?.hp ?? state.enemyHP,
    enemyMaxHP: primary?.maxHP ?? state.enemyMaxHP,
    enemyIntentDamage: intentLegacyDamage(primary?.intent) ?? state.enemyIntentDamage,
  };

  return ensureValidTarget(next);
}


function setPrimaryEnemyHP(state: BattleState, newHP: number): BattleState {
  const primaryId = state.enemies[0]?.id;
  if (!primaryId) return { ...state, enemyHP: newHP };
  return setEnemyHPById(state, primaryId, newHP);
}

export function startBattle(opts: {
  rng: RNG;
  difficulty: Difficulty;
  isBoss: boolean;
  playerHpStart: number;
  playerMaxHp: number;
  deckCardIds: string[];
  playerName?: string;
  playerSprite?: SpriteRef;
  enemies?: EnemyState[];
}): BattleState {
  const { rng, difficulty, isBoss, playerHpStart, playerMaxHp, deckCardIds } = opts;

  // Increased difficulty: more HP and damage
  const enemyMaxHP = isBoss ? 65 : 38 + (difficulty - 1) * 8;
  const enemyIntentDamage = isBoss ? 12 : 8 + (difficulty - 1) * 3;

  const defaultDeck = ["strike", "strike", "block", "block", "skill"];
  const deck = deckCardIds?.length ? deckCardIds.slice() : defaultDeck.slice();
  while (deck.length < 5) deck.push(defaultDeck[deck.length % defaultDeck.length]);

  const drawPile = shuffle(rng, deck);

  const enemies: EnemyState[] =
    opts.enemies?.length
      ? opts.enemies.map((e) => {
          // If an enemy is pre-seeded with an intent, keep it; otherwise roll using its AI.
          const seededIntent = (e as any).intent as EnemyIntent | undefined;
          const seededIntents = Array.isArray((e as any).intents) && (e as any).intents.length > 1
            ? ((e as any).intents as EnemyIntent[])
            : undefined;

          const rolled = seededIntent
            ? {
                intent: seededIntent,
                intents: seededIntents,
                seqIndex: Number((e as any).aiSeqIndex ?? 0),
                seqKey: (e as any).aiSeqKey as string | undefined,
              }
            : rollIntentFromAI((e as any).ai, opts.rng, {
                lastKind: (e as any).lastIntentKind,
                seqIndex: Number((e as any).aiSeqIndex ?? 0),
                seqKey: (e as any).aiSeqKey as string | undefined,
                hp: e.hp,
                maxHP: e.maxHP,
              });

          const intent = rolled.intent;
          // Only set intents array if there are actually multiple intents
          const intents = rolled.intents && rolled.intents.length > 1 ? rolled.intents : undefined;

          return {
            id: e.id,
            name: e.name,
            hp: e.hp,
            maxHP: e.maxHP,
            block: Number((e as any).block ?? 0),
            intent,
            intents, // Only set if multiple intents exist
            lastIntentKind: (e as any).lastIntentKind ?? intent.kind,
            ai: (e as any).ai,
            aiSeqIndex: rolled.seqIndex,
            aiSeqKey: rolled.seqKey,
            sprite: e.sprite,
            statuses: e.statuses ?? [],
          };
        })
      : [
          {
            id: "enemy-1",
            name: isBoss ? "Boss" : "Enemy",
            hp: enemyMaxHP,
            maxHP: enemyMaxHP,
            block: 0,
            intent: { kind: "ATTACK", dmg: enemyIntentDamage, hits: 1 },
            lastIntentKind: "ATTACK",
            ai: undefined,
            aiSeqIndex: 0,
            aiSeqKey: undefined,
            sprite: { kind: "emoji", value: isBoss ? "👹" : "👾" },
            statuses: [],
          },
        ];

  const primary = enemies[0];

  const base: BattleState = {
    isBoss,
    bossMode: bossModeForTurn(isBoss, 1),
    turn: 1,

    playerName: opts.playerName ?? "Player",
    playerSprite: opts.playerSprite,
    playerStatuses: [],

    playerHP: playerHpStart,
    playerMaxHP: playerMaxHp,
    playerBlock: 0,

    enemies,
    selectedEnemyId: primary?.id ?? (enemies[0]?.id ?? "enemy-1"),

    enemyHP: primary?.hp ?? enemyMaxHP,
    enemyMaxHP: primary?.maxHP ?? enemyMaxHP,
    enemyIntentDamage: intentLegacyDamage(primary?.intent) ?? enemyIntentDamage,

    difficulty,

    energy: 3,
    maxEnergy: 3,

    drawPile,
    hand: [],
    discardPile: [],
    exhaustPile: [],

    awaiting: null,
    awaitingDiscard: null,
    lastResult: null,
  };

  let withLog = pushBattleLog(base, `Shuffled deck at battle start (${deck.length} cards).`);

  // Smart Phones: if only one is alive at battle start, telegraph its full 3-step sequence.
  try {
    const phoneIds = ["smartphone_a", "smartphone_b", "smartphone_c"];
    const alivePhones = (withLog.enemies ?? []).filter((e: any) => phoneIds.includes(String(e?.id ?? "")) && (e?.hp ?? 0) > 0);
    if (alivePhones.length === 1) {
      const only = alivePhones[0] as any;
      const ai: any = only?.ai;
      const seq = Array.isArray(ai?.sequence) ? (ai.sequence as any[]) : [];
      if (seq.length > 0) {
        const baseIdx = Math.max(0, Math.floor(Number((only as any).aiSeqIndex ?? 0)));
        const triple = [0, 1, 2].map((k) => intentFromMove(seq[(baseIdx + k) % seq.length]));
        withLog = {
          ...withLog,
          enemies: (withLog.enemies ?? []).map((e: any) =>
            String(e?.id ?? "") === String(only?.id ?? "") ? { ...e, intent: triple[0], intents: triple } : e
          ),
        };
      }
    }
  } catch {}

  // Defensive Desk: choose an initial phone to shield immediately so turn 1 redirects work.
  try {
    const hasDesk = (withLog.enemies ?? []).some((e: any) => String(e?.id ?? "") === "defensive_desk" && (e?.hp ?? 0) > 0);
    if (hasDesk) {
      const phoneIds = ["smartphone_a", "smartphone_b", "smartphone_c"];
      const alivePhones = (withLog.enemies ?? []).filter((e: any) => phoneIds.includes(String(e?.id ?? "")) && (e?.hp ?? 0) > 0);
      const aliveSet = new Set(alivePhones.map((e: any) => String(e?.id ?? "")));
      const first = aliveSet.has("smartphone_a")
        ? "smartphone_a"
        : aliveSet.has("smartphone_b")
          ? "smartphone_b"
          : aliveSet.has("smartphone_c")
            ? "smartphone_c"
            : null;
      if (first) {
        const meta: any = { ...(withLog.meta ?? {}) };
        meta.deskShieldTargetId = first;
        meta.deskShieldCycle = 1;
        withLog = { ...withLog, meta };
        withLog = pushBattleLog(withLog, `Defensive Desk shielded ${String(first).replace("smartphone_", "Smart Phone ")}.`);
      }
    }
  } catch {}

  return drawToHandSize(withLog, rng, 5);
}

export function chooseCard(state: BattleState, rng: RNG, cardId: string): BattleState {
  state = ensureValidTarget(state);
  if (state.playerHP <= 0 || allEnemiesDefeated(state)) return state;
  if (state.awaiting) return state;
  if ((state as any).awaitingDiscard) return state;

  // Pop Quiz: must be played before any other cards.
  try {
    const hasPopQuiz = Array.isArray(state.hand) && state.hand.some((id: any) => String(id ?? "") === "neg_pop_quiz");
    if (hasPopQuiz && String(cardId ?? "") !== "neg_pop_quiz") {
      return { ...state, lastResult: { correct: false, message: "Pop Quiz: play it before any other cards." } };
    }
  } catch {}

  // Negative curse cards: play instantly (no question prompt).
  // This keeps boss-curses like Pop Quiz from entering the normal question pipeline.
  try {
    const def0: any = getCardDef(cardId);
    const isNegCurse =
      String(cardId ?? "").startsWith("neg_") &&
      String(def0?.effect?.kind ?? "") === "curse" &&
      !(def0 as any)?.unplayable &&
      String(cardId ?? "") !== "neg_pop_quiz";
    if (isNegCurse) {
    const cost = cardCost(cardId);
    if (state.energy < cost) {
      return { ...state, lastResult: { correct: false, message: "Not enough energy." } };
    }

    const hand = state.hand.slice();
    const idx = hand.indexOf(cardId);
    if (idx >= 0) hand.splice(idx, 1);

    const discardPile = state.discardPile.slice();
    const exhaustPile = (state.exhaustPile ?? []).slice();
    if (isExhaustCard(cardId)) exhaustPile.push(cardId);
    else discardPile.push(cardId);

    let next: BattleState = {
      ...state,
      energy: (state.energy ?? 0) - cost,
      hand,
      discardPile,
      exhaustPile,
      awaiting: null,
      awaitingDiscard: null,
      lastResult: { correct: true, message: "Pop Quiz." },
    };

    next = pushBattleLog(next, `Player used ${String(getCardDef(cardId)?.name ?? cardId)}.`);
    next = applyCardEffectCorrect({ rng, state: next, cardId });
    return validateBattleState(next);
    }
  } catch {}

  const cost = cardCost(cardId);
  if (state.energy < cost) {
    return { ...state, lastResult: { correct: false, message: "Not enough energy." } };
  }

  // Supply: 4+ Test — attack cards play instantly (no question prompt).
  const supplyIds = (state as any)?.meta?.supplyIds ?? ((state as any)?.meta?.supplyId ? [(state as any).meta.supplyId] : []);
  if (supplyIds.includes("sup_no_questions") && isAttackCard(cardId)) {

    // Remove one instance from hand
    const hand = state.hand.slice();
    const idx = hand.indexOf(cardId);
    if (idx >= 0) hand.splice(idx, 1);

    const discardPile = state.discardPile.slice();
    const exhaustPile = (state.exhaustPile ?? []).slice();
    if (isExhaustCard(cardId)) exhaustPile.push(cardId);
    else discardPile.push(cardId);

    // Apply effect immediately
    let next: BattleState = {
      ...state,
      energy: (state.energy ?? 0) - cost,
      hand,
      discardPile,
      exhaustPile,
      awaiting: null,
      awaitingDiscard: null,
      lastResult: null,
      meta: {
        ...(state.meta ?? {}),
        supplyId: supplyIds[0] ?? null, // Legacy compatibility
        supplyIds,
        procSupplyIds: Array.from(new Set([...(state.meta?.procSupplyIds ?? []), "sup_no_questions"])),
      },
    };

    next = applyCardEffectCorrect({ rng, state: next, cardId });
    return validateBattleState(next);
  }

  // Normal card play: spend energy and ask a question.
  const q = getQuestion({ rng, difficulty: state.difficulty });
  const next: BattleState = {
    ...state,
    energy: (state.energy ?? 0) - cost,
    awaiting: {
      cardId,
      question: {
        prompt: q.prompt,
        answer: q.answer,
        hint: q.hint,
      },
    },
    lastResult: null,
  };

  return validateBattleState(next);
}

export function resolveCardAnswer(opts: { rng: RNG; state: BattleState; input: string }): BattleState {
  try {
    let state = ensureValidTarget(opts.state);
    const rng = opts.rng;

    const awaiting = state.awaiting;
    if (!awaiting) return state;

    const cardId = String(awaiting.cardId);
    const expected = awaiting.question?.answer;

    const parsed = Number(String(opts.input ?? "").trim());
    const correct = Number.isFinite(parsed) && Number.isFinite(Number(expected)) && parsed === Number(expected);

    let next: BattleState = { ...state };

    // Record last question input for run-wide wrong-answer logging
    try {
      const m: any = { ...(next.meta ?? {}) };
      m.lastAnswerInput = String(opts.input ?? "");
      m.lastQuestionPrompt = String(awaiting.question?.prompt ?? "");
      m.lastExpectedAnswer = String(expected ?? "");
      next = { ...next, meta: m };
    } catch {}

    const forcedDmg = Math.max(0, Math.floor(Number(((state as any).meta as any)?.forcedQuestionDamage ?? 0)));
    if (correct) {
      next = pushBattleLog(next, `Player used ${String(getCardDef(cardId)?.name ?? cardId)}.`);
      next = applyCardEffectCorrect({ rng, state: next, cardId });

      // Streak tracking
      const meta: any = { ...(next.meta ?? {}) };
      const prevStreak = Math.max(0, Math.floor(Number(meta.streak ?? 0)));
      const newStreak = prevStreak + 1;
      meta.streak = newStreak;

      // Every 5 correct answers grants +1 bonus energy (available this turn)
      if (newStreak % 5 === 0) {
        meta.streakBonusEnergy = Math.max(0, Math.floor(Number(meta.streakBonusEnergy ?? 0))) + 1;
        next = { ...next, energy: Math.max(0, Math.floor(Number(next.energy ?? 0))) + 1 };
      }

      next = {
        ...next,
        meta,
        lastResult: { correct: true, message: "Correct!" },
      };
    } else {
      // Reset streak on wrong
      const meta: any = { ...(next.meta ?? {}) };
      meta.streak = 0;
      meta.streakBonusEnergy = 0;
      next = pushBattleLog(next, `Player missed the answer for ${String(getCardDef(cardId)?.name ?? cardId)}.`);
      if (forcedDmg > 0) {
        next = pushBattleLog(next, `Punishment: took ${forcedDmg} damage.`);
        next = { ...next, playerHP: Math.max(0, Math.floor(Number(next.playerHP ?? 0)) - forcedDmg) };
      }
      next = { ...next, meta, lastResult: { correct: false, message: "Wrong." } };

      // IMPORTANT: On wrong answers, do NOT apply the card effect.
      // We still discard/exhaust the card below, but we hard-stop any effect application.
      // (This guard is intentionally redundant with the code structure for future safety.)
    }

    // Safety: guarantee no effect application on wrong answers.
    // (All effect application happens above in the `correct` branch.)

    if (forcedDmg > 0) {
      const meta2: any = { ...(next.meta ?? {}) };
      meta2.forcedQuestionDamage = 0;
      next = { ...next, meta: meta2 };
    }

    // Move the played card from hand -> discard/exhaust
    // Exception: Pop Quiz returns to hand if answered wrong.
    const idx = next.hand.indexOf(cardId);
    const hand = next.hand.slice();
    const discardPile = next.discardPile.slice();
    const exhaustPile = (next.exhaustPile ?? []).slice();
    const isPopQuizWrongReturn = !correct && String(cardId ?? "") === "neg_pop_quiz";
    if (!isPopQuizWrongReturn && idx >= 0) {
      hand.splice(idx, 1);
      if (isExhaustCard(cardId)) exhaustPile.push(cardId);
      else discardPile.push(cardId);
    }

    next = { ...next, hand, discardPile, exhaustPile, awaiting: null };
    return validateBattleState(next);
  } catch (err) {
    console.error("resolveCardAnswer: error", err);
    return opts.state;
  }
}

export function startPlayerTurn(state: BattleState, rng: RNG): BattleState {
  state = ensureValidTarget(state);
  if (state.playerHP <= 0 || allEnemiesDefeated(state)) return state;
  if (state.awaiting) return state;

  // Safety: avoid softlock if we are awaiting a discard but the hand is already empty.
  // This can happen when an effect requests a discard at the end of a sequence and the hand is already empty.
  const awaitingDiscard0 = (state as any).awaitingDiscard as any;
  if (awaitingDiscard0) {
    if (!Array.isArray(state.hand) || state.hand.length === 0) {
      let next: BattleState = { ...state, awaitingDiscard: null };
      if (awaitingDiscard0.then?.kind === "draw") {
        next = drawCards(next, rng, awaitingDiscard0.then.amount ?? 0);
      }
      state = next;
    } else {
      return state;
    }
  }

  // Tick poison/regen etc at end of player turn (before enemies act)
  state = applyEndOfTurnTicks(state);

  // Enemy HP threshold triggers must also fire if HP dropped due to ticks (poison).
  // (E.g., Possessed Eraser at <=5 HP.)
  for (const e of state.enemies ?? []) {
    if ((e.hp ?? 0) > 0) state = applyEnemyHpThresholdTriggers(state, e.id, rng);
  }
  if (state.playerHP <= 0 || allEnemiesDefeated(state)) return state;

  // If poison ticks (or other turn ticks) killed a summoner, schedule bound-minion collapse now
  // and do NOT allow those minions to take actions in the upcoming enemy phase.
  state = applySummonerDeathCascade(state, rng);
  const deadSummoners = new Set(
    (state.enemies ?? []).filter((e: any) => (e?.hp ?? 0) <= 0).map((e: any) => String(e?.id ?? ""))
  );

  // Confidence only lasts for the turn it is played.
  state = {
    ...state,
    playerStatuses: (state.playerStatuses ?? []).filter((s: any) => String(s?.id ?? "") !== "double_attack"),
  };

  // Discard remaining hand.
  // IMPORTANT: exhaust should generally only happen when played.
  // Exception: negative curse cards exhaust at end of turn.
  const discardPile = state.discardPile.slice();
  const exhaustPile = (state.exhaustPile ?? []).slice();
  for (const cid of state.hand) {
    if (isEndOfTurnExhaustCard(cid)) exhaustPile.push(cid);
    else discardPile.push(cid);
  }

  // Monsters lose block at the start of their turn (i.e., when the enemy phase begins).
  // Some enemies also have mechanics like auto_block that re-apply block during their action;
  // clearing here prevents block from incorrectly stacking across turns.
  const enemiesResetBlock = (state.enemies ?? []).map((e: any) => ({
    ...e,
    block: 0,
  }));

  const enemyQueue = aliveEnemies(state)
    .filter((e: any) => {
      const sid = String((e as any)?.summonerId ?? "");
      return !sid || !deadSummoners.has(sid);
    })
    .map((e) => e.id);

  return {
    ...state,
    hand: [],
    discardPile,
    exhaustPile,
    enemies: enemiesResetBlock,
    lastResult: null,
    meta: {
      ...(state as any).meta,
      // Snapshot debuffs at the start of the enemy phase so we can tick them reliably.
      // This ensures a re-application on the "expiry" enemy turn does not prevent the old stack from expiring.
      playerHadWeakAtEnemyPhaseStart: getStacks((state as any).playerStatuses, "weak") > 0,
      playerHadVulnerableAtEnemyPhaseStart: getStacks((state as any).playerStatuses, "vulnerable") > 0,
      phase: "ENEMY",
      enemyQueue,
      enemyActIndex: 0,
      enemyActingId: enemyQueue[0] ?? null,
      pendingEnemyAttackId: null,
    },
  };
}

// Backwards-compatible export (BattleScreen + endTurn expect this name).
export function endPlayerTurn(state: BattleState, rng: RNG): BattleState {
  return startPlayerTurn(state, rng);
}

function spawnEnemyFromDef(
  state: BattleState,
  spawn: EnemySpawnDef,
  rng: RNG,
  opts?: { insertBeforeEnemyId?: string | null; frontRow?: boolean; summonerId?: string | null }
): BattleState {
  const maxEnemies = 5;
  const existing = state.enemies ?? [];
  if (existing.length >= maxEnemies) return state;

  const meta: any = { ...(state as any).meta };
  const nonce = Number(meta.spawnNonce ?? 0) + 1;
  meta.spawnNonce = nonce;

  let id = `${spawn.baseId}_${nonce}`;
  // Ensure uniqueness even if baseId overlaps
  const ids = new Set(existing.map((e: any) => e.id));
  while (ids.has(id)) {
    id = `${spawn.baseId}_${meta.spawnNonce + 1}`;
    meta.spawnNonce += 1;
  }

  const enemyBase: EnemyState = {
    id,
    name: spawn.name,
    hp: Math.max(1, Math.floor(spawn.hp)),
    maxHP: Math.max(1, Math.floor(spawn.hp)),
    block: Math.max(0, Math.floor(Number((spawn as any).block ?? 0))),
    intent: { kind: "ATTACK", dmg: 0, hits: 1 },
    lastIntentKind: undefined,
    ai: spawn.ai as any,
    aiSeqIndex: 0,
    aiSeqKey: undefined,
    sprite: spawn.sprite,
    statuses: (spawn.statuses ?? []).map((s) => ({ ...s })),
    ...(opts?.summonerId ? { summonerId: String(opts.summonerId) as any } : {}),
    ...(opts?.frontRow ? { frontRow: true as any } : {}),
  };

  const rolled = rollIntentFromAI(enemyBase.ai, rng, {
    lastKind: enemyBase.lastIntentKind,
    seqIndex: 0,
    seqKey: undefined,
    hp: enemyBase.hp,
    maxHP: enemyBase.maxHP,
  });

  const enemy: EnemyState = {
    ...enemyBase,
    intent: rolled.intent,
    lastIntentKind: rolled.intent.kind,
    aiSeqIndex: rolled.seqIndex,
    aiSeqKey: rolled.seqKey,
  };

  const insertBeforeId = String(opts?.insertBeforeEnemyId ?? "");
  const beforeIdx = insertBeforeId ? existing.findIndex((e: any) => String(e?.id ?? "") === insertBeforeId) : -1;
  const enemies = existing.slice();
  if (beforeIdx >= 0) enemies.splice(beforeIdx, 0, enemy);
  else enemies.push(enemy);

  return ensureValidTarget({
    ...state,
    meta,
    enemies,
  });
}

function applySummonerDeathCascade(state: BattleState, rng: RNG): BattleState {
  // If any enemy with bound minions has died, kill its minions.
  // We don't do timers inside the pure engine; instead we emit meta hooks that BattleScreen can step through.
  const meta0: any = { ...(state.meta ?? {}) };
  const alreadyHandled = new Set<string>(meta0.summonerDeathHandledIds ?? []);
  const deadSummoners = (state.enemies ?? []).filter((e: any) => (e?.hp ?? 0) <= 0 && String(e?.id ?? "").length > 0);
  let next = state;

  for (const summoner of deadSummoners) {
    const sid = String((summoner as any).id ?? "");
    if (!sid || alreadyHandled.has(sid)) continue;

    const boundMinions = (next.enemies ?? []).filter((m: any) => (m?.hp ?? 0) > 0 && String(m?.summonerId ?? "") === sid);
    if (boundMinions.length <= 0) {
      alreadyHandled.add(sid);
      continue;
    }

    // Mark in meta for UI: flash bound status then kill after delay.
    const meta: any = { ...(next.meta ?? {}) };
    meta.summonerDeathHandledIds = Array.from(new Set([...(meta.summonerDeathHandledIds ?? []), sid]));
    meta.minionDeathQueue = [
      ...((meta.minionDeathQueue ?? []) as any[]),
      { summonerId: sid, minionIds: boundMinions.map((x: any) => x.id), t: Date.now() },
    ];
    meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
    meta.statusFlashId = "dies_with_summoner";
    meta.statusFlashTarget = boundMinions[0]?.id;
    next = { ...next, meta };
    next = pushBattleLog(next, `With ${String((summoner as any).name ?? sid)} defeated, its minions collapse.`);

    alreadyHandled.add(sid);
  }

  return next;
}

function applyOneEnemyIntent(state: BattleState, enemyId: string, rng: RNG): BattleState {
  const en = state.enemies.find((e) => e.id === enemyId);
  if (!en || en.hp <= 0) return state;

  // Enemy passive procs that happen at the start of their action (before intents resolve)
  let next: BattleState = state;
  if (String(enemyId) === "defensive_desk") {
    const cur = Math.max(0, Math.floor(Number((en as any).block ?? 0)));
    if (cur > 0) next = setEnemyBlockById(next, enemyId, 0);
  }

  const en0 = next.enemies.find((e) => e.id === enemyId) as any;
  if (!en0) return next;

  const autoBlock = getStacks((en as any).statuses, "auto_block");
  const autoStrength = Math.max(0, Math.floor(Number(getStacks(en0?.statuses, "auto_strength") ?? 0)));

  if (autoBlock > 0) {
    // Reset to a fixed block amount each enemy action (prevents stacking across turns).
    next = setEnemyBlockById(next, enemyId, autoBlock);

    const meta: any = { ...(next.meta ?? {}) };
    meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
    meta.statusFlashId = "auto_block";
    meta.statusFlashTarget = enemyId;
    next = { ...next, meta };
  }

  // Custom passive: Sharpener buffs the Pencil while the Sharpener is alive.
  const auraPencilStrength = Math.max(0, Math.floor(Number(getStacks((en as any).statuses, "aura_strength_to_pencil") ?? 0)));
  if (auraPencilStrength > 0) {
    const pencil = (next.enemies ?? []).find((x: any) => String(x?.id ?? "") === "possessed_pencil" && (x?.hp ?? 0) > 0);
    if (pencil) {
      next = addEnemyStatus(next, pencil.id, "strength", auraPencilStrength);

      const meta: any = { ...(next.meta ?? {}) };
      meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
      meta.statusFlashId = "aura_strength_to_pencil";
      meta.statusFlashTarget = pencil.id;
      next = { ...next, meta };
    }
  }

  if (autoStrength > 0) {
    next = addEnemyStatus(next, enemyId, "strength", autoStrength);

    const meta: any = { ...(next.meta ?? {}) };
    meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
    meta.statusFlashId = "auto_strength";
    meta.statusFlashTarget = enemyId;
    next = { ...next, meta };
  }

  const intentList: EnemyIntent[] = Array.isArray((en as any).intents) && (en as any).intents.length > 1
    ? ((en as any).intents as EnemyIntent[])
    : [en.intent];

  let forceAdvanceSeqBy = 0;
  for (const intent of intentList) {
    if (!intent) continue;

    if (intent.kind === "ATTACK") {
      const hits = Math.max(1, Math.floor(Number((intent as any).hits ?? 1)));
      const base = Math.max(0, Math.floor(Number((intent as any).dmg ?? 0)));
      const isMultiHit = hits > 1;

      let unblockedHits = 0;
      let totalBlocked = 0;
      let totalTaken = 0;
      const perHitTaken: number[] = [];

      for (let i = 0; i < hits; i++) {
        const raw = base;
        const hit = modifyAttackDamage(raw, en.statuses, next.playerStatuses);

        let block = Math.max(0, Math.floor(Number((next as any).playerBlock ?? 0)));
        let dmg = Math.max(0, Math.floor(hit));

        const blocked = Math.min(block, dmg);
        block -= blocked;
        dmg -= blocked;

        totalBlocked += blocked;
        totalTaken += dmg;
        perHitTaken.push(dmg);

        if (dmg > 0) unblockedHits += 1;

        const playerHP = Math.max(0, Number(next.playerHP ?? 0) - dmg);

        // Track individual hit for multi-attack popups
        if (isMultiHit && dmg > 0) {
          const meta: any = { ...(next.meta ?? {}) };
          meta.damageEvents = [...(meta.damageEvents ?? []), { target: "player", amount: dmg, timestamp: Date.now() }];
          next = { ...next, meta };
        }

        next = { ...next, playerHP, playerBlock: block };

        // Reflect blocked damage back to the attacker (Bathroom Mirror)
        const supplyIds = (next as any)?.meta?.supplyIds ?? ((next as any)?.meta?.supplyId ? [(next as any).meta.supplyId] : []);
        if (supplyIds.includes("sup_reflect_block") && blocked > 0) {
          const reflect = Math.floor(blocked * 0.5);
          if (reflect > 0) {
            const target = next.enemies.find((e) => e.id === enemyId) ?? next.enemies[0];
            const curHP = target?.hp ?? 0;
            next = setEnemyHPById(next, enemyId, Math.max(0, curHP - reflect));
            next = {
              ...next,
              meta: {
                ...(next.meta ?? {}),
                supplyId: supplyIds[0] ?? null, // Legacy compatibility
                supplyIds,
                procSupplyIds: Array.from(new Set([...(next.meta?.procSupplyIds ?? []), "sup_reflect_block"])),
              },
            };
          }
        }

        if (next.playerHP <= 0) break;
      }

      if (totalBlocked > 0 || totalTaken > 0) {
        const nm = String((en as any).name ?? enemyId);

        const hitsTaken = perHitTaken.filter((x) => x > 0);
        const allSame = hitsTaken.length > 0 && hitsTaken.every((x) => x === hitsTaken[0]);

        // Preferred phrasing for clean multi-hit damage (no block involved)
        if (hits > 1 && totalBlocked === 0 && totalTaken > 0 && allSame) {
          const per = hitsTaken[0];
          next = pushBattleLog(next, `${nm} did ${per} damage ${hits}x for a total of ${totalTaken} damage.`);
        } else {
          const parts: string[] = [];
          if (totalTaken > 0) parts.push(`${totalTaken} dmg`);
          if (totalBlocked > 0) parts.push(`${totalBlocked} blocked`);
          next = pushBattleLog(next, `${nm} attacked (${parts.join(", ")}).`);
        }
      }

      // Custom passive: if this enemy deals unblocked damage, add temp curse(s) to HAND (one per unblocked hit).
      if (unblockedHits > 0 && getStacks((en as any).statuses, "on_unblocked_add_temp_curse") > 0) {
        const cardId = "neg_temp_curse";
        const addCount = Math.max(0, Math.floor(unblockedHits));
        if (addCount > 0) {
          next = { ...next, hand: [...(next.hand ?? []), ...Array.from({ length: addCount }).map(() => cardId)] };

          const meta: any = { ...(next.meta ?? {}) };
          const baseTs = Date.now();
          meta.negativeCardEvents = [
            ...(meta.negativeCardEvents ?? []),
            ...Array.from({ length: addCount }).map((_, i) => ({ cardId, timestamp: baseTs + i })),
          ];

          // Keep legacy single flash hook too (BattleScreen already listens for this)
          meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
          meta.statusFlashId = "add_negative_card";
          meta.statusFlashTarget = "player";
          next = { ...next, meta };

          next = pushBattleLog(next, `Curse added to hand (${addCount}).`);
        }
      }

      // Record which enemy attacked for UI pulse (even in single-enemy fights)
      const meta: any = { ...(next as any).meta };
      meta.lastEnemyAttackId = enemyId;
      meta.lastEnemyAttackNonce = Number(meta.lastEnemyAttackNonce ?? 0) + 1;
      next = { ...next, meta };
    } else if (intent.kind === "BLOCK") {
      const amt = Math.max(0, Math.floor(Number((intent as any).block ?? 0)));
      const curEn: any = (next.enemies ?? []).find((e: any) => String(e?.id ?? "") === String(enemyId));
      const cur = Math.max(0, Math.floor(Number(curEn?.block ?? 0)));
      const newBlock = String(enemyId) === "defensive_desk" ? amt : cur + amt;
      next = setEnemyBlockById(next, enemyId, newBlock);
      if (amt > 0) next = pushBattleLog(next, `${String((en as any).name ?? enemyId)} gained ${amt} Block.`);
    } else if (intent.kind === "ERASE_BUFFS") {
      const before = (next.playerStatuses ?? []).slice();
      const after = before.filter((s: any) => !isPlayerBuffStatusId(String(s?.id ?? "")));
      next = { ...next, playerStatuses: after };
    } else if (intent.kind === "DEBUFF") {
      const statusId = String((intent as any).statusId ?? "weak");
      const stacks = Math.max(1, Math.floor(Number((intent as any).stacks ?? 1)));
      next = addPlayerStatus(next, statusId, stacks);

      const meta: any = { ...(next.meta ?? {}) };
      meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
      meta.statusFlashId = statusId;
      meta.statusFlashTarget = "player";

      next = { ...next, meta };
    } else if (intent.kind === "BUFF") {
      const statusId = String((intent as any).statusId ?? "strength");
      const stacks = Math.max(1, Math.floor(Number((intent as any).stacks ?? 1)));
      next = addEnemyStatus(next, enemyId, statusId, stacks);

      const meta: any = { ...(next.meta ?? {}) };
      meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
      meta.statusFlashId = statusId;
      meta.statusFlashTarget = enemyId;
      next = { ...next, meta };
    } else if (intent.kind === "HEAL") {
      const heal = Math.max(0, Math.floor(Number((intent as any).heal ?? 0)));
      const target = next.enemies.find((e) => e.id === enemyId) ?? next.enemies[0];
      const curHP = Math.max(0, Math.floor(Number(target?.hp ?? 0)));
      const maxHP = Math.max(1, Math.floor(Number(target?.maxHP ?? curHP)));
      const after = Math.min(maxHP, curHP + heal);
      next = setEnemyHPById(next, enemyId, after);
      const healed = Math.max(0, after - curHP);
      if (healed > 0) {
        const meta: any = { ...(next.meta ?? {}) };
        meta.healEvents = [...(meta.healEvents ?? []), { target: enemyId, amount: healed, timestamp: Date.now() }];
        next = { ...next, meta };
        next = pushBattleLog(next, `${String((en as any).name ?? enemyId)} healed for ${healed} HP.`);
      }
    } else if (intent.kind === "CONSUME_MINIONS_HEAL") {
      const minions = (next.enemies ?? []).filter((m: any) => (m?.hp ?? 0) > 0 && String((m as any).summonerId ?? "") === String(enemyId));
      const total = minions.reduce((sum: number, m: any) => sum + Math.max(0, Math.floor(Number(m?.hp ?? 0))), 0);
      if (minions.length > 0) {
        const enemies2 = (next.enemies ?? []).map((e: any) => {
          if (String((e as any).summonerId ?? "") === String(enemyId) && (e?.hp ?? 0) > 0) return { ...e, hp: 0 };
          return e;
        });
        next = { ...next, enemies: enemies2 };
      }
      if (total > 0) {
        const target = next.enemies.find((e) => e.id === enemyId) ?? next.enemies[0];
        const beforeHP = Math.max(0, Math.floor(Number(target?.hp ?? 0)));
        const afterHP = beforeHP + total;
        next = setEnemyHPById(next, enemyId, afterHP);
        const healed = Math.max(0, afterHP - beforeHP);
        if (healed > 0) {
          const meta: any = { ...(next.meta ?? {}) };
          meta.healEvents = [...(meta.healEvents ?? []), { target: enemyId, amount: healed, timestamp: Date.now() }];
          next = { ...next, meta };
        }
        next = pushBattleLog(next, `${String((en as any).name ?? enemyId)} consumed its minions and healed for ${total} HP.`);
      }
    } else if (intent.kind === "SUMMON") {
      let count = Math.max(1, Math.floor(Number((intent as any).count ?? 1)));

      // Custom passive: Binder ramps summons (1, then 2, then 3...) each time it summons.
      const scaling = Math.max(0, Math.floor(Number(getStacks((en as any).statuses, "binder_summon_scaling") ?? 0)));
      if (scaling > 0) count = Math.max(1, scaling);

      for (let i = 0; i < count; i++) {
        const beforeIds = new Set((next.enemies ?? []).map((e: any) => String(e?.id ?? "")));
        next = spawnEnemyFromDef(next, (intent as any).spawn as any, rng, { insertBeforeEnemyId: enemyId, frontRow: true, summonerId: enemyId });
        const spawnedIds = (next.enemies ?? [])
          .map((e: any) => String(e?.id ?? ""))
          .filter((id) => id && !beforeIds.has(id));

        if (spawnedIds.length > 0) {
          const spawnedId = spawnedIds[0];
          const enemies2 = (next.enemies ?? []).map((e: any) => {
            if (String(e.id) !== spawnedId) return e;
            const statuses = Array.isArray(e.statuses) ? e.statuses.slice() : [];
            statuses.push({ id: "dies_with_summoner", stacks: 1 });
            return { ...e, summonerId: enemyId, statuses };
          });
          next = { ...next, enemies: enemies2 };
        }
      }

      if (scaling > 0) {
        // Increment by +1 each summon; do NOT add (scaling+1) as a delta.
        next = addEnemyStatus(next, enemyId, "binder_summon_scaling", 1);
      }
    } else if (intent.kind === "ADD_NEGATIVE_CARD") {
      const cardId = String((intent as any).cardId ?? "neg_curse");

      // Event-only supply: the player cannot gain negative cards.
      if (battleHasSupply(next, "sup_no_negative_cards")) {
        const meta: any = { ...(next.meta ?? {}) };
        meta.procSupplyIds = Array.from(new Set([...(meta.procSupplyIds ?? []), "sup_no_negative_cards"]));
        meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
        meta.statusFlashId = "blocked_negative_card";
        meta.statusFlashTarget = "player";
        meta.blockedNegativeCardNonce = Number(meta.blockedNegativeCardNonce ?? 0) + 1;
        meta.blockedNegativeCardByEnemyId = enemyId;
        next = { ...next, meta };
        next = pushBattleLog(next, `Perfect Record blocked a negative card (${cardId}).`);
        // Do not add the card to discard/deckAdditions.
        continue;
      }

      // Immediate impact: shuffle the negative card into the combat discard pile.
      next = { ...next, discardPile: [...(next.discardPile ?? []), cardId] };

      // Permanent impact: mark it for adding to the run deck at battle end.
      // Exception: some negative cards are temporary (removed after battle).
      const meta: any = { ...(next.meta ?? {}) };

      const isTemporary = cardId === "neg_infestation" || cardId === "neg_radiation" || cardId === "neg_temp_curse";
      if (!isTemporary) {
        meta.deckAdditions = [...(meta.deckAdditions ?? []), cardId];
      }
      meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
      meta.statusFlashId = "add_negative_card";
      meta.statusFlashTarget = "player";
      meta.negativeCardEvents = [...(meta.negativeCardEvents ?? []), { cardId, timestamp: Date.now() }];
      next = { ...next, meta };

      next = pushBattleLog(next, isTemporary ? `A temporary curse was added (${cardId}).` : `A curse was added to your deck (${cardId}).`);
    } else if (intent.kind === "EXHAUST_RANDOM_CARD") {
      const meta: any = { ...(next.meta ?? {}) };
      meta.pendingHandExhaustCount = Math.max(0, Math.floor(Number(meta.pendingHandExhaustCount ?? 0))) + 1;
      meta.pendingHandExhaustByEnemyId = String(enemyId);
      meta.pendingHandExhaustNonce = Number(meta.pendingHandExhaustNonce ?? 0) + 1;
      meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
      meta.statusFlashId = "pending_hand_exhaust";
      meta.statusFlashTarget = "player";
      meta.negativeCardEvents = [...(meta.negativeCardEvents ?? []), { cardId: "neg_exhaust", timestamp: Date.now() }];
      next = { ...next, meta };
      next = addPlayerStatus(next, "pending_hand_exhaust", 1);
      next = pushBattleLog(next, `${String((en as any).name ?? enemyId)} will exhaust a random card from your hand next turn.`);
    } else if (intent.kind === "FORCE_QUESTION") {
      const dmgOnWrong = Math.max(0, Math.floor(Number((intent as any).dmgOnWrong ?? 0)));
      const meta: any = { ...(next.meta ?? {}) };
      meta.pendingForcedQuestionDamage = dmgOnWrong;
      meta.pendingForcedQuestionByEnemyId = String(enemyId);
      next = { ...next, meta };
    } else if (intent.kind === "CLEANSE_SELF") {
      const debuffIds = ["poison", "weak", "vulnerable"];
      let removed: string[] = [];
      const curEn: any = (next.enemies ?? []).find((e: any) => String(e?.id ?? "") === String(enemyId));
      const st = Array.isArray(curEn?.statuses) ? (curEn.statuses as any[]) : [];
      removed = debuffIds.filter((id) => st.some((s: any) => String(s?.id ?? "") === id));
      let meta: any = { ...(next.meta ?? {}) };
      meta.cleanseFlashNonce = Number(meta.cleanseFlashNonce ?? 0) + 1;
      meta.cleanseFlashEnemyId = String(enemyId);
      meta.cleanseFlashStatusIds = removed;
      meta.statusFlashNonce = Number(meta.statusFlashNonce ?? 0) + 1;
      meta.statusFlashId = "cleanse";
      meta.statusFlashTarget = String(enemyId);

      // Delay actual removal until the next step so the UI can flash the debuff chips
      // while they're still visible.
      meta.pendingEnemyCleanseEnemyId = String(enemyId);
      meta.pendingEnemyCleanseStatusIds = removed;
      next = { ...next, meta };
    }
  }

  // Cursed Detention Slip: decrement evolving once per action; when it hits 0, transform.
  try {
    if (String(enemyId) === "cursed_detention_slip") {
      const curEn: any = (next.enemies ?? []).find((e: any) => String(e?.id ?? "") === String(enemyId));
      const stacks = Math.max(0, Math.floor(Number(getStacks(curEn?.statuses, "evolving") ?? 0)));
      if (stacks > 0) {
        const enemies2 = (next.enemies ?? []).map((e: any) => {
          if (String(e?.id ?? "") !== String(enemyId)) return e;
          return { ...e, statuses: removeOneStack(e.statuses, "evolving") };
        });
        next = { ...next, enemies: enemies2 };
      }

      const afterEn: any = (next.enemies ?? []).find((e: any) => String(e?.id ?? "") === String(enemyId));
      const stacksAfter = Math.max(0, Math.floor(Number(getStacks(afterEn?.statuses, "evolving") ?? 0)));
      if (afterEn && (afterEn.hp ?? 0) > 0 && stacks > 0 && stacksAfter <= 0) {
        const monsterId = "demonic_detention_monster";
        const enemies3 = (next.enemies ?? []).map((e: any) => {
          if (String(e?.id ?? "") !== String(enemyId)) return e;
          return {
            ...e,
            id: monsterId,
            name: "Demonic Detention Monster",
            hp: 140,
            maxHP: 140,
            block: 0,
            sprite: { kind: "image", src: enemyImg("demonicdetention.webp"), alt: "Demonic Detention" },
            ai: {
              sequence: [
                { kind: "ATTACK", dmg: 18 },
                { kind: "DEBUFF", statusId: "vulnerable", stacks: 2 },
                { kind: "ATTACK", dmg: 10, hits: 2 },
              ],
            },
            aiSeqIndex: 0,
            aiSeqKey: undefined,
            intents: undefined,
            lastIntentKind: undefined,
          };
        });
        const wasSelected = String((next as any).selectedEnemyId ?? "") === String(enemyId);
        next = { ...next, enemies: enemies3, ...(wasSelected ? { selectedEnemyId: monsterId } : {}) };
        next = pushBattleLog(next, "Cursed Detention Slip evolved into a Demonic Detention Monster!");

        try {
          const mon: any = (next.enemies ?? []).find((e: any) => String(e?.id ?? "") === monsterId);
          if (mon?.ai) {
            const rolled = rollIntentFromAI(mon.ai, rng, {
              lastKind: undefined,
              seqIndex: 0,
              seqKey: undefined,
              hp: mon.hp,
              maxHP: mon.maxHP,
            });
            next = {
              ...next,
              enemies: (next.enemies ?? []).map((e: any) =>
                String(e?.id ?? "") === monsterId
                  ? { ...e, intent: rolled.intent, lastIntentKind: rolled.intent.kind, aiSeqIndex: rolled.seqIndex, aiSeqKey: rolled.seqKey }
                  : e
              ),
            };
          }
        } catch {}
      }
    }
  } catch {}

  // If we forced a phone to take 3 sequence steps in one turn, advance its sequence index accordingly.
  if (forceAdvanceSeqBy > 0) {
    const enemies = next.enemies.slice();
    const idx = enemies.findIndex((e) => e.id === enemyId);
    if (idx >= 0) {
      enemies[idx] = {
        ...(enemies[idx] as any),
        aiSeqIndex: Number((enemies[idx] as any).aiSeqIndex ?? 0) + forceAdvanceSeqBy,
      };
      next = { ...next, enemies };
    }
  }

  // Defensive Desk: each time it acts, cycle which phone it protects (A -> B -> C, skipping dead).
  if (String(enemyId) === "defensive_desk") {
    const order = ["smartphone_a", "smartphone_b", "smartphone_c"];
    const aliveSet = new Set(
      (next.enemies ?? [])
        .filter((e: any) => (e?.hp ?? 0) > 0)
        .map((e: any) => String(e?.id ?? ""))
    );
    let cycle = Math.max(0, Math.floor(Number(((next as any).meta as any)?.deskShieldCycle ?? 0)));
    let chosen: string | null = null;
    for (let i = 0; i < order.length; i++) {
      const cand = order[(cycle + i) % order.length];
      if (aliveSet.has(cand)) {
        chosen = cand;
        cycle = (cycle + i + 1) % order.length;
        break;
      }
    }
    if (chosen) {
      const meta2: any = { ...(next.meta ?? {}) };
      meta2.deskShieldTargetId = chosen;
      meta2.deskShieldCycle = cycle;
      meta2.statusFlashNonce = Number(meta2.statusFlashNonce ?? 0) + 1;
      meta2.statusFlashId = "desk_phone_shield";
      meta2.statusFlashTarget = "defensive_desk";
      next = { ...next, meta: meta2 };
      next = pushBattleLog(next, `Defensive Desk shielded ${chosen.replace("smartphone_", "Smart Phone ")} (students hide their phones under desks).`);
    }
  }

  // Roll next intent(s) for this enemy (telegraphed immediately)
  const after = next.enemies.find((e) => e.id === enemyId) ?? next.enemies[0];
  if (after && (after as any).ai) {
    const rolled = rollIntentFromAI((after as any).ai, rng, {
      lastKind: (after as any).lastIntentKind,
      seqIndex: Number((after as any).aiSeqIndex ?? 0),
      seqKey: (after as any).aiSeqKey as string | undefined,
      hp: Number((after as any).hp ?? 1),
      maxHP: Number((after as any).maxHP ?? (after as any).hp ?? 1),
    });

    const phoneIds = ["smartphone_a", "smartphone_b", "smartphone_c"];
    const isPhone = phoneIds.includes(String((after as any).id ?? ""));
    const alivePhones = (next.enemies ?? []).filter((x: any) => phoneIds.includes(String(x?.id ?? "")) && (x?.hp ?? 0) > 0);

    // Set intents (multiple if available, otherwise single)
    // Special case: if only one phone remains, telegraph its full 3-step sequence.
    const forcedTriple = (() => {
      if (!isPhone) return null;
      if (alivePhones.length !== 1) return null;
      const ai: any = (after as any).ai;
      const seq = Array.isArray(ai?.sequence) ? (ai.sequence as any[]) : [];
      if (seq.length <= 0) return null;
      const baseIdx = Math.max(0, Math.floor(Number(rolled.seqIndex ?? 0)));
      return [0, 1, 2].map((k) => intentFromMove(seq[(baseIdx + k) % seq.length]));
    })();

    if (forcedTriple && forcedTriple.length > 1) {
      const enemies = next.enemies.slice();
      const idx = enemies.findIndex((e) => e.id === enemyId);
      if (idx >= 0) {
        enemies[idx] = {
          ...enemies[idx],
          intent: forcedTriple[0],
          intents: forcedTriple,
          lastIntentKind: forcedTriple[0]?.kind ?? rolled.intent.kind,
          aiSeqIndex: rolled.seqIndex,
          aiSeqKey: rolled.seqKey,
        };
        next = { ...next, enemies };
      }
    } else if (rolled.intents && rolled.intents.length > 1) {
      const enemies = next.enemies.slice();
      const idx = enemies.findIndex((e) => e.id === enemyId);
      if (idx >= 0) {
        enemies[idx] = {
          ...enemies[idx],
          intent: rolled.intent, // Keep primary intent for backwards compatibility
          intents: rolled.intents,
          lastIntentKind: rolled.intent.kind,
          aiSeqIndex: rolled.seqIndex,
          aiSeqKey: rolled.seqKey,
        };
        next = { ...next, enemies };
      }
    } else {
      next = setEnemyIntentById(next, enemyId, rolled.intent, rolled.intent.kind, rolled.seqIndex, rolled.seqKey);
    }
  }

  // Handle summoner death -> minion collapse hooks
  next = applySummonerDeathCascade(next, rng);
  return next;
}

export function stepEnemyTurn(state: BattleState, rng: RNG): BattleState {
  state = ensureValidTarget(state);
  if (state.playerHP <= 0 || allEnemiesDefeated(state)) return state;

  // If an enemy cleanse was queued for "next step" (so the UI can flash debuffs first), apply it now.
  // This runs on the immediate next enemy-step after the CLEANSE_SELF intent resolves.
  try {
    const meta0: any = { ...(state as any).meta };
    const pendingEnemyId = String(meta0?.pendingEnemyCleanseEnemyId ?? "");
    const pendingStatusIds = Array.isArray(meta0?.pendingEnemyCleanseStatusIds)
      ? (meta0.pendingEnemyCleanseStatusIds as string[])
      : [];
    if (pendingEnemyId && pendingStatusIds.length > 0) {
      const enemies2 = (state.enemies ?? []).map((e: any) => {
        if (String(e?.id ?? "") !== pendingEnemyId) return e;
        const st = Array.isArray(e?.statuses) ? (e.statuses as any[]) : [];
        const nextSt = (st as any[]).filter((s: any) => !pendingStatusIds.includes(String(s?.id ?? "")));
        return { ...e, statuses: nextSt };
      });
      meta0.pendingEnemyCleanseEnemyId = "";
      meta0.pendingEnemyCleanseStatusIds = [];
      state = { ...state, enemies: enemies2, meta: meta0 };
    }
  } catch {}

  const meta: any = { ...(state as any).meta };
  if (meta.phase !== "ENEMY") return state;

  const deadSummoners = new Set(
    (state.enemies ?? [])
      .filter((e: any) => (e?.hp ?? 0) <= 0)
      .map((e: any) => String((e as any)?.id ?? ""))
  );

  const aliveSet = new Set(aliveEnemies(state).map((e: any) => String(e?.id ?? "")));
  const rawQueue: string[] = Array.isArray(meta.enemyQueue) && meta.enemyQueue.length > 0
    ? (meta.enemyQueue as string[])
    : aliveEnemies(state).map((e) => e.id);

  const enemyQueue = rawQueue.filter((id) => {
    if (!aliveSet.has(String(id))) return false;
    const en: any = (state.enemies ?? []).find((e: any) => String(e?.id ?? "") === String(id));
    const sid = String(en?.summonerId ?? "");
    return !sid || !deadSummoners.has(sid);
  });
  const idx = Math.max(0, Math.floor(Number(meta.enemyActIndex ?? 0)));

  // Finished: start next player turn
  if (idx >= enemyQueue.length) {
    const newTurn = (state.turn ?? 1) + 1;
    const streakBonusEnergy = Math.max(0, Math.floor(Number((state as any).meta?.streakBonusEnergy ?? 0)));
    const supplyIds = getBattleSupplyIds(state);
    const carryEnergy = supplyIds.includes("sup_energy_carryover") ? Math.max(0, Math.floor(Number(state.energy ?? 0))) : 0;
    const keepBlock = supplyIds.includes("sup_block_persist") ? Math.max(0, Math.floor(Number(state.playerBlock ?? 0))) : 0;
    let next: BattleState = {
      ...state,
      turn: newTurn,
      bossMode: bossModeForTurn(state.isBoss, newTurn),
      energy: state.maxEnergy + streakBonusEnergy + carryEnergy,
      playerBlock: keepBlock,
      meta: {
        ...(state as any).meta,
        streakBonusEnergy: 0,
        phase: "PLAYER",
        enemyQueue: [],
        enemyActIndex: 0,
        enemyActingId: null,
        pendingEnemyAttackId: null,
      },
    };

    // Tick down enemy weak/vulnerable AFTER the enemies have taken their turn.
    // This prevents 1 stack (applied by the player) from expiring before enemies even act.
    try {
      const enemies2 = (next.enemies ?? []).map((e: any) => {
        const st = Array.isArray(e?.statuses) ? (e.statuses as any[]) : [];
        let nextSt: any = st;
        nextSt = removeOneStack(nextSt, "weak");
        nextSt = removeOneStack(nextSt, "vulnerable");
        return { ...e, statuses: nextSt };
      });
      next = { ...next, enemies: enemies2 };
    } catch {}

    // Tick down player weak/vulnerable AFTER the enemies have taken their turn.
    // Rule: only tick down debuffs that were present at the *start* of this enemy phase.
    // This prevents "reapplying" on the expiry enemy turn from stopping the original stack from expiring.
    try {
      const meta2: any = { ...(next.meta ?? {}) };
      const hadWeak = Boolean(meta2.playerHadWeakAtEnemyPhaseStart);
      const hadVuln = Boolean(meta2.playerHadVulnerableAtEnemyPhaseStart);
      meta2.playerHadWeakAtEnemyPhaseStart = false;
      meta2.playerHadVulnerableAtEnemyPhaseStart = false;
      next = { ...next, meta: meta2 };

      if (hadWeak || hadVuln) {
        const st = Array.isArray((next as any).playerStatuses) ? ((next as any).playerStatuses as any[]) : [];
        let nextSt: any = st;
        if (hadWeak) nextSt = removeOneStack(nextSt, "weak");
        if (hadVuln) nextSt = removeOneStack(nextSt, "vulnerable");
        next = { ...next, playerStatuses: nextSt };
      }
    } catch {}

    // Defensive Desk: rotate which phone is defended once per full turn cycle.
    // If no phones are alive, clear the shield target so UI doesn't keep flashing.
    try {
      const deskAlive = (next.enemies ?? []).some((e: any) => String(e?.id ?? "") === "defensive_desk" && (e?.hp ?? 0) > 0);
      if (deskAlive) {
        const order = ["smartphone_a", "smartphone_b", "smartphone_c"];
        const alivePhones = new Set(
          (next.enemies ?? [])
            .filter((e: any) => (e?.hp ?? 0) > 0)
            .map((e: any) => String(e?.id ?? ""))
        );

        const anyPhoneAlive = order.some((id) => alivePhones.has(id));
        if (!anyPhoneAlive) {
          next = { ...next, meta: { ...(next as any).meta, deskShieldTargetId: null } };
        } else {
          let cycle = Math.max(0, Math.floor(Number(((next as any).meta as any)?.deskShieldCycle ?? 0)));
          let chosen: string | null = null;
          for (let i = 0; i < order.length; i++) {
            const cand = order[(cycle + i) % order.length];
            if (alivePhones.has(cand)) {
              chosen = cand;
              cycle = (cycle + i + 1) % order.length;
              break;
            }
          }
          if (chosen) {
            next = { ...next, meta: { ...(next as any).meta, deskShieldTargetId: chosen, deskShieldCycle: cycle } };
          }
        }
      }
    } catch {}

    // Supply start-of-turn passives (e.g., poison-all, gain block)
    const supplyIds2 = (next as any)?.meta?.supplyIds ?? ((next as any)?.meta?.supplyId ? [(next as any).meta.supplyId] : []);
    next = applySuppliesStartOfTurn(next, supplyIds2);

    // Draw up to the normal hand size first, then apply boss/encounter inserts that should be *additional* cards.
    let afterDraw = drawToHandSize(next, rng, 5);

    // Mrs. Pain: at the start of the player's turn, add Pop Quiz as an extra card (6th card).
    try {
      const painAlive = (afterDraw.enemies ?? []).some((e: any) => String(e?.id ?? "") === "mrs_pain" && (e?.hp ?? 0) > 0);
      if (painAlive) {
        const cardId = "neg_pop_quiz";
        afterDraw = { ...afterDraw, hand: [...(afterDraw.hand ?? []), cardId] };

        // Flash the *boss status* chip to communicate the mechanic, and also record a negative-card event
        // so the player gets the normal curse SFX/flash.
        const meta2: any = { ...(afterDraw.meta ?? {}) };
        meta2.statusFlashNonce = Number(meta2.statusFlashNonce ?? 0) + 1;
        meta2.statusFlashId = "mrs_pain_pop_quiz";
        meta2.statusFlashTarget = "mrs_pain";
        meta2.negativeCardEvents = [...(meta2.negativeCardEvents ?? []), { cardId, timestamp: Date.now() }];
        afterDraw = { ...afterDraw, meta: meta2 };

        afterDraw = pushBattleLog(afterDraw, "Pop Quiz! (Must be played first.)");
      }
    } catch {}

    // Mrs. Pain: if an exhaust was scheduled during the enemy phase, trigger it now (your next turn).
    try {
      const meta0: any = { ...(afterDraw.meta ?? {}) };
      const pending = Math.max(0, Math.floor(Number(meta0.pendingHandExhaustCount ?? 0)));
      if (pending > 0) {
        let hand = (afterDraw.hand ?? []).slice();
        const exhaustPile = (afterDraw.exhaustPile ?? []).slice();

        const exhaustedIds: string[] = [];

        for (let i = 0; i < pending; i++) {
          if (hand.length <= 0) break;
          const idx = Math.max(0, Math.min(hand.length - 1, Math.floor(rng() * hand.length)));
          const exhausted = String(hand[idx] ?? "");
          hand.splice(idx, 1);
          exhaustPile.push(exhausted);
          exhaustedIds.push(exhausted);

          meta0.handDiscardFlashNonce = Number(meta0.handDiscardFlashNonce ?? 0) + 1;
          meta0.handDiscardFlashCardId = exhausted;
          meta0.statusFlashNonce = Number(meta0.statusFlashNonce ?? 0) + 1;
          meta0.statusFlashId = "pending_hand_exhaust";
          meta0.statusFlashTarget = "player";
        }

        meta0.pendingHandExhaustTriggerNonce = Number(meta0.pendingHandExhaustTriggerNonce ?? 0) + 1;
        meta0.pendingHandExhaustTriggeredCardIds = exhaustedIds;

        meta0.pendingHandExhaustCount = 0;
        meta0.pendingHandExhaustByEnemyId = "";

        afterDraw = {
          ...afterDraw,
          hand,
          exhaustPile,
          playerStatuses: removeStatus(afterDraw.playerStatuses ?? [], "pending_hand_exhaust"),
          meta: meta0,
        };

        if (exhaustedIds.length > 0) {
          const names = exhaustedIds.map((id) => String(getCardDef(id)?.name ?? id));
          afterDraw = pushBattleLog(afterDraw, `Exhausted from your hand: ${names.join(", ")}.`);
        } else {
          afterDraw = pushBattleLog(afterDraw, "A random card was exhausted from your hand.");
        }
      }
    } catch {}

    // Mrs. Pain: if an Exam was scheduled during the enemy phase, force it now (your next turn).
    try {
      const meta0: any = { ...(afterDraw.meta ?? {}) };
      const pendingDmg = Math.max(0, Math.floor(Number(meta0.pendingForcedQuestionDamage ?? 0)));
      const pendingBy = String(meta0.pendingForcedQuestionByEnemyId ?? "");
      if (pendingDmg > 0) {
        const q = getQuestion({ rng, difficulty: afterDraw.difficulty });
        meta0.forcedQuestionDamage = pendingDmg;
        meta0.forcedQuestionByEnemyId = pendingBy;
        meta0.pendingForcedQuestionDamage = 0;
        meta0.pendingForcedQuestionByEnemyId = "";
        afterDraw = {
          ...afterDraw,
          meta: meta0,
          awaiting: {
            cardId: "forced_question",
            question: { prompt: q.prompt, answer: q.answer, hint: q.hint },
          },
        };
      }
    } catch {}

    return afterDraw;
  }

  const enemyId = enemyQueue[idx];
  // Set pending attack flag before applying damage (for UI pulse)
  const metaWithPending: any = { ...meta, pendingEnemyAttackId: enemyId };
  let next: BattleState = { ...state, meta: metaWithPending };
  next = applyOneEnemyIntent(next, enemyId, rng);

  // Advance enemy index
  const nextIdx = idx + 1;
  const nextActingId = enemyQueue[nextIdx] ?? null;
  next = {
    ...next,
    meta: {
      ...(next as any).meta,
      phase: "ENEMY",
      enemyQueue,
      enemyActIndex: nextIdx,
      enemyActingId: nextActingId,
      pendingEnemyAttackId: null, // Clear pending flag after attack
    },
  };

  return next;
}

export function endTurn(state: BattleState, rng: RNG): BattleState {
  // Backwards-compatible "instant" end turn (no delays):
  // run endPlayerTurn then step through enemy attacks synchronously.
  let next = endPlayerTurn(state, rng);
  let guard = 0;
  while ((next as any).meta?.phase === "ENEMY" && guard < 20) {
    guard++;
    const beforeHP = next.playerHP;
    next = stepEnemyTurn(next, rng);
    if (next.playerHP <= 0) break;
    // Safety: break if no progress
    if (next.playerHP === beforeHP && ((next as any).meta?.enemyActIndex ?? 0) >= (((next as any).meta?.enemyQueue ?? []) as any[]).length) {
      break;
    }
    if ((next as any).meta?.phase !== "ENEMY") break;
  }
  return next;
}

export function chooseDiscard(state: BattleState, rng: RNG, cardId: string): BattleState {
  const awaiting = (state as any).awaitingDiscard as any;
  if (!awaiting || awaiting.count <= 0) return state;

  const idx = state.hand.indexOf(cardId);
  if (idx < 0) return state;

  const hand = state.hand.slice();
  const [removed] = hand.splice(idx, 1);
  const discardPile = state.discardPile.slice();
  const exhaustPile = (state.exhaustPile ?? []).slice();
  // Discard choice is not a play; do not exhaust here.
  discardPile.push(removed);
  let next: BattleState = { ...state, hand, discardPile, exhaustPile };

  const remaining = (awaiting.count ?? 1) - 1;
  if (remaining > 0) {
    next = { ...next, awaitingDiscard: { ...awaiting, count: remaining } };
    return next;
  }

  // Finished discarding.
  next = { ...next, awaitingDiscard: null };

  if (awaiting.then?.kind === "draw") {
    next = drawCards(next, rng, awaiting.then.amount ?? 0);
  }

  return next;
}


