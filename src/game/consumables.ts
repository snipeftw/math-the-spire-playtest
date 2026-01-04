// src/game/consumables.ts
import type { RNG } from "./rng";
import type { BattleState, EnemyState, Status } from "./battle";
import { resolveCardAnswer, drawCards } from "./battle";
import { addEnemyStatus, addPlayerStatus, getStacks, removeStatus } from "./effects";
import { upgradeCardId } from "../content/cards";
import { CONSUMABLES_10 } from "../content/consumables";

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

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function legacyIntentDamage(en: any): number {
  const intent = en?.intent;
  if (!intent || intent.kind !== "ATTACK") return 0;
  const hits = Math.max(1, Math.floor(Number((intent as any).hits ?? 1)));
  const dmg = Math.max(0, Math.floor(Number((intent as any).dmg ?? 0)));
  return dmg * hits;
}

function livingEnemies(state: BattleState): EnemyState[] {
  return (state.enemies ?? []).filter((e) => (e.hp ?? 0) > 0);
}

function isBattleOver(state: BattleState): boolean {
  if ((state.playerHP ?? 0) <= 0) return true;
  return livingEnemies(state).length === 0;
}

function getTargetEnemyId(state: BattleState): string | null {
  const alive = livingEnemies(state);
  if (alive.length === 0) return null;
  const sel = (state as any).selectedEnemyId as string | undefined;
  if (sel && alive.some((e) => e.id === sel)) return sel;
  return alive[0].id;
}

function syncLegacyEnemyFields(state: BattleState): BattleState {
  const primary = (state.enemies ?? [])[0];
  if (!primary) return state;
  return {
    ...state,
    enemyHP: primary.hp,
    enemyMaxHP: primary.maxHP,
    enemyIntentDamage: legacyIntentDamage(primary),
  };
}

function setEnemyHPById(state: BattleState, enemyId: string, newHP: number): BattleState {
  const enemies = (state.enemies ?? []).map((en) => (en.id === enemyId ? { ...en, hp: newHP } : en));
  return syncLegacyEnemyFields({ ...state, enemies });
}

function setAllEnemiesHP(state: BattleState, newHP: number): BattleState {
  const enemies = (state.enemies ?? []).map((en) => ({ ...en, hp: newHP }));
  return syncLegacyEnemyFields({ ...state, enemies });
}

function removeAllDebuffs(statuses: Status[]): Status[] {
  return statuses.filter((s) => s.id !== "poison" && s.id !== "weak" && s.id !== "vulnerable");
}

export function tryUseConsumableInBattle(opts: {
  rng: RNG;
  state: BattleState;
  consumableId: string;
}): { next: BattleState; used: boolean } {
  const { rng, state, consumableId } = opts;

  if (!consumableId) return { next: state, used: false };
  if (isBattleOver(state)) return { next: state, used: false };

  // Answer Key: if a question is open, auto-submit correct answer.
  if (consumableId === "con_answer_key") {
    if (!state.awaiting) {
      return { next: { ...state, lastResult: { correct: false, message: "Answer Key — no question to solve." } }, used: false };
    }
    const q: any = state.awaiting.question as any;
    let answer = String(q.answer);
    try {
      if (String(q.kind ?? "") === "boxplot_build") {
        const exp = q?.build?.expected;
        if (exp) {
          answer = `${Number(exp.min)},${Number(exp.q1)},${Number(exp.median)},${Number(exp.q3)},${Number(exp.max)}`;
        }
      }
    } catch {}
    const next = resolveCardAnswer({ rng, state, input: answer });
    return {
      next: { ...next, lastResult: { correct: true, message: "🔑 Answer Key — question solved!" } },
      used: true,
    };
  }

  const def = CONSUMABLES_10.find((c: any) => c.id === consumableId);
  const nm = String((def as any)?.name ?? consumableId);

  switch (consumableId) {
    case "con_apple": {
      let next = addPlayerStatus(state, "regen", 5);
      next = pushBattleLog(next, `Player used ${nm}.`);
      return { next: { ...next, lastResult: { correct: true, message: "🍎 Apple — gained 5 Regen." } }, used: true };
    }

    case "con_sandwich": {
      const before = state.playerHP;
      const after = clamp(before + 12, 0, state.playerMaxHP);
      const next0 = pushBattleLog(state, `Player used ${nm}.`);
      return {
        next: { ...next0, playerHP: after, lastResult: { correct: true, message: `🥪 Sandwich — healed ${after - before} HP.` } },
        used: true,
      };
    }

    case "con_rain_coat": {
      const block = 8;
      const next0 = pushBattleLog(state, `Player used ${nm}.`);
      return {
        next: { ...next0, playerBlock: (state.playerBlock ?? 0) + block, lastResult: { correct: true, message: `🧥 Rain Coat — gained ${block} Block.` } },
        used: true,
      };
    }

    case "con_cookie": {
      let next = drawCards(state, rng, 3);
      next = pushBattleLog(next, `Player used ${nm}.`);
      return { next: { ...next, lastResult: { correct: true, message: "🍪 Cookie — drew 3 cards." } }, used: true };
    }

    case "con_shake": {
      let next = addPlayerStatus(state, "strength", 2);
      next = pushBattleLog(next, `Player used ${nm}.`);
      return { next: { ...next, lastResult: { correct: true, message: "🥤 Protein Shake — gained 2 Strength." } }, used: true };
    }

    case "con_trailmix": {
      let next = { ...state, energy: (state.energy ?? 0) + 2 };
      const targetId = getTargetEnemyId(next);
      if (targetId) next = addEnemyStatus(next, targetId, "vulnerable", 3);
      next = pushBattleLog(next, `Player used ${nm}.`);
      return {
        next: { ...next, lastResult: { correct: true, message: "🥜 Trail Mix — +2 Energy and applied 3 Vulnerable." } },
        used: true,
      };
    }

        case "con_water": {
      const beforeMax = Math.max(1, Math.floor(state.playerMaxHP ?? 1));
      const beforeHP = Math.max(0, Math.floor(state.playerHP ?? 0));
      const afterMax = beforeMax + 7;
      const afterHP = clamp(beforeHP + 7, 0, afterMax);
      let next = { ...state, playerMaxHP: afterMax, playerHP: afterHP };
      next = pushBattleLog(next, `Player used ${nm}.`);
      return {
        next: { ...next, lastResult: { correct: true, message: "💧 Water — Max HP +7." } },
        used: true,
      };
    }


        case "con_eraser": {
      const before = state.playerStatuses ?? [];
      const had = getStacks(before, "poison") + getStacks(before, "weak") + getStacks(before, "vulnerable") > 0;
      const cleared = removeAllDebuffs(before);
      const next = had ? { ...state, playerStatuses: cleared } : state;
      const next2 = had ? pushBattleLog(next, `Player used ${nm}.`) : next;
      return {
        next: { ...next2, lastResult: { correct: true, message: had ? "🧽 Eraser — removed all debuffs." : "🧽 Eraser — no debuffs to remove." } },
        used: had,
      };
    }

case "con_chips": {
      const targetId = getTargetEnemyId(state);
      if (!targetId) return { next: state, used: false };
      const target = state.enemies.find((e) => e.id === targetId);
      const before = target?.hp ?? 0;
      const after = Math.max(0, before - 10);
      let next = setEnemyHPById(state, targetId, after);
      next = pushBattleLog(next, `Player used ${nm}.`);
      return { next: { ...next, lastResult: { correct: true, message: "🍟 Chips — dealt 10 damage." } }, used: true };
    }

    case "con_moldy_food": {
      const targetId = getTargetEnemyId(state);
      if (!targetId) return { next: state, used: false };
      let next = addEnemyStatus(state, targetId, "poison", 5);
      next = pushBattleLog(next, `Player used ${nm}.`);
      return { next: { ...next, lastResult: { correct: true, message: "🤢 Moldy Food — applied 5 Poison." } }, used: true };
    }

    case "con_absence_note": {
      const next0 = {
        ...setAllEnemiesHP(state, 0),
        meta: { ...(state.meta ?? {}), skipRewards: true },
        lastResult: { correct: true, message: "📝 Absence Note — skipped the fight (no rewards)." },
      };
      const next = pushBattleLog(next0, `Player used ${nm}.`);
      return { next, used: true };
    }

    case "con_cheat_sheet": {
      const upgradedHand = (state.hand ?? []).map((id) => upgradeCardId(id));
      const next0: BattleState = {
        ...state,
        hand: upgradedHand,
        lastResult: { correct: true, message: "📄 Cheat Sheet — upgraded your hand for this battle." },
      };
      const next = pushBattleLog(next0, `Player used ${nm}.`);
      return { next, used: true };
    }

    default:
      return { next: state, used: false };
  }
}
