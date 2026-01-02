// src/game/state.ts
import { generateMap } from "./map";
import { makeRng } from "./rng";
import { getQuestion, type Question } from "./questions";
import { pickWeighted, pickWeightedUnique, weightByRarity } from "./weighted";
import type { RunMap, NodeType } from "./map";
import type { BattleState, SpriteRef } from "./battle";
import { startBattle as startBattleCore } from "./battle";
import { encounterToEnemyStates, pickEncounterForDepth, ENCOUNTER_POOL_EASY_5, ENCOUNTER_POOL_MED_5, ENCOUNTER_POOL_HARD_5, ENCOUNTER_POOL_CHALLENGE_EASY, ENCOUNTER_POOL_CHALLENGE_MED, ENCOUNTER_POOL_CHALLENGE_HARD, BOSS_ENCOUNTER } from "../content/enemies";
import { BASE_CARDS, BASE_CARD_IDS, UPGRADED_CARDS, NEGATIVE_CARDS, upgradeCardId } from "../content/cards";
import { EVENTS } from "../content/events";

const BASE_CARD_BY_ID = new Map(BASE_CARDS.map((c) => [c.id, c] as const));
const UPGRADED_CARD_BY_ID = new Map(UPGRADED_CARDS.map((c) => [c.id, c] as const));
const NEGATIVE_CARD_BY_ID = new Map(NEGATIVE_CARDS.map((c) => [c.id, c] as const));
const NEGATIVE_CARD_IDS = new Set(NEGATIVE_CARDS.map((c) => c.id));
// (The map and id-set above are the single source of truth for negative cards.)

import { CONSUMABLES_10 } from "../content/consumables";
import { SUPPLIES_POOL_10 } from "../content/supplies";

const CONSUMABLE_BY_ID = new Map(CONSUMABLES_10.map((c) => [c.id, c] as const));
const SUPPLY_BY_ID = new Map(SUPPLIES_POOL_10.map((s) => [s.id, s] as const));

const PERFECT_RECORD_SUPPLY_ID = "sup_no_negative_cards";

function getAllSupplyIdsForState(state: any): string[] {
  const out = new Set<string>();
  for (const id of (state?.currentSupplyIds ?? []) as string[]) if (id) out.add(id);
  for (const id of (state?.setup?.supplyIds ?? []) as string[]) if (id) out.add(id);
  const legacy = state?.setup?.supplyId;
  if (legacy) out.add(String(legacy));
  return Array.from(out);
}

function stateHasSupply(state: any, supplyId: string): boolean {
  return getAllSupplyIdsForState(state).includes(supplyId);
}

function isNegativeCardId(cardId: string): boolean {
  const id = String(cardId ?? "");
  return id.startsWith("neg_") || NEGATIVE_CARD_IDS.has(id);
}

import { tryUseConsumableInBattle } from "./consumables";
import { applySupplyToGoldGain, applySupplyPostBattleHeal, applySupplyToNewBattle, applySuppliesToNewBattle, applySuppliesToGoldGain, applySuppliesPostBattleHeal, cardOfferCountForSupply, cardOfferCountForSupplies, upgradeRewardCardId, upgradeRewardCardIdForSupplies, shouldUpgradeRewardCards } from "./supplies";

export type Screen =
  | "TITLE"
  | "OVERWORLD"
  | "SETUP"
  | "NODE"
  | "BATTLE"
  | "REWARD"
  | "VICTORY"
  | "DEFEAT";

export type SetupSelection = {
  characterId: string;
  customAvatarDataUrl?: string | null;

  customName?: string | null;   // only used when customAvatarDataUrl exists
  playerName: string;           // always set
  playerSprite?: SpriteRef;     // always set when possible

  deckCardIds: string[];
  supplyId: string | null; // Legacy: kept for backwards compatibility, use supplyIds instead
  supplyIds: string[]; // Multiple supplies (new system)
  lunchItemId: string | null;
};

export type RewardState = {
  // 3 random card IDs offered after the battle
  cardOffers: string[];
  selectedCardId: string | null;
  cardConfirmed: boolean;

  // Loot that can be collected (or skipped)
  goldAmount: number;
  goldClaimed: boolean;

  consumableOfferId: string | null;
  consumableClaimed: boolean;
  
  // Supply reward (for challenge fights) - single supply added to loot
  supplyOfferId: string | null;
};



export type WrongAnswerLogEntry = {
  id: string;
  atMs: number;
  source: "BATTLE" | "EVENT" | "HALLWAY";
  location: string; // e.g., "Floor 5 • Vending Machine Glitch"
  prompt: string;
  expected: string;
  given: string;
};

export type GameState = {
  screen: Screen;
  seed: number;
  gold: number;

  map?: RunMap;
  currentNodeId?: string;

  lockedNodeIds: string[]; // nodes you cannot re-enter (ex: Absence Note)

  setupDone: boolean;
  setup?: SetupSelection | null;

  // Run inventory
  consumables: string[]; // max 3 carried

  // Wrong answers log (questions answered incorrectly during the run)
  wrongAnswerLog: WrongAnswerLogEntry[];

  // Pending rewards after a battle
  reward?: RewardState | null;
  rewardNodeId?: string | null;

  // Player stats (persist across nodes)
  maxHp: number;
  hp: number;

  // run timer
  runStartMs: number | null;
  // used to trigger a brief UI flash on the Supply badge when a supply effect procs
  supplyFlashNonce: number;
  // Which supply badge(s) to flash for the current supplyFlashNonce tick.
  supplyFlashIds: string[];

  // Supplies that have already had their one-time "on gain" effects applied.
  // (This makes it safe to acquire supplies mid-run.)
  appliedSupplyIds: string[];
  // Current supplies active in the run (can have multiple)
  currentSupplyIds: string[];
  runEndMs: number | null;

  // teacher tools
  teacherUnlocked: boolean;

  // debug flags
  debugSkipQuestions: boolean;
  // If set, the next EVENT node opened will use this event id (then auto-clears)
  debugForcedEventId: string | null;

  // Incremented each time the Hallway Shortcut event is entered. Used to reshuffle
  // lockers for repeated debug/testing within the same run.
  hallwayPlays: number;

  // Incremented for event RNG rolls so repeated debug/testing within the same run
  // doesn't always produce identical outcomes.
  eventRollNonce: number;

  // node screen
  nodeScreen?:
    | { type: Exclude<NodeType, "SHOP" | "REST" | "EVENT">; nodeId: string; depth: number }
    | {
        type: "EVENT";
        nodeId: string;
        depth: number;
        eventId: string;
        step:
          | "INTRO"
          | "UPGRADE_PICK"
          | "CARD_PICK"
          | "CONSUMABLE_PICK"
          | "CONSUMABLE_CLAIM"
          | "SUPPLY_PICK"
          | "HALLWAY"
          | "QUESTION_GATE"
          | "EXAM_LADDER_FEEDBACK"
          | "RESULT";
        resultText?: string;
        pendingUpgradeText?: string;
        pendingCardId?: string;
        pendingCardIds?: string[];
        // Some events add a "bonus" permanent/extra card alongside a primary reward card.
        // This queue is processed during CARD_PICK resolution.
        pendingExtraCardIds?: string[];
        pendingCardResultText?: string;

        pendingConsumableIds?: string[];
        // When present, tracks which pending consumables have been claimed so far
        // (used for multi-claim reward popups like the Vending Machine Glitch).
        claimedConsumableIds?: string[];

        // Some events grant a consumable but want the player to continue the event after claiming
        // (e.g., Pop-Up Vendor mystery bag).
        afterConsumablePickStep?: string;
        // Per-event flags (kept on nodeScreen to persist if the player closes/reopens the node).
        vendorMysteryUsed?: boolean;
        pendingSupplyIds?: string[];
        pendingRewardText?: string;
        pendingGoldGain?: number;

        // Generic question gate (used by some event Leave options)
        gate?: {
          question: Question;
          promptText: string;
          onCorrectText?: string;
          onWrongText?: string;
          wrongDamage?: number;
        };

        // Exam Week Ladder state
        examLadder?: {
          correct: number;
          rung: number;
          difficulty: 1 | 2 | 3;
          nextQuestion?: Question;
          nextRung?: number;
        };


        // Hallway Shortcut (press-your-luck) state
        hallwayLockers?: Array<{
          opened: boolean;
          collected: boolean;
          kind: "gold" | "heal" | "event_supply" | "lose_gold" | "damage" | "ambush";
          amount?: number;
          id?: string; // supply id, etc.
        }>;
        // The currently opened locker waiting for the player to collect / confirm
        hallwayPending?: {
          index: number;
          kind: "gold" | "heal" | "event_supply" | "lose_gold" | "damage" | "ambush";
          amount?: number;
          id?: string;
        };
        hallwayQuiz?: any;
        hallwayTally?: {
          goldGained: number;
          goldLost: number;
          healed: number;
          damageTaken: number;
          supplyIds: string[];
        };
        hallwayLastText?: string;
      }
    | {
        type: "SHOP";
        nodeId: string;
        depth: number;
        cardOffers: ShopOfferItem[];
        consumableOffers: ShopOfferItem[];
        supplyOffers: ShopOfferItem[];
        bought: { kind: "card" | "consumable" | "supply"; id: string }[];
        removalsUsed: number;
        refreshesUsed: number;
      }
    | {
        type: "REST";
        nodeId: string;
        depth: number;
        didHeal: boolean;
        didUpgrade: boolean;
      };

  // Persist node screen state per node id (so leaving a node and returning can resume).
  nodeScreenCache: Record<string, NonNullable<GameState["nodeScreen"]>>;

  // Global shop card removals used this run (affects removal service cost in all shops)
  shopRemovalsUsed: number;

  // battle
  battle?: BattleState;

  // Track standard encounters already seen this run (to avoid repeats)
  usedEncounterIds: string[];

  // last outcome (optional, helpful for end screens)
  lastOutcome?: { type: "victory" | "defeat"; isBoss: boolean } | null;
};

export type Action =
  | { type: "LOAD_STATE"; state: GameState }
  | { type: "NEW_RUN"; seed?: number }
  | { type: "OPEN_SETUP" }
  | { type: "COMPLETE_SETUP"; setup: SetupSelection }
  | { type: "OPEN_NODE"; nodeId: string }
  | { type: "SET_CURRENT_NODE"; nodeId: string }
  | {
      type: "START_BATTLE";
      nodeId: string;
      isBoss: boolean;
      isChallenge?: boolean;
      difficulty: 1 | 2 | 3;
      deckCardIds: string[];
    }
  | { type: "BATTLE_UPDATE"; battle: BattleState }
  | {
      type: "BATTLE_ENDED";
      victory: boolean;
      goldGained: number;
      isBoss: boolean;
      playerHpAfter: number;
          skipRewards?: boolean;
    }
  | { type: "CLOSE_NODE" }
  | { type: "CLAIM_REWARD" }
  | { type: "OPEN_REWARD" }
  | { type: "TEACHER_UNLOCK" }
  | { type: "TEACHER_LOCK" }
  | { type: "REWARD_SELECT_CARD"; cardId: string | null }
  | { type: "REWARD_CONFIRM_CARD" }
  | { type: "REWARD_SKIP_CARDS" }
  | { type: "REWARD_CLAIM_SUPPLY" }
  | { type: "REWARD_CLAIM_GOLD" }
  | { type: "REWARD_CLAIM_CONSUMABLE" }
  | { type: "REWARD_SKIP_EXTRAS" }
  | { type: "REWARD_SKIP_ALL" }
  | { type: "DEBUG_ADD_ALL_CONSUMABLES" }
  | { type: "DEBUG_CLEAR_CONSUMABLES" }
  | { type: "DEBUG_SET_SUPPLY"; supplyId: string | null }
  | { type: "DEBUG_ADD_CARD_TO_DECK"; cardId: string }
  | { type: "DEBUG_ADD_CARD_TO_HAND"; cardId: string }
  | { type: "DEBUG_GIVE_GOLD"; amount: number }
  | { type: "DEBUG_HEAL_FULL" }
  | { type: "DEBUG_FORCE_BATTLE"; encounterId: string; difficulty?: 1 | 2 | 3; isChallenge?: boolean }
  | { type: "DEBUG_SET_FORCED_EVENT"; eventId: string | null }
  | { type: "DEBUG_FORCE_EVENT"; eventId: string }
  | { type: "DEBUG_TOGGLE_SKIP_QUESTIONS" }

  | { type: "SHOP_BUY"; kind: "card" | "consumable" | "supply"; id: string }
  | { type: "SHOP_REFRESH" }
  | { type: "SHOP_REMOVE_CARD"; cardId: string }
  | { type: "REST_HEAL" }
  | { type: "REST_UPGRADE"; cardId: string }
  | { type: "EVENT_CHOOSE"; choiceId: string }
  | { type: "EVENT_PICK_UPGRADE"; cardId: string }
  | { type: "EVENT_PICK_CARD"; cardId: string }
  | { type: "EVENT_PICK_CONSUMABLE"; consumableId: string }
  | { type: "EVENT_PICK_SUPPLY"; supplyId: string }
  | { type: "EVENT_HALLWAY_ANSWER"; answer: number }
  | { type: "EVENT_GATE_ANSWER"; answer: number }

  | { type: "USE_CONSUMABLE"; consumableId: string }
  | { type: "DISCARD_CONSUMABLE"; consumableId: string }
  | { type: "TRASH_BIN_REMOVE_CARD"; cardId: string };

type ShopItemKind = "card" | "consumable" | "supply";

type ShopOfferItem = {
  kind: ShopItemKind;
  id: string;
  price: number;
};

type ShopPrices = {
  card: number;
  consumable: number;
  supply: number;
};

function pickEventIdForNode(seed: number, nodeId: string): string {
  const ids = EVENTS.map((e) => e.id);
  if (ids.length === 0) return "vault";
  const rng = makeRng((seed ^ hashStringToInt(nodeId)) >>> 0);
  const idx = Math.max(0, Math.min(ids.length - 1, Math.floor(rng() * ids.length)));
  return ids[idx] ?? ids[0] ?? "vault";
}

function buildEventNodeState(seed: number, nodeId: string, depth: number): NonNullable<GameState["nodeScreen"]> {
  return {
    type: "EVENT",
    nodeId,
    depth,
    eventId: pickEventIdForNode(seed, nodeId),
    step: "INTRO",
  };
}

function shopPricesForSupplies(supplyIds: string[] | null | undefined): ShopPrices {
  const discount = (supplyIds ?? []).includes("sup_shop_discount");
  const mult = discount ? 0.5 : 1;
  return {
    card: Math.max(1, Math.floor(30 * mult)),
    consumable: Math.max(1, Math.floor(20 * mult)),
    supply: Math.max(1, Math.floor(75 * mult)),
  };
}

function applyShopDiscount(price: number, supplyIds: string[] | null | undefined): number {
  const discount = (supplyIds ?? []).includes("sup_shop_discount");
  const mult = discount ? 0.5 : 1;
  return Math.max(1, Math.floor(price * mult));
}

function priceForCardId(cardId: string, supplyIds: string[] | null | undefined, rng: () => number): number {
  const rarity = String((BASE_CARD_BY_ID.get(cardId) as any)?.rarity ?? "common").toLowerCase();
  const min = rarity.includes("ultra") ? 110 : rarity === "rare" ? 90 : rarity === "uncommon" ? 60 : 20;
  const max = rarity.includes("ultra") ? 150 : rarity === "rare" ? 110 : rarity === "uncommon" ? 90 : 50;
  const rolled = min + Math.floor(rng() * (max - min + 1));
  return rolled;
}

function priceForSupplyId(supplyId: string, supplyIds: string[] | null | undefined, rng: () => number): number {
  const rarity = String((SUPPLY_BY_ID.get(supplyId) as any)?.rarity ?? "common").toLowerCase();
  const min = rarity.includes("ultra") ? 160 : rarity === "rare" ? 120 : rarity === "uncommon" ? 90 : 70;
  const max = rarity.includes("ultra") ? 200 : rarity === "rare" ? 150 : rarity === "uncommon" ? 120 : 100;
  const rolled = min + Math.floor(rng() * (max - min + 1));
  return rolled;
}

function priceForConsumableId(consumableId: string, supplyIds: string[] | null | undefined, rng: () => number): number {
  const min = 40;
  const max = 80;
  const rolled = min + Math.floor(rng() * (max - min + 1));
  return rolled;
}

function nextRemovalCost(removalsUsed: number, supplyIds: string[] | null | undefined): number {
  const base = 50;
  const step = 25;
  return applyShopDiscount(base + step * Math.max(0, removalsUsed), supplyIds);
}

function buildShopNodeState(args: {
  runSeed: number;
  nodeId: string;
  depth: number;
  supplyIds: string[];
  shopRemovalsUsed?: number;
  refreshesUsed?: number;
}): Extract<NonNullable<GameState["nodeScreen"]>, { type: "SHOP" }> {
  const refreshesUsed = Math.max(0, Math.floor(Number(args.refreshesUsed ?? 0)));
  const base = (args.runSeed ^ hashStringToInt(`shop:${args.nodeId}:refresh:${refreshesUsed}`)) >>> 0;
  const rng = makeRng((base ^ 0x5f3759df) >>> 0);

  const ownedSupplyIds = new Set(args.supplyIds ?? []);
  const supplyPool = SUPPLIES_POOL_10.filter((s: any) => !ownedSupplyIds.has(s.id) && !(s as any)?.eventOnly);

  const cardPool = BASE_CARD_IDS.filter((id) => !(BASE_CARD_BY_ID.get(id) as any)?.eventOnly);
  const consumablePool = CONSUMABLES_10.filter((c: any) => !(c as any)?.eventOnly);

  const cardOffersRaw = pickWeightedUnique(
    rng,
    cardPool,
    4,
    (id) => weightByRarity((BASE_CARD_BY_ID.get(id) as any)?.rarity)
  );
  const consumableOffersRaw = pickWeightedUnique(
    rng,
    consumablePool.map((c) => c.id),
    2,
    (id) => weightByRarity((CONSUMABLE_BY_ID.get(id) as any)?.rarity)
  );
  const supplyOffersRaw = pickWeightedUnique(
    rng,
    supplyPool.map((s) => s.id),
    2,
    (id) => weightByRarity((SUPPLY_BY_ID.get(id) as any)?.rarity)
  );

  const cardOffers: ShopOfferItem[] = cardOffersRaw.map((id) => ({
    kind: "card",
    id,
    price: applyShopDiscount(priceForCardId(id, args.supplyIds, rng), args.supplyIds),
  }));
  const consumableOffers: ShopOfferItem[] = consumableOffersRaw.map((id) => ({
    kind: "consumable",
    id,
    price: applyShopDiscount(priceForConsumableId(id, args.supplyIds, rng), args.supplyIds),
  }));
  const supplyOffers: ShopOfferItem[] = supplyOffersRaw.map((id) => ({
    kind: "supply",
    id,
    price: applyShopDiscount(priceForSupplyId(id, args.supplyIds, rng), args.supplyIds),
  }));

  return {
    type: "SHOP",
    nodeId: args.nodeId,
    depth: args.depth,
    cardOffers,
    consumableOffers,
    supplyOffers,
    bought: [],
    removalsUsed: Math.max(0, Math.floor(Number(args.shopRemovalsUsed ?? 0))),
    refreshesUsed,
  };
}


function priceRange(rng: () => number, min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function eventShopPriceForCardId(cardId: string, rng: () => number): number {
  const rarity = String((BASE_CARD_BY_ID.get(cardId) as any)?.rarity ?? "common").toLowerCase();
  if (rarity.includes("ultra")) return priceRange(rng, 120, 180);
  if (rarity === "rare") return priceRange(rng, 60, 100);
  if (rarity === "uncommon") return priceRange(rng, 45, 75);
  return priceRange(rng, 25, 55);
}

function eventShopPriceForSupplyId(supplyId: string, rng: () => number): number {
  const rarity = String((SUPPLY_BY_ID.get(supplyId) as any)?.rarity ?? "common").toLowerCase();
  if (rarity.includes("ultra")) return priceRange(rng, 160, 220);
  if (rarity === "rare") return priceRange(rng, 120, 140);
  if (rarity === "uncommon") return priceRange(rng, 90, 120);
  return priceRange(rng, 70, 110);
}

function eventShopPriceForConsumableId(_consumableId: string, rng: () => number): number {
  return priceRange(rng, 30, 90);
}

function buildEventShopNodeState(args: {
  runSeed: number;
  nodeId: string;
  depth: number;
  supplyIds: string[];
  title?: string;
  flavorText?: string;
}): Extract<NonNullable<GameState["nodeScreen"]>, { type: "SHOP" }> {
  const base = (args.runSeed ^ hashStringToInt(`eventshop:${args.nodeId}`)) >>> 0;
  const rng = makeRng((base ^ 0xC0FFEE) >>> 0);

  const ownedSupplyIds = new Set(args.supplyIds ?? []);
  const supplyPool = SUPPLIES_POOL_10.filter((s: any) => !ownedSupplyIds.has(s.id) && (s as any)?.eventOnly);

  const cardPool = BASE_CARD_IDS.filter((id) => (BASE_CARD_BY_ID.get(id) as any)?.eventOnly);
  const consumablePool = CONSUMABLES_10.filter((c: any) => (c as any)?.eventOnly);

  const cardOffersRaw = pickWeightedUnique(
    rng,
    cardPool,
    4,
    (id) => weightByRarity((BASE_CARD_BY_ID.get(id) as any)?.rarity)
  );
  const consumableOffersRaw = pickWeightedUnique(
    rng,
    consumablePool.map((c) => c.id),
    2,
    (id) => weightByRarity((CONSUMABLE_BY_ID.get(id) as any)?.rarity)
  );
  const supplyOffersRaw = pickWeightedUnique(
    rng,
    supplyPool.map((s) => s.id),
    2,
    (id) => weightByRarity((SUPPLY_BY_ID.get(id) as any)?.rarity)
  );

  const cardOffers: ShopOfferItem[] = cardOffersRaw.map((id) => ({
    kind: "card",
    id,
    price: eventShopPriceForCardId(id, rng),
  }));
  const consumableOffers: ShopOfferItem[] = consumableOffersRaw.map((id) => ({
    kind: "consumable",
    id,
    price: eventShopPriceForConsumableId(id, rng),
  }));
  const supplyOffers: ShopOfferItem[] = supplyOffersRaw.map((id) => ({
    kind: "supply",
    id,
    price: eventShopPriceForSupplyId(id, rng),
  }));

  return {
    type: "SHOP",
    nodeId: args.nodeId,
    depth: args.depth,
    cardOffers,
    consumableOffers,
    supplyOffers,
    bought: [],
    removalsUsed: 0,
    refreshesUsed: 0,
    eventShop: true,
    title: args.title ?? "Pop-Up Vendor",
    subTitle: "Event Shop",
    flavorText: args.flavorText ?? "",
  } as any;
}

function buildRestNodeState(args: { nodeId: string; depth: number }): Extract<NonNullable<GameState["nodeScreen"]>, { type: "REST" }> {
  return { type: "REST", nodeId: args.nodeId, depth: args.depth, didHeal: false, didUpgrade: false };
}


export const initialState: GameState = {
  screen: "TITLE",
  seed: 12345,
  gold: 100,
  setupDone: false,
  setup: null,

  consumables: [],
  wrongAnswerLog: [],
  reward: null,
  rewardNodeId: null,
  lockedNodeIds: [],

  maxHp: 50,
  hp: 50,

  runStartMs: null,
  supplyFlashNonce: 0,
  supplyFlashIds: [],
  appliedSupplyIds: [],
  currentSupplyIds: [],
  runEndMs: null,

  teacherUnlocked: false,
  debugSkipQuestions: false,
  debugForcedEventId: null,
  hallwayPlays: 0,
  eventRollNonce: 0,
  nodeScreen: undefined,
  battle: undefined,
  lastOutcome: null,

  nodeScreenCache: {},
  shopRemovalsUsed: 0,
  usedEncounterIds: [],
};

// ---------- helpers ----------
function hashStringToInt(str: string): number {
  // simple 32-bit hash (deterministic)
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rewardGoldForDifficulty(difficulty: 1 | 2 | 3): number {
  // Tunable: easy/medium/hard
  if (difficulty === 1) return 10;
  if (difficulty === 2) return 14;
  return 18;
}

function updateArrayItem<T>(arr: T[], idx: number, updater: (prev: T) => T): T[] {
  if (idx < 0 || idx >= arr.length) return arr.slice();
  const out = arr.slice();
  out[idx] = updater(out[idx]);
  return out;
}



function appendWrongAnswerLog(state: GameState, entry: WrongAnswerLogEntry): GameState {
  const prev = (state.wrongAnswerLog ?? []).slice();
  prev.push(entry);
  const MAX = 200;
  if (prev.length > MAX) prev.splice(0, prev.length - MAX);
  return { ...state, wrongAnswerLog: prev };
}

function maybeEnterDefeat(next: GameState): GameState {
  const hp0 = Number((next as any).hp);
  const hp = Number.isFinite(hp0) ? Math.max(0, Math.floor(hp0)) : 0;
  if (hp > 0) return next;
  if (next.screen === "DEFEAT" || next.screen === "VICTORY") return { ...next, hp: 0 };

  const now = Date.now();
  return {
    ...next,
    hp: 0,
    screen: "DEFEAT",
    runEndMs: next.runEndMs ?? now,
    battle: undefined,
    nodeScreen: undefined,
    reward: null,
    rewardNodeId: null,
    lastOutcome: { type: "defeat", isBoss: false },
  };
}

function applySupplyOnGain(state: GameState, supplyId: string | null | undefined): GameState {
  if (!supplyId) return state;
  if ((state.appliedSupplyIds ?? []).includes(supplyId)) return state;

  let next: GameState = {
    ...state,
    appliedSupplyIds: [...(state.appliedSupplyIds ?? []), supplyId],
    supplyFlashNonce: Number((state as any).supplyFlashNonce ?? 0) + 1,
    supplyFlashIds: [supplyId],
  };

  // One-time effects that should apply the moment a supply is acquired.
  if (supplyId === "sup_increase_max_health") {
    const delta = 20;
    next = {
      ...next,
      maxHp: next.maxHp + delta,
      hp: Math.min(next.maxHp + delta, next.hp + delta),
    };
  }

  return next;
}

function pickUnique<T>(rng: () => number, pool: T[], count: number): T[] {
  const out: T[] = [];
  const used = new Set<number>();
  const max = Math.min(count, pool.length);
  while (out.length < max) {
    const idx = Math.floor(rng() * pool.length);
    if (used.has(idx)) continue;
    used.add(idx);
    out.push(pool[idx]);
  }
  return out;
}

function buildBattleRewards(args: {
  runSeed: number;
  nodeId: string;
  difficulty: 1 | 2 | 3;
  supplyId?: string | null; // Legacy
  supplyIds?: string[]; // New system
  isChallenge?: boolean;
}): RewardState {
  const base = (args.runSeed ^ hashStringToInt(args.nodeId)) >>> 0;
  const rng = makeRng((base ^ 0xa5a5a5a5) >>> 0);

  const isRareOrUltra = (rarity: any) => {
    const r = String(rarity ?? "").toLowerCase();
    return r === "rare" || r.includes("ultra");
  };

  const supplyIds = args.supplyIds ?? (args.supplyId ? [args.supplyId] : []);
  const offerCountBase = cardOfferCountForSupplies(supplyIds);
  const offerCount = Math.min(5, offerCountBase + (args.isChallenge ? 1 : 0));

  const baseCardPool = BASE_CARD_IDS.filter((id) => !(BASE_CARD_BY_ID.get(id) as any)?.eventOnly);

  const picked = pickWeightedUnique(rng, baseCardPool, offerCount, (id) => weightByRarity((BASE_CARD_BY_ID.get(id) as any)?.rarity));

  // Challenge fights should always offer at least one Rare/Ultra card.
  if (args.isChallenge) {
    const hasRarePlus = picked.some((id) => isRareOrUltra((BASE_CARD_BY_ID.get(id) as any)?.rarity));
    if (!hasRarePlus) {
      const rarePool = baseCardPool.filter(
        (id) => !picked.includes(id) && isRareOrUltra((BASE_CARD_BY_ID.get(id) as any)?.rarity)
      );

      if (rarePool.length > 0 && picked.length > 0) {
        const forced =
          pickWeighted(rng, rarePool, (id) => weightByRarity((BASE_CARD_BY_ID.get(id) as any)?.rarity)) ??
          rarePool[Math.floor(rng() * rarePool.length)];
        const replaceIdx = Math.max(0, Math.min(picked.length - 1, Math.floor(rng() * picked.length)));
        picked[replaceIdx] = forced;
      }
    }
  }

  const cardOffers = picked.map((id) => upgradeRewardCardIdForSupplies(id, supplyIds));
  const baseGold = rewardGoldForDifficulty(args.difficulty) + (args.isChallenge ? 8 : 0);
  const goldAmount = applySuppliesToGoldGain(baseGold, supplyIds);

  const consumableOfferId =
    CONSUMABLES_10.filter((c: any) => !(c as any)?.eventOnly).length > 0
      ? (
          pickWeighted(
            rng,
            CONSUMABLES_10.filter((c: any) => !(c as any)?.eventOnly),
            (c) => weightByRarity((c as any).rarity)
          )?.id ??
          CONSUMABLES_10.filter((c: any) => !(c as any)?.eventOnly)[
            Math.floor(rng() * CONSUMABLES_10.filter((c: any) => !(c as any)?.eventOnly).length)
          ].id
        )
      : null;

  // Supply reward for challenge fights - pick one random supply (excluding ones already owned)
  let supplyOfferId: string | null = null;
  if (args.isChallenge) {
    // Filter out supplies the player already owns
    const ownedSupplyIds = new Set(supplyIds ?? []);
    const availableSupplies = SUPPLIES_POOL_10.filter((s: any) => !ownedSupplyIds.has(s.id) && !(s as any)?.eventOnly);
    
    if (availableSupplies.length > 0) {
      const pickedSupply = pickWeighted(rng, availableSupplies, (s) => weightByRarity((s as any).rarity));
      supplyOfferId = pickedSupply?.id ?? availableSupplies[Math.floor(rng() * availableSupplies.length)].id;
    }
    // If all supplies are owned, supplyOfferId remains null (no supply reward)
  }

  return {
    cardOffers,
    selectedCardId: null,
    cardConfirmed: false,
    goldAmount,
    goldClaimed: false,
    consumableOfferId,
    consumableClaimed: false,
    supplyOfferId,
  };
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "LOAD_STATE": {
      const incoming: any = (action as any).state ?? null;
      if (!incoming || typeof incoming !== "object") return state;

      const next: GameState = {
        ...initialState,
        ...(incoming as any),
        // Teacher mode is disabled in the student-facing build.
        teacherUnlocked: false,
        debugSkipQuestions: false,
        debugForcedEventId: null,
      } as any;

      if (next.screen !== "TITLE" && next.runStartMs == null) {
        next.runStartMs = Date.now();
      }

      return next;
    }

    case "NEW_RUN": {
      const seed = action.seed ?? Math.floor(Math.random() * 1_000_000);
      const rng = makeRng(seed);
      const map = generateMap(seed, rng);

      return {
        screen: "OVERWORLD",
        seed,
        gold: 100,
        map,
        currentNodeId: map.startId,
        lockedNodeIds: [],

        setupDone: false,
        setup: null,

        consumables: [],
        wrongAnswerLog: [],
        reward: null,
        rewardNodeId: null,


        maxHp: 40,
        hp: 40,

        runStartMs: Date.now(),
        supplyFlashNonce: 0,
        supplyFlashIds: [],
        appliedSupplyIds: [],
        currentSupplyIds: [],
        runEndMs: null,

        // Teacher mode is disabled in the student-facing build.
        teacherUnlocked: false,
        debugSkipQuestions: false,
        debugForcedEventId: null,

        hallwayPlays: 0,
        eventRollNonce: 0,

        nodeScreen: undefined,
        battle: undefined,
        lastOutcome: null,

        nodeScreenCache: {},
        shopRemovalsUsed: 0,
        usedEncounterIds: [],
      };
    }

    case "OPEN_REWARD": {
      if (!state.reward || !state.rewardNodeId || state.rewardNodeId !== state.currentNodeId) return state;
      return { ...state, screen: "REWARD" };
    }

    case "TEACHER_UNLOCK":
    case "TEACHER_LOCK":
      // Teacher mode is disabled in the student-facing build.
      return { ...state, teacherUnlocked: false };

    case "OPEN_SETUP":
      return { ...state, screen: "SETUP" };

    case "COMPLETE_SETUP": {
      const startConsumables = action.setup?.lunchItemId ? [action.setup.lunchItemId] : [];

      // Support both legacy single supplyId and new supplyIds array
      const legacySupplyId = action.setup?.supplyId ?? null;
      const supplyIds = (action.setup as any)?.supplyIds ?? (legacySupplyId ? [legacySupplyId] : []);
      
      let next: GameState = {
        ...state,
        screen: "OVERWORLD",
        setupDone: true,
        setup: { ...action.setup, supplyIds }, // Ensure supplyIds is set
        consumables: startConsumables,
        reward: null,
        rewardNodeId: null,
        currentSupplyIds: supplyIds.slice(), // Initialize current supplies
      };

      // Apply any "on gain" effects immediately for all supplies
      for (const supplyId of supplyIds) {
        next = applySupplyOnGain(next, supplyId);
      }

      return next;
    }

    case "OPEN_NODE": {
      if (!state.map) return state;
      const node = state.map.nodes[action.nodeId];
      // If the player advances to a new node, clear any pending reward from the previous node.
      const movingAwayFromReward = !!state.reward && !!state.rewardNodeId && action.nodeId !== state.rewardNodeId;
      const nextLockedNodeIds = movingAwayFromReward && state.rewardNodeId
        ? Array.from(new Set([...(state.lockedNodeIds ?? []), state.rewardNodeId]))
        : (state.lockedNodeIds ?? []);
      const supplyIds = state.currentSupplyIds ?? [];
      const forcedEventId = state.debugForcedEventId ?? null;

      let nodeScreen: GameState["nodeScreen"];

      // If we have cached screen state for this node and we're re-opening it (common when leaving a node
      // and returning to overworld without advancing), restore it.
      const cached = state.nodeScreenCache?.[node.id];
      if (cached) {
        // In older builds, EVENT node screens were cached without event metadata.
        // If we detect an invalid cached event, rebuild it.
        if (node.type === "EVENT") {
          if (forcedEventId) {
            const rebuilt = buildEventNodeState(state.seed, node.id, node.depth) as any;
            nodeScreen = { ...rebuilt, eventId: forcedEventId, step: "INTRO", resultText: undefined, pendingUpgradeText: undefined };
          } else {
            const ce = cached as any;
            if (ce?.type !== "EVENT" || !ce.eventId || !ce.step) {
              nodeScreen = buildEventNodeState(state.seed, node.id, node.depth);
            } else {
              nodeScreen = cached;
            }
          }
        } else {
          nodeScreen = cached;
        }
      } else {
        if (node.type === "SHOP") {
          nodeScreen = buildShopNodeState({ runSeed: state.seed, nodeId: node.id, depth: node.depth, supplyIds, shopRemovalsUsed: state.shopRemovalsUsed ?? 0 });
        } else if (node.type === "REST") {
          nodeScreen = buildRestNodeState({ nodeId: node.id, depth: node.depth });
        } else if (node.type === "EVENT") {
          const rebuilt = buildEventNodeState(state.seed, node.id, node.depth) as any;
          nodeScreen = forcedEventId
            ? { ...rebuilt, eventId: forcedEventId, step: "INTRO", resultText: undefined, pendingUpgradeText: undefined }
            : rebuilt;
        } else {
          nodeScreen = { type: node.type as any, nodeId: node.id, depth: node.depth };
        }
      }

      return {
        ...state,
        currentNodeId: action.nodeId,
        screen: "NODE",
        nodeScreen,
        lockedNodeIds: nextLockedNodeIds,
        debugForcedEventId: (node.type === "EVENT" && forcedEventId) ? null : (state.debugForcedEventId ?? null),
        reward: movingAwayFromReward ? null : state.reward,
        rewardNodeId: movingAwayFromReward ? null : state.rewardNodeId,
      };
    }

    case "SHOP_BUY": {
      if (state.screen !== "NODE" || !state.nodeScreen || state.nodeScreen.type !== "SHOP") return state;
      const ns = state.nodeScreen;
      const supplyIds = state.currentSupplyIds ?? [];

      // Consumables inventory cap: can't buy if already full.
      if (action.kind === "consumable" && (state.consumables ?? []).length >= 3) return state;
      const offer = [...(ns.cardOffers ?? []), ...(ns.consumableOffers ?? []), ...(ns.supplyOffers ?? [])].find(
        (o) => o.kind === action.kind && o.id === action.id
      );
      const price = offer?.price ?? 0;
      if (!offer) return state;
      if ((state.gold ?? 0) < price) return state;

      // Already bought? (prevents double-click race)
      if ((ns.bought ?? []).some((b) => b.kind === action.kind && b.id === action.id)) return state;

      // Validate item exists in offers
      if (![...(ns.cardOffers ?? []), ...(ns.consumableOffers ?? []), ...(ns.supplyOffers ?? [])].some((o) => o.kind === action.kind && o.id === action.id)) {
        return state;
      }

      let next: GameState = {
        ...state,
        gold: Math.max(0, (state.gold ?? 0) - price),
        nodeScreen: {
          ...ns,
          bought: [...(ns.bought ?? []), { kind: action.kind, id: action.id }],
        },
      };

      if (action.kind === "card") {
        if (!next.setup) return next;
        const setup = { ...next.setup, deckCardIds: [...(next.setup.deckCardIds ?? []), action.id] };
        next = { ...next, setup };
        return next;
      }

      if (action.kind === "consumable") {
        const inv = (next.consumables ?? []).slice();
        if (inv.length >= 3) return next;
        inv.push(action.id);
        return { ...next, consumables: inv };
      }

      // supply
      if ((next.currentSupplyIds ?? []).includes(action.id)) return next;
      const currentSupplyIds = [...(next.currentSupplyIds ?? []), action.id];
      next = { ...next, currentSupplyIds };
      next = applySupplyOnGain(next, action.id);
      return next;
    }

    case "SHOP_REMOVE_CARD": {
      if (state.screen !== "NODE" || !state.nodeScreen || state.nodeScreen.type !== "SHOP") return state;
      if (!state.setup) return state;

      const ns = state.nodeScreen;
      const supplyIds = state.currentSupplyIds ?? [];
      const isEventShop = !!(ns as any).eventShop;

      const localUsed = Math.max(0, Math.floor(Number((ns as any).removalsUsed ?? 0)));
      const globalUsed = Math.max(0, Math.floor(Number(state.shopRemovalsUsed ?? 0)));

      // IMPORTANT: Event shops (ex: Pop-Up Vendor) track removal pricing independently from regular shops.
      const cost = nextRemovalCost(isEventShop ? localUsed : globalUsed, supplyIds);
      if ((state.gold ?? 0) < cost) return state;

      const deck = (state.setup.deckCardIds ?? []).slice();
      const idx = deck.indexOf(action.cardId);
      if (idx < 0) return state;

      // Don't allow removing the last card.
      if (deck.length <= 1) return state;

      deck.splice(idx, 1);

      const nextGold = Math.max(0, (state.gold ?? 0) - cost);

      if (isEventShop) {
        return {
          ...state,
          gold: nextGold,
          setup: { ...state.setup, deckCardIds: deck },
          nodeScreen: { ...ns, removalsUsed: localUsed + 1 },
        };
      }

      // Regular shops: use the run-wide removal counter.
      return {
        ...state,
        gold: nextGold,
        setup: { ...state.setup, deckCardIds: deck },
        shopRemovalsUsed: globalUsed + 1,
        nodeScreen: { ...ns, removalsUsed: globalUsed + 1 },
      };
    }

    case "SHOP_REFRESH": {
      if (state.screen !== "NODE" || !state.nodeScreen || state.nodeScreen.type !== "SHOP") return state;
      const ns = state.nodeScreen;
      if ((ns as any).eventShop) return state;
      const refreshesUsed = Math.max(0, Math.floor(Number((ns as any).refreshesUsed ?? 0)));
      const cost = 75 + 25 * refreshesUsed;
      if ((state.gold ?? 0) < cost) return state;

      const supplyIds = state.currentSupplyIds ?? [];
      const rebuilt = buildShopNodeState({
        runSeed: state.seed,
        nodeId: ns.nodeId,
        depth: ns.depth,
        supplyIds,
        shopRemovalsUsed: state.shopRemovalsUsed ?? 0,
        refreshesUsed: refreshesUsed + 1,
      });

      return {
        ...state,
        gold: Math.max(0, (state.gold ?? 0) - cost),
        nodeScreen: {
          ...rebuilt,
          bought: ns.bought ?? [],
        },
      };
    }

    case "REST_HEAL": {
      if (state.screen !== "NODE" || !state.nodeScreen || state.nodeScreen.type !== "REST") return state;
      if (state.nodeScreen.didHeal) return state;
      // If the player already upgraded at this site, only allow resting if they have Comfy Pillow.
      if (state.nodeScreen.didUpgrade && !(state.currentSupplyIds ?? []).includes("sup_upgrade_rest")) return state;
      const healAmt = Math.max(1, Math.floor((state.maxHp ?? 1) * 0.3));
      const hp = Math.min(state.maxHp, Math.max(0, (state.hp ?? 0) + healAmt));
      return { ...state, hp, nodeScreen: { ...state.nodeScreen, didHeal: true } };
    }

    case "REST_UPGRADE": {
      if (state.screen !== "NODE" || !state.nodeScreen || state.nodeScreen.type !== "REST") return state;
      if (state.nodeScreen.didUpgrade) return state;

      // Upgrade is always allowed as an alternative to resting.
      // If the player already rested (healed) at this site, only allow upgrading if they own Comfy Pillow.
      if (state.nodeScreen.didHeal && !(state.currentSupplyIds ?? []).includes("sup_upgrade_rest")) return state;
      if (!state.setup) return state;
      const deck = (state.setup.deckCardIds ?? []).slice();
      const idx = deck.indexOf(action.cardId);
      if (idx < 0) return state;
      deck[idx] = upgradeCardId(deck[idx]);
      return {
        ...state,
        setup: { ...state.setup, deckCardIds: deck },
        nodeScreen: { ...state.nodeScreen, didUpgrade: true },
      };
    }

    case "EVENT_CHOOSE": {
      if (state.screen !== "NODE" || !state.nodeScreen || state.nodeScreen.type !== "EVENT") return state;
      const ns = state.nodeScreen;

      if (ns.eventId === "hallway_shortcut") {
        try {
          console.log("[EVENT hallway_shortcut] EVENT_CHOOSE", {
            step: (ns as any).step,
            choiceId: (action as any).choiceId,
            gold: state.gold,
            hp: state.hp,
          });
        } catch {}
      }

      // Most events only allow choosing options during the INTRO step.
// Some events (ex: Hallway Shortcut, Exam Week Ladder) have interactive sub-steps.
const allowHallwayChoose = ns.eventId === "hallway_shortcut" && ns.step === "HALLWAY";
const allowExamLadderChoose = ns.eventId === "exam_week_ladder" && ns.step === "EXAM_LADDER_FEEDBACK";
if (ns.step !== "INTRO" && !allowHallwayChoose && !allowExamLadderChoose) return state;


      // ----------------
      // Hallway Shortcut (press-your-luck) — Locker row modal
      // ----------------
      if (ns.eventId === "hallway_shortcut") {
        const nodeId = ns.nodeId;

        const baseTally = ns.hallwayTally ?? {
          goldGained: 0,
          goldLost: 0,
          healed: 0,
          damageTaken: 0,
          supplyIds: [] as string[],
        };

        if (ns.step === "INTRO") {
          if (action.choiceId === "leave") {
            return {
              ...state,
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText: "You decide not to risk it and stick to the main path.",
              },
            };
          }

          if (action.choiceId !== "enter") return state;

          // Build the 6 locker outcomes (press-your-luck).
          // NOTE: We intentionally reshuffle each time the event is entered (even within
          // the same run) so the Debug "Force Event" tool doesn't always produce the
          // exact same locker order.
          const hallwayPlays = Number.isFinite((state as any).hallwayPlays)
            ? (state as any).hallwayPlays
            : 0;
          const nextHallwayPlays = hallwayPlays + 1;

          const nodeSeed = (state.seed ^ hashStringToInt(`event:hallway:${nodeId}:${nextHallwayPlays}`)) >>> 0;
          const rng = makeRng(nodeSeed);

          // 3 positive: +40 gold, heal 15, event-only supply
          // 3 negative: -40 gold, take 15 damage, and an ambush (scaled battle)
          // NOTE: This event should only ever award the Locker Door supply.
          const supplyId = "sup_block_persist";

          const lockers = (() => {
            const a = [
              { opened: false, collected: false, kind: "gold" as const, amount: 40 },
              { opened: false, collected: false, kind: "heal" as const, amount: 15 },
              { opened: false, collected: false, kind: "event_supply" as const, id: supplyId },
              { opened: false, collected: false, kind: "lose_gold" as const, amount: 40 },
              { opened: false, collected: false, kind: "damage" as const, amount: 15 },
              { opened: false, collected: false, kind: "ambush" as const },
            ];
            for (let i = a.length - 1; i > 0; i--) {
              const j = Math.floor(rng() * (i + 1));
              const tmp = a[i];
              a[i] = a[j];
              a[j] = tmp;
            }
            return a;
          })();

          return {
            ...state,
            hallwayPlays: nextHallwayPlays,
            nodeScreen: {
              ...ns,
              step: "HALLWAY",
              hallwayLockers: lockers,
              hallwayPending: undefined,
              hallwayTally: { ...baseTally, supplyIds: [] },
              hallwayLastText: "",
            },
          };
        }

        // Interactive hallway step
        if (ns.step === "HALLWAY") {
          const lockers0 = Array.isArray(ns.hallwayLockers) ? (ns.hallwayLockers as any[]) : [];
          const tally = ns.hallwayTally ?? baseTally;
          const pending = ns.hallwayPending;


          // Clear current selection / quiz and return to the locker row
          if (action.choiceId === "clear" || action.choiceId === "hallway_clear") {
            return {
              ...state,
              nodeScreen: {
                ...ns,
                step: "HALLWAY",
                hallwayLockers: lockers0.slice(),
                hallwayTally: tally,
                hallwayPending: undefined,
                hallwayQuiz: undefined,
                hallwayLastText: "",
              },
            };
          }

          // Leave the shortcut (end the event)
          if (action.choiceId === "exit") {
            const ambushUnresolved = lockers0.some(
              (l: any) => String(l?.kind ?? "") === "ambush" && !!l?.opened && !l?.collected
            );
            if (ambushUnresolved) {
              return {
                ...state,
                nodeScreen: {
                  ...ns,
                  hallwayLastText: "You can't leave — an ambush has been revealed. Collect the ambush locker to resolve it.",
                },
              };
            }

            const parts: string[] = [];
            if (tally.goldGained > 0) parts.push(`+${tally.goldGained} gold`);
            if (tally.goldLost > 0) parts.push(`-${tally.goldLost} gold`);
            if (tally.healed > 0) parts.push(`heal ${tally.healed}`);
            if (tally.damageTaken > 0) parts.push(`take ${tally.damageTaken} damage`);
            if ((tally.supplyIds ?? []).length > 0) parts.push(`${tally.supplyIds.length} supply${tally.supplyIds.length === 1 ? "" : "ies"}`);
            const summary = parts.length ? parts.join(", ") : "nothing";

            return {
              ...state,
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText: `You slip back to the main hallway with ${summary}.`,
                hallwayLockers: lockers0.slice(),
                hallwayPending: undefined,
                hallwayQuiz: undefined,
                hallwayTally: tally,
              },
            };
          }

          // Collect the currently revealed locker reward
          // Use a dedicated action id for hallway collection so UI clicks can't
          // accidentally collide with other event choice ids.
          if (action.choiceId === "collect" || action.choiceId === "hallway_collect") {
            if (!pending) return state;
            const locker0 = lockers0[pending.index];
            if (!locker0 || locker0.collected) return state;

            const nextNodeScreenBase: any = {
              ...ns,
              step: "HALLWAY" as const,
              hallwayLockers: lockers0.slice(),
              hallwayTally: tally,
            };

            // Negative outcomes: allow a question to negate the penalty.
            if (pending.kind === "lose_gold" || pending.kind === "damage") {
              const existingQuiz: any = (ns as any).hallwayQuiz ?? null;
              if (existingQuiz && existingQuiz.pendingIndex === pending.index) return state;

              const qSeed =
                (state.seed ^ hashStringToInt(`event:hallway:quiz:${nodeId}:${pending.index}:${pending.kind}`)) >>> 0;
              const rngQ = makeRng(qSeed);
              const depth = state.map?.nodes?.[nodeId]?.depth ?? ns.depth ?? 1;
              const difficulty: 1 | 2 | 3 = depth <= 4 ? 1 : depth <= 9 ? 2 : 3;

              const question = getQuestion({ rng: rngQ, difficulty });

              return {
                ...state,
                nodeScreen: {
                  ...nextNodeScreenBase,
                  hallwayPending: pending,
                  hallwayQuiz: {
                    pendingIndex: pending.index,
                    kind: pending.kind,
                    amount: Math.max(0, Math.floor(Number(pending.amount ?? 0))),
                    question,
                  },
                  hallwayLastText: "Answer the question to negate the penalty.",
                },
              };
            }

            // For all other outcomes, collect immediately.
            const lockers = updateArrayItem(lockers0, pending.index, (l: any) => ({ ...l, collected: true }));

            const cleared = {
              ...nextNodeScreenBase,
              hallwayLockers: lockers,
              hallwayPending: undefined,
              hallwayQuiz: undefined,
            };

            if (pending.kind === "gold") {
              const amt = Math.max(0, Math.floor(Number(pending.amount ?? 0)));
              const before0 = Number(state.gold);
              const before = Number.isFinite(before0) ? Math.max(0, Math.floor(before0)) : 0;
              return {
                ...state,
                gold: before + amt,
                nodeScreen: {
                  ...cleared,
                  hallwayLastText: `You find coins tucked behind a locker. (+${amt} gold)`,
                  hallwayTally: { ...tally, goldGained: (tally.goldGained ?? 0) + amt },
                },
              };
            }

            if (pending.kind === "heal") {
              const amt = Math.max(0, Math.floor(Number(pending.amount ?? 0)));
              const hp0 = Number(state.hp);
              const max0 = Number(state.maxHp);
              const hp = Number.isFinite(hp0) ? Math.max(0, Math.floor(hp0)) : 0;
              const maxHp = Number.isFinite(max0) ? Math.max(1, Math.floor(max0)) : Math.max(1, hp);
              const hpNext = Math.min(maxHp, hp + amt);
              return maybeEnterDefeat({
                ...state,
                hp: hpNext,
                nodeScreen: {
                  ...cleared,
                  hallwayLastText: `You find a first-aid kit. (Heal ${amt})`,
                  hallwayTally: { ...tally, healed: (tally.healed ?? 0) + amt },
                },
              });
            }

            if (pending.kind === "event_supply") {
              const sid = String(pending.id ?? "");
              if (!sid) return { ...state, nodeScreen: cleared };

              const current = (state.currentSupplyIds ?? []).slice();
              if (current.includes(sid)) {
                // Duplicate: convert to gold
                const amt = 40;
                return {
                  ...state,
                  gold: Math.max(0, Math.floor(Number(state.gold ?? 0))) + amt,
                  nodeScreen: {
                    ...cleared,
                    hallwayLastText: `You find a supply you already own. You trade it for coins. (+${amt} gold)`,
                    hallwayTally: { ...tally, goldGained: (tally.goldGained ?? 0) + amt },
                  },
                };
              }

              let next: GameState = {
                ...state,
                currentSupplyIds: [...current, sid],
              } as any;

              // Apply supply on gain effects immediately
              next = applySupplyOnGain(next as any, sid) as any;

              // Keep legacy setup.supplyId in sync for UI display
              next = {
                ...next,
                setup: next.setup ? ({ ...(next.setup as any), supplyId: sid } as any) : next.setup,
              } as any;

              return {
                ...next,
                nodeScreen: {
                  ...cleared,
                  hallwayLastText: `You find a new supply: ${sid}.`,
                  hallwayTally: { ...tally, supplyIds: [...(tally.supplyIds ?? []), sid] },
                },
              } as any;
            }

            if (pending.kind === "ambush") {
              // Ambush: start a scaled encounter immediately. Any previously collected rewards remain.
              const ambushSeed =
                (state.seed ^ hashStringToInt(`event:hallway:ambush:${nodeId}:${pending.index}`)) >>> 0;
              const rng2 = makeRng(ambushSeed);
              const depth = state.map?.nodes?.[nodeId]?.depth ?? ns.depth ?? 1;
              const difficulty: 1 | 2 | 3 = depth <= 4 ? 1 : depth <= 9 ? 2 : 3;
              const isBoss = false;
              const isChallenge = false;

              // Avoid repeats within a depth pool until exhausted
              const usedAll = new Set(state.usedEncounterIds ?? []);
              const poolForThisBattle =
                depth <= 4 ? ENCOUNTER_POOL_EASY_5 : depth <= 9 ? ENCOUNTER_POOL_MED_5 : ENCOUNTER_POOL_HARD_5;
              const poolIds = poolForThisBattle.map((e) => e.id);
              const poolIsExhausted = poolIds.length > 0 && poolIds.every((id) => usedAll.has(id));
              const used = poolIsExhausted
                ? new Set((state.usedEncounterIds ?? []).filter((id) => !poolIds.includes(id)))
                : new Set(state.usedEncounterIds ?? []);

              try {
                let encounter = pickEncounterForDepth(rng2, depth, isBoss, isChallenge);
                for (let i = 0; i < 12; i++) {
                  if (!used.has(encounter.id)) break;
                  encounter = pickEncounterForDepth(rng2, depth, isBoss, isChallenge);
                }

                const enemies = encounterToEnemyStates(encounter, rng2);

                const deckCardIds = state.setup?.deckCardIds ?? [];
                const playerHpStart = state.hp;
                const playerMaxHp = state.maxHp;
                const playerName = state.setup?.playerName ?? "Player";
                const playerSprite = state.setup?.playerSprite ?? ({ kind: "emoji", value: "🧑‍🎓" } as SpriteRef);

                const supplyIds = (state.currentSupplyIds ?? []).slice();
                const legacySupplyId = supplyIds.length > 0 ? supplyIds[0] : null;

                let battle = startBattleCore({
                  rng: rng2,
                  difficulty,
                  isBoss,
                  playerHpStart,
                  playerMaxHp,
                  deckCardIds,
                  enemies,
                  playerName,
                  playerSprite,
                });

                battle = {
                  ...battle,
                  meta: {
                    ...(battle as any).meta,
                    supplyId: legacySupplyId,
                    supplyIds,
                    isChallenge,
                    runGold: state.gold ?? 0,
                    skipRewards: true,
                    // NOTE: no returnNodeScreen — ambush ends the event; collected rewards remain.
                  },
                };

                battle = applySuppliesToNewBattle(battle, supplyIds);

                const usedEncounterIds = Array.from(new Set([...(Array.from(used) ?? []), encounter.id]));

                return {
                  ...state,
                  usedEncounterIds,
                  screen: "BATTLE",
                  currentNodeId: nodeId,
                  nodeScreen: undefined,
                  battle,
                };
              } catch (err) {
                console.error("❌ EVENT hallway_shortcut AMBUSH START_BATTLE failed:", err);
                return {
                  ...state,
                  nodeScreen: {
                    ...cleared,
                    hallwayLastText: "The shadows stir… but nothing happens.",
                  },
                };
              }
            }


            return { ...state, nodeScreen: cleared };
          }

          // Open a locker (reveal only — must click Collect to apply)
          const m = /^locker_(\d+)$/.exec(action.choiceId);
          if (lockers0.length === 0) return state;
          if (!m) return state;
          const lockerIndex = Math.max(0, Math.min(lockers0.length - 1, Math.floor(Number(m[1]))));
          const locker = lockers0[lockerIndex];
          if (!locker) return state;

          // If the player has already collected this locker, it should remain inert.
          if (locker.collected) return state;

          // If it's already opened (but not collected), just re-select it so the UI
          // can show the reveal panel again.
          if (locker.opened) {
            return {
              ...state,
              nodeScreen: {
                ...ns,
                step: "HALLWAY",
                hallwayLockers: lockers0.slice(),
                hallwayPending: {
                  index: lockerIndex,
                  kind: locker.kind,
                  amount: locker.amount,
                  id: locker.id,
                },
                hallwayTally: tally,
              },
            };
          }

          const lockers = updateArrayItem(lockers0, lockerIndex, (l: any) => ({ ...l, opened: true }));

          return {
            ...state,
            nodeScreen: {
              ...ns,
              step: "HALLWAY",
              hallwayLockers: lockers,
              hallwayPending: {
                index: lockerIndex,
                kind: locker.kind,
                amount: locker.amount,
                id: locker.id,
              },
              hallwayTally: tally,
              hallwayLastText: "",
            },
          };
        }

        return state;
      }

      // ----------------
      // Gold Vault
      // ----------------
      if (ns.eventId === "vault") {
        // Vault choices are only available during INTRO.
        if (ns.step !== "INTRO") return state;

        const goldNow = Math.max(0, Math.floor(Number(state.gold ?? 0)));
        const supplyIdsNow = (state.currentSupplyIds ?? []).slice();
        const setupSupplyIds = (state.setup as any)?.supplyIds ? (state.setup as any).supplyIds.slice() : [];
        const legacySupplyId = (state.setup as any)?.supplyId ?? null;

        const hasPencil =
          supplyIdsNow.includes("sup_gold_boost") ||
          setupSupplyIds.includes("sup_gold_boost") ||
          legacySupplyId === "sup_gold_boost";

        const removePencil = () => {
          const nextSupplyIds = supplyIdsNow.filter((x) => x !== "sup_gold_boost");
          const nextSetupSupplyIds = setupSupplyIds.filter((x: string) => x !== "sup_gold_boost");
          const nextLegacySupplyId = legacySupplyId === "sup_gold_boost" ? null : legacySupplyId;
          return {
            nextSupplyIds,
            nextSetupSupplyIds,
            nextLegacySupplyId,
          };
        };

        if (action.choiceId === "offer_all_gold") {
          if (goldNow <= 0) return state;
          const healAmt = 15;
          const hpNext = Math.min(state.maxHp, Math.max(0, Math.floor(Number(state.hp ?? 0))) + healAmt);
          return {
            ...state,
            gold: 0,
            hp: hpNext,
            nodeScreen: {
              ...ns,
              step: "RESULT",
              resultText: `The vault hums approvingly. Your coins vanish… but you feel refreshed.

Lose all gold. Heal 15 HP.`,
            },
          };
        }

        if (action.choiceId === "trade_golden_pencil") {
          if (!hasPencil) return state;
          const { nextSupplyIds, nextSetupSupplyIds, nextLegacySupplyId } = removePencil();
          return {
            ...state,
            currentSupplyIds: nextSupplyIds,
            setup: {
              ...(state.setup as any),
              supplyIds: nextSetupSupplyIds,
              supplyId: nextLegacySupplyId,
            },
            nodeScreen: {
              ...ns,
              step: "UPGRADE_PICK",
              pendingUpgradeText: `The voice accepts the Golden Pencil.

Choose a card to upgrade.`,
            },
          };
        }

        if (action.choiceId === "ultimate_offering") {
          if (goldNow <= 0 || !hasPencil) return state;
          const { nextSupplyIds, nextSetupSupplyIds, nextLegacySupplyId } = removePencil();
          return {
            ...state,
            gold: 0,
            currentSupplyIds: nextSupplyIds,
            setup: {
              ...(state.setup as any),
              supplyIds: nextSetupSupplyIds,
              supplyId: nextLegacySupplyId,
            },
            nodeScreen: {
              ...ns,
              step: "CARD_PICK",
              pendingCardId: "atk_golden_strike",
              pendingCardResultText: `The vault’s door seals behind you. A radiant card materializes in your hands.

Gained Golden Strike.`,
            },
          };
        }

        if (action.choiceId === "leave") {
          const dmg = 15;
          const before = Math.max(0, Math.floor(Number(state.hp ?? 0)));
          const taken = Math.min(before, dmg);
          const hpNext = before - taken;
          return maybeEnterDefeat({
            ...state,
            hp: hpNext,
            nodeScreen: {
              ...ns,
              step: "RESULT",
              resultText: `You turn to leave. Pain explodes through your chest as the voice booms in anger.

Take 15 damage.`,
            },
          });
        }

        return state;
      }



      if (ns.eventId === "vending_machine_glitch") {
        const nodeId = String(ns.nodeId ?? "");
        const cost = 50;
        const inv = (state.consumables ?? []).slice();
        const slots = Math.max(0, 3 - inv.length);

        // Multi-claim reward step (lets players discard if their inventory is full).
        if (ns.step === "CONSUMABLE_CLAIM" && action.choiceId === "claim_done") {
          const claimed = Array.isArray((ns as any).claimedConsumableIds)
            ? ((ns as any).claimedConsumableIds as string[])
            : [];
          const left = Array.isArray((ns as any).pendingConsumableIds)
            ? ((ns as any).pendingConsumableIds as string[])
            : [];

          const nameFor = (id: string) => (CONSUMABLE_BY_ID.get(id) as any)?.name ?? id;
          const gainedNames = claimed.map(nameFor);
          const leftNames = left.map(nameFor);

          const gainedLine = gainedNames.length
            ? `Gained: ${gainedNames.join(", ")}.`
            : "You leave empty-handed.";
          const leftLine = leftNames.length ? `Left behind: ${leftNames.join(", ")}.` : "";

          const resultText = [
            "You step away from the machine.",
            "",
            gainedLine,
            leftLine,
          ]
            .filter(Boolean)
            .join("\n");

          return {
            ...state,
            nodeScreen: {
              ...ns,
              step: "RESULT",
              resultText,
              pendingConsumableIds: undefined,
              claimedConsumableIds: undefined,
              pendingRewardText: undefined,
            },
          };
        }

        if (action.choiceId === "buy") {
          const gold0 = Number(state.gold);
          const gold = Number.isFinite(gold0) ? Math.max(0, Math.floor(gold0)) : 0;
          if (gold < cost) {
            return {
              ...state,
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText:
                  "You jab at the glitching price display and pat your pockets.\n\nNot enough gold.",
              },
            };
          }

          // Roll a random consumable (preferring event-only when possible).
          const nonce = Number(state.eventRollNonce ?? 0);
          const base = (state.seed ^ hashStringToInt(`event:vending:${nodeId}:buy:${nonce}`)) >>> 0;
          const rng = makeRng((base ^ 0xA11CE) >>> 0);

          const eventOnly = CONSUMABLES_10.filter((c: any) => !!(c as any)?.eventOnly).map((c: any) => c.id);
          const nonEvent = CONSUMABLES_10.filter((c: any) => !(c as any)?.eventOnly).map((c: any) => c.id);
          const pool = eventOnly.length ? eventOnly : nonEvent.length ? nonEvent : CONSUMABLES_10.map((c: any) => c.id);
          const id = pool[Math.floor(rng() * pool.length)];

          return {
            ...state,
            gold: Math.max(0, gold - cost),
            eventRollNonce: nonce + 1,
            nodeScreen: {
              ...ns,
              step: "CONSUMABLE_CLAIM",
              pendingRewardText:
                `You feed the vending machine ${cost} gold. It flickers, hums, and finally drops a prize.`,
              pendingConsumableIds: id ? [id] : undefined,
              claimedConsumableIds: [],
            },
          };
        }

        if (action.choiceId === "shake") {
          const nonce = Number(state.eventRollNonce ?? 0);
          const base = (state.seed ^ hashStringToInt(`event:vending:${nodeId}:shake:${nonce}`)) >>> 0;
          const rng = makeRng((base ^ 0xBADC0DE) >>> 0);
          const success = rng() < 0.5;

          if (!success) {
            const dmg = 10;
            const before0 = Number(state.hp);
            const before = Number.isFinite(before0) ? Math.max(0, Math.floor(before0)) : 0;
            const taken = Math.min(before, dmg);
            const hpNext = before - taken;
            return maybeEnterDefeat({
              ...state,
              hp: hpNext,
              eventRollNonce: nonce + 1,
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText:
                  `You grab the sides and give it a violent shake.

The machine LURCHES… and then the whole thing bucks back into place. A metal corner clips you on the way down.

Take ${taken} damage.`,
              },
            });
          }

          const eventOnly = CONSUMABLES_10.filter((c: any) => !!(c as any)?.eventOnly).map((c: any) => c.id);
          const nonEvent = CONSUMABLES_10.filter((c: any) => !(c as any)?.eventOnly).map((c: any) => c.id);
          const pickAndRemove = (arr: string[]) => {
            const j = Math.floor(rng() * arr.length);
            return arr.splice(j, 1)[0];
          };

          // Offer two consumables (players can claim any/all, discarding if needed).
          const offer: string[] = [];
          const eo = eventOnly.slice();
          const ne = nonEvent.slice();
          while (offer.length < 2 && (eo.length > 0 || ne.length > 0)) {
            if (eo.length > 0) offer.push(pickAndRemove(eo));
            else offer.push(pickAndRemove(ne));
          }

          return {
            ...state,
            eventRollNonce: nonce + 1,
            nodeScreen: {
              ...ns,
              step: "CONSUMABLE_CLAIM",
              pendingRewardText:
                "You put your shoulder into the machine and shake. Hard.\n\nFor a second, nothing happens. Then—CLUNK.\n\nTwo items tumble out at once.",
              pendingConsumableIds: offer.length > 0 ? offer : undefined,
              claimedConsumableIds: [],
            },
          };
        }

        if (action.choiceId === "leave") {
          // Question gate
          const depth = Number((state.map?.nodes?.[nodeId] as any)?.depth ?? ns.depth ?? 1);
          const difficulty = depth <= 4 ? 1 : depth <= 9 ? 2 : 3;
          const qSeed = (state.seed ^ hashStringToInt(`event:gate:vending:${nodeId}`)) >>> 0;
          const qRng = makeRng((qSeed ^ 0xC0FFEE) >>> 0);
          const question = getQuestion({ rng: qRng, difficulty });

          return {
            ...state,
            nodeScreen: {
              ...ns,
              step: "QUESTION_GATE",
              gate: {
                question,
                promptText:
                  "As you turn to leave, a camera above the vending machine whirs to life. A tiny speaker crackles: ‘ACCESS DENIED. ANSWER REQUIRED.’\n\nWrong answer: take 5 damage.",
                onCorrectText:
                  "✅ You answer without blinking. The speaker makes a satisfied chirp and the hallway feels normal again. You walk away.",
                onWrongText:
                  "❌ The speaker emits a disappointed buzz. Something snaps shut on your finger as you pull your hand back.",
                wrongDamage: 5,
              },
            },
          };
        }

        return state;
      }

      if (ns.eventId === "library_study_session") {
        const nodeId = String(ns.nodeId ?? "");
        const inv = (state.consumables ?? []).slice();
        const slots = Math.max(0, 3 - inv.length);

        if (action.choiceId === "study") {
          if (!state.setup) return state;
          const deck = (state.setup.deckCardIds ?? []).slice();
          const anyUpgradable = deck.some((id) => upgradeCardId(id) !== id);
          if (!anyUpgradable) {
            return {
              ...state,
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText:
                  "You settle into a quiet corner and flip through your notes…\n\nBut everything in your deck already feels as polished as it can get.",
              },
            };
          }

          return {
            ...state,
            nodeScreen: {
              ...ns,
              step: "UPGRADE_PICK",
              pendingUpgradeText:
                "You spread your materials across the table: scribbled margins, practice problems, and half-finished diagrams.\n\nPick a card to refine.",
            },
          };
        }

        if (action.choiceId === "steal_notes") {
          if (!state.setup) return state;
          const hasPerfectRecord = stateHasSupply(state, PERFECT_RECORD_SUPPLY_ID);
          const deckBase = (state.setup.deckCardIds ?? []).slice();
          const nextDeck = hasPerfectRecord ? deckBase : [...deckBase, "neg_pop_quiz"];

          const supplyFlashNonce = hasPerfectRecord ? (Number((state as any).supplyFlashNonce ?? 0) + 1) : (state as any).supplyFlashNonce;
          const supplyFlashIds = hasPerfectRecord ? [PERFECT_RECORD_SUPPLY_ID] : (state as any).supplyFlashIds;

          return {
            ...state,
            supplyFlashNonce,
            supplyFlashIds,
            setup: { ...state.setup, deckCardIds: nextDeck },
            nodeScreen: {
              ...ns,
              step: "CONSUMABLE_CLAIM",
              pendingRewardText:
                hasPerfectRecord
                  ? "You ‘borrow’ a pristine set of notes from the top of a study stack.\n\nGain a Cheat Sheet.\n\n🛡️ Perfect Record prevents the Pop Quiz from being added to your deck."
                  : "You ‘borrow’ a pristine set of notes from the top of a study stack.\n\nGain a Cheat Sheet. Your deck gains a Pop Quiz.",
              pendingConsumableIds: ["con_cheat_sheet"],
              claimedConsumableIds: [],
            },
          };
        }

        if (action.choiceId === "nap") {
          const heal = 10;
          const loss = 30;

          const before0 = Number(state.hp);
          const before = Number.isFinite(before0) ? Math.max(0, Math.floor(before0)) : 0;
          const maxHp0 = Number(state.maxHp);
          const maxHp = Number.isFinite(maxHp0) ? Math.max(1, Math.floor(maxHp0)) : 50;
          const hpNext = Math.min(maxHp, before + heal);
          const healed = Math.max(0, hpNext - before);

          const gold0 = Number(state.gold);
          const gold = Number.isFinite(gold0) ? Math.max(0, Math.floor(gold0)) : 0;
          if (gold < loss) {
            return {
              ...state,
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText:
                  "You eye the dangerously inviting chair… but you don't have 30 gold to pay for a 'nap fee.'",
              },
            };
          }

          return {
            ...state,
            hp: hpNext,
            gold: gold - loss,
            nodeScreen: {
              ...ns,
              step: "RESULT",
              resultText:
                `You slide into a back row, put your head down, and let the hush of the library do the rest.

Heal ${healed}. Lose ${loss} gold.`,
            },
          };
        }

        if (action.choiceId === "leave") {
          const depth = Number((state.map?.nodes?.[nodeId] as any)?.depth ?? ns.depth ?? 1);
          const difficulty = depth <= 4 ? 1 : depth <= 9 ? 2 : 3;
          const qSeed = (state.seed ^ hashStringToInt(`event:gate:library:${nodeId}`)) >>> 0;
          const qRng = makeRng((qSeed ^ 0xABCD) >>> 0);
          const question = getQuestion({ rng: qRng, difficulty });

          return {
            ...state,
            nodeScreen: {
              ...ns,
              step: "QUESTION_GATE",
              gate: {
                question,
                promptText:
                  "As you stand, a librarian’s eyes track you over the rim of their glasses. ‘Before you go,’ they say, ‘answer this.’\n\nWrong answer: take 5 damage.",
                onCorrectText:
                  "✅ You answer softly. The librarian nods once and returns to shelving books. You slip out.",
                onWrongText:
                  "❌ You answer… and the librarian’s stare hardens. You bump a cart of textbooks on the way out.",
                wrongDamage: 5,
              },
            },
          };
        }

        return state;
      }


      if (ns.eventId === "detention_notice") {
        const inv = (state.consumables ?? []).slice();
        const slots = Math.max(0, 3 - inv.length);
        const nodeId = String(ns.nodeId ?? "");

        if (action.choiceId === "serve_detention") {
          if (slots <= 0) {
            return {
              ...state,
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText:
                  "You take the long walk to the detention room and sit through the silence.\n\nWhen it's finally over, someone tries to hand you a Trash Bin… but your bag is already full.\n\nNo room for another consumable.",
              },
            };
          }

          return {
            ...state,
            consumables: [...inv, "con_trash_bin"],
            nodeScreen: {
              ...ns,
              step: "RESULT",
              resultText:
                "You show up. You sit. You stare at the clock until it feels personal.\n\nAt the end, the supervising staff member slides you a battered plastic bin like it's a trophy.\n\nGained: Trash Bin.",
            },
          };
        }

        if (action.choiceId === "bribe_staff") {
          const cost = 75;
          const gold0 = Number(state.gold);
          const gold = Number.isFinite(gold0) ? Math.max(0, Math.floor(gold0)) : 0;
          if (gold < cost) {
            return {
              ...state,
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText:
                  "You make a subtle offer… and immediately realize you don't have enough gold to make it convincing.\n\nNot enough gold.",
              },
            };
          }

          if (!state.setup) return state;
          const deck = (state.setup.deckCardIds ?? []).slice();
          const anyUpgradable = deck.some((id) => upgradeCardId(id) !== id);
          if (!anyUpgradable) {
            return {
              ...state,
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText:
                  "You try to negotiate your way out of trouble… but when you look over your deck, there's nothing that can be refined any further.\n\nNo upgradable cards.",
              },
            };
          }

          return {
            ...state,
            gold: gold - cost,
            nodeScreen: {
              ...ns,
              step: "UPGRADE_PICK",
              pendingUpgradeText:
                "You fold 75 gold into your palm and let it change hands without a word.\n\n‘Right… I must've mixed up the name,’ the staff member mutters.\n\nChoose a card to upgrade.",
            },
          };
        }

        if (action.choiceId === "skip_gain_curse") {
          if (!state.setup) return state;

          return {
            ...state,
            nodeScreen: {
              ...ns,
              step: "CARD_PICK",
              pendingRewardText:
                "You don't show. You tell yourself it's fine.\n\nBut the notice doesn't disappear—it lingers like a weight in your backpack.\n\nChoose the Curse you’ll carry.",
              pendingCardId: "neg_curse",
              pendingCardResultText:
                "You don't show. You tell yourself it's fine.\n\nBut the notice doesn't disappear—it lingers like a weight in your backpack.\n\nAdded to deck: Curse.",
            },
          };
        }

        return state;
      }

      if (ns.eventId === "substitute_teacher") {
        const nodeId = String(ns.nodeId ?? "");
        const inv = (state.consumables ?? []).slice();
        const slots = Math.max(0, 3 - inv.length);

        const negName = (id: string) => {
          switch (id) {
            case "neg_curse":
              return "Curse";
            case "neg_infestation_perm":
              return "Infestation";
            case "neg_radiation_perm":
              return "Radiation";
            case "neg_pop_quiz":
              return "Pop Quiz";
            default:
              return id;
          }
        };

        if (action.choiceId === "help_them") {
          if (slots <= 0) {
            return {
              ...state,
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText:
                  "You whisper quick instructions and point out the right page numbers.\n\nThe substitute tries to hand you an Answer Key in gratitude… but your bag is already full.\n\nNo room for another consumable.",
              },
            };
          }

          return {
            ...state,
            consumables: [...inv, "con_answer_key"],
            nodeScreen: {
              ...ns,
              step: "RESULT",
              resultText:
                "You step up, quietly explain the routine, and write the first example on the board.\n\nRelief washes over the substitute’s face. They slip you something folded behind the attendance sheet.\n\nGained: Answer Key.",
            },
          };
        }

        if (action.choiceId === "cause_chaos") {
          if (!state.setup) return state;

          const nonce = Number(state.eventRollNonce ?? 0);
          const base = (state.seed ^ hashStringToInt(`event:sub:${nodeId}:chaos:${nonce}`)) >>> 0;
          const rng = makeRng((base ^ 0x5AB57) >>> 0);

          const pool = ["neg_curse", "neg_infestation_perm", "neg_radiation_perm", "neg_pop_quiz"];
          const negId = pool[Math.floor(rng() * pool.length)];

          return {
            ...state,
            eventRollNonce: nonce + 1,
            nodeScreen: {
              ...ns,
              step: "CARD_PICK",
              pendingGoldGain: 75,
              pendingRewardText:
                `You casually “help” by giving the class the *worst possible* instructions.

The room erupts. While everyone is distracted, you pocket a stack of loose change from a desk drawer.

Gain 75 gold. Choose your consequence.`,
              pendingCardId: negId,
              pendingCardResultText:
                `You casually “help” by giving the class the *worst possible* instructions.

The room erupts. While everyone is distracted, you pocket a stack of loose change from a desk drawer.

Gain 75 gold. Added to deck: ${negName(negId)}.`,
            },
          };
        }

        if (action.choiceId === "leave") {
          // Question gate
          const depth = Number((state.map?.nodes?.[nodeId] as any)?.depth ?? ns.depth ?? 1);
          const difficulty = depth <= 4 ? 1 : depth <= 9 ? 2 : 3;
          const qSeed = (state.seed ^ hashStringToInt(`event:gate:sub:${nodeId}`)) >>> 0;
          const qRng = makeRng((qSeed ^ 0x5151) >>> 0);
          const question = getQuestion({ rng: qRng, difficulty });

          return {
            ...state,
            nodeScreen: {
              ...ns,
              step: "QUESTION_GATE",
              gate: {
                question,
                promptText:
                  "As you slide toward the door, the substitute looks up. ‘Wait—before you go… can you answer *this*?’\n\nWrong answer: take 5 damage.",
                onCorrectText:
                  "✅ You answer effortlessly. The substitute nods, grateful, and turns back to the class. You slip out.",
                onWrongText:
                  "❌ You fumble the answer. The substitute calls your name a little too loudly as you retreat.",
                wrongDamage: 5,
              },
            },
          };
        }

        return state;
      }

      if (ns.eventId === "hidden_encounter") {
        if (action.choiceId === "walk_away") {
          return {
            ...state,
            nodeScreen: {
              ...ns,
              step: "RESULT",
              resultText: "You decide it isn't worth the risk today.\n\nYou walk away quietly.",
            },
          };
        }

        if (action.choiceId === "investigate") {
          const nodeId = ns.nodeId;
          // If this node has already been completed/locked, don't allow restarting the battle.
          if ((state.lockedNodeIds ?? []).includes(nodeId)) return state;

          const deckCardIds = state.setup?.deckCardIds ?? [];

          // Deterministic RNG per node (stable for a given run seed + nodeId)
          const nodeSeed = (state.seed ^ hashStringToInt(nodeId)) >>> 0;
          const rng = makeRng(nodeSeed);

          const depth = state.map?.nodes?.[nodeId]?.depth ?? ns.depth ?? 1;
          const difficulty: 1 | 2 | 3 = depth <= 4 ? 1 : depth <= 9 ? 2 : 3;
          const isBoss = false;
          const isChallenge = false;

          // Avoid repeating encounters until the pool is exhausted, then allow repeats.
          const usedAll = new Set(state.usedEncounterIds ?? []);
          const poolForThisBattle = depth <= 4 ? ENCOUNTER_POOL_EASY_5 : depth <= 9 ? ENCOUNTER_POOL_MED_5 : ENCOUNTER_POOL_HARD_5;
          const poolIds = poolForThisBattle.map((e) => e.id);
          const poolIsExhausted = poolIds.length > 0 && poolIds.every((id) => usedAll.has(id));
          const used = poolIsExhausted
            ? new Set((state.usedEncounterIds ?? []).filter((id) => !poolIds.includes(id)))
            : new Set(state.usedEncounterIds ?? []);

          let encounter = pickEncounterForDepth(rng, depth, isBoss, isChallenge);
          for (let i = 0; i < 12; i++) {
            if (!used.has(encounter.id)) break;
            encounter = pickEncounterForDepth(rng, depth, isBoss, isChallenge);
          }
          const enemies = encounterToEnemyStates(encounter, rng);

          const setup = state.setup ?? null;
          const playerHpStart = state.hp;
          const playerMaxHp = state.maxHp;
          const playerName = setup?.playerName ?? "Player";
          const playerSprite = setup?.playerSprite ?? { kind: "emoji", value: "🧑‍🎓" };

          try {
            const supplyIds = (state.currentSupplyIds ?? []).length > 0
              ? (state.currentSupplyIds ?? [])
              : (setup?.supplyIds ?? (setup?.supplyId ? [setup.supplyId] : []));
            const legacySupplyId = supplyIds.length > 0 ? supplyIds[0] : null;

            let battle = startBattleCore({
              rng,
              difficulty,
              isBoss,
              playerHpStart,
              playerMaxHp,
              deckCardIds,
              enemies,
              playerName,
              playerSprite,
            });

            battle = {
              ...battle,
              meta: {
                ...(battle as any).meta,
                supplyId: legacySupplyId,
                supplyIds,
                isChallenge,
                runGold: state.gold ?? 0,
              },
            };

            battle = applySuppliesToNewBattle(battle, supplyIds);

            // UI: flash the equipped supply when it activates (same behavior as START_BATTLE)
            const didStartStrength = supplyIds.includes("sup_start_strength");
            const supplyFlashNonce = didStartStrength ? (state.supplyFlashNonce ?? 0) + 1 : (state.supplyFlashNonce ?? 0);
            const supplyFlashIds = didStartStrength ? ["sup_start_strength"] : (state.supplyFlashIds ?? []);

            const usedEncounterIds = Array.from(new Set([...(Array.from(used) ?? []), encounter.id]));

            return {
              ...state,
              usedEncounterIds,
              supplyFlashNonce,
              supplyFlashIds,
              currentNodeId: nodeId,
              screen: "BATTLE",
              battle,
              nodeScreen: undefined,
            };
          } catch (err) {
            console.error("❌ EVENT hidden_encounter START_BATTLE failed:", err);
            return state;
          }
        }

        return state;
      }


      if (ns.eventId === "chem_lab_spill") {
        if (ns.step !== "INTRO") return state;
        if (!state.setup) return state;

        const maxHp0 = Number(state.maxHp ?? 1);
        const maxHp = Number.isFinite(maxHp0) ? Math.max(1, Math.floor(maxHp0)) : 1;

        const cur = (state.currentSupplyIds ?? []).slice();
        // Persist newly-earned supplies into setup loadout when needed.
        // (Some event branches reference setupSupplyIds; ensure it's always defined + typed.)
        const setupSupplyIds: string[] = Array.isArray((state.setup as any)?.supplyIds)
          ? ((state.setup as any).supplyIds as any[]).filter((s: any): s is string => typeof s === "string")
          : [];
        const legacySupplyId = (state.setup as any)?.supplyId ?? null;

        if (action.choiceId === "trade_deodorant") {
          const deodorantId = "sup_apply_poison";
          if (!cur.includes(deodorantId)) {
            return {
              ...state,
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText:
                  "You rummage through your bag… and realize you don’t have any Deodorant to trade.\n\nYou back away from the spill, embarrassed.",
              },
            };
          }

          const nextCur = cur.filter((x) => x !== deodorantId);
          const nextSetupSupplyIds = setupSupplyIds.filter((x) => x !== deodorantId);
          const nextLegacy = legacySupplyId === deodorantId ? (nextCur[nextCur.length - 1] ?? null) : legacySupplyId;

          return {
            ...state,
            hp: maxHp,
            currentSupplyIds: nextCur,
            setup: state.setup
              ? ({
                  ...(state.setup as any),
                  supplyIds: nextSetupSupplyIds,
                  supplyId: nextLegacy,
                } as any)
              : state.setup,
            nodeScreen: {
              ...ns,
              step: "RESULT",
              resultText:
                "You swap your Deodorant for the emergency eyewash kit and a sealed first-aid pack.\n\nA few frantic splashes later, your head clears and your body steadies.\n\n✅ Fully healed.",
            },
          };
        }

        if (action.choiceId === "take_contagion") {
          const sid = "sup_poison_spreads";
          if (cur.includes(sid)) return state;

          // Grant the supply now, but require the player to explicitly confirm the permanent negative card.
          const pendingCardId = "neg_infestation_perm";

          let next: GameState = {
            ...state,
            currentSupplyIds: [...cur, sid],
          } as any;

          next = applySupplyOnGain(next as any, sid) as any;

          return {
            ...next,
            setup: next.setup
              ? ({
                  ...(next.setup as any),
                  supplyId: sid,
                  supplyIds: Array.from(new Set([...(setupSupplyIds ?? []), sid])),
                } as any)
              : next.setup,
            nodeScreen: {
              ...ns,
              step: "CARD_PICK",
              pendingCardId,
              pendingRewardText:
                `You bottle the nasty sample and label it like a true menace.

🦠 Gained Contagion.

Something hitches a ride in your deck… confirm the card added.`,
              pendingCardResultText:
                `You bottle the nasty sample and label it like a true menace.

🦠 Gained Contagion.
🃏 Added permanent Infestation.`,
            } as any,
          };
        }

        if (action.choiceId === "take_toxic_booster") {
          const sid = "sup_poison_double_damage";
          if (cur.includes(sid)) return state;

          // Grant the supply now, but require the player to explicitly confirm the permanent negative card.
          const pendingCardId = "neg_radiation_perm";

          let next: GameState = {
            ...state,
            currentSupplyIds: [...cur, sid],
          } as any;

          next = applySupplyOnGain(next as any, sid) as any;

          return {
            ...next,
            setup: next.setup
              ? ({
                  ...(next.setup as any),
                  supplyId: sid,
                  supplyIds: Array.from(new Set([...(setupSupplyIds ?? []), sid])),
                } as any)
              : next.setup,
            nodeScreen: {
              ...ns,
              step: "CARD_PICK",
              pendingCardId,
              pendingRewardText:
                `You snag the unlabeled vial marked ‘TOXIC BOOSTER’ and pocket it.

☣️ Gained Toxic Booster.

Your deck feels heavier… confirm the card added.`,
              pendingCardResultText:
                `You snag the unlabeled vial marked ‘TOXIC BOOSTER’ and pocket it.

☣️ Gained Toxic Booster.
🃏 Added permanent Radiation.`,
            } as any,
          };
        }

        if (action.choiceId === "leave") {
          const dmg = 5;
          const before0 = Number(state.hp);
          const before = Number.isFinite(before0) ? Math.max(0, Math.floor(before0)) : 0;
          const taken = Math.min(before, dmg);
          const hpNext = before - taken;

          return maybeEnterDefeat({
            ...state,
            hp: hpNext,
            nodeScreen: {
              ...ns,
              step: "RESULT",
              resultText:
                `You bolt for the door—eyes watering, lungs burning.\n\nTake ${taken} damage.`,
            },
          });
        }

        return state;
      }

      if (ns.eventId === "charging_station") {
        if (ns.step !== "INTRO") return state;
        if (!state.setup) return state;

        // Used when we need to persist newly-earned supplies into the setup loadout.
        // (Some event rewards update both `currentSupplyIds` and the setup `supplyIds` list.)
        const setupSupplyIds = (state.setup as any)?.supplyIds ? (state.setup as any).supplyIds.slice() : [];

        const nodeId = String(ns.nodeId ?? "");
        const cur = (state.currentSupplyIds ?? []).slice();

        const batteryId = "sup_energy_carryover";

        if (action.choiceId === "pay_150") {
          const cost = 150;
          const gold0 = Math.max(0, Math.floor(Number(state.gold ?? 0)));
          if (gold0 < cost || cur.includes(batteryId)) return state;

          let next: GameState = {
            ...state,
            gold: gold0 - cost,
            currentSupplyIds: [...cur, batteryId],
          } as any;

          next = applySupplyOnGain(next as any, batteryId) as any;

          return {
            ...next,
            setup: next.setup
              ? ({
                  ...(next.setup as any),
                  supplyId: batteryId,
                  supplyIds: Array.from(new Set([...(setupSupplyIds ?? []), batteryId])),
                } as any)
              : next.setup,
            nodeScreen: {
              ...ns,
              step: "RESULT",
              resultText:
                "You tap your card and the cabinet unlocks with a polite chime.\n\nA pristine **Battery Pack** slides out like it’s been waiting for you.\n\n🔋 Gained Battery Pack.",
            },
          };
        }

        if (action.choiceId === "rip_it_out") {
          if (cur.includes(batteryId)) return state;

          const dmg = 15;
          const before0 = Number(state.hp);
          const before = Number.isFinite(before0) ? Math.max(0, Math.floor(before0)) : 0;
          const taken = Math.min(before, dmg);
          const hpNext = before - taken;

          const pendingCardId = "neg_radiation_perm";

          let next: GameState = {
            ...state,
            hp: hpNext,
            currentSupplyIds: [...cur, batteryId],
          } as any;

          next = applySupplyOnGain(next as any, batteryId) as any;

          next = {
            ...next,
            setup: next.setup
              ? ({
                  ...(next.setup as any),
                  supplyId: batteryId,
                  supplyIds: Array.from(new Set([...(setupSupplyIds ?? []), batteryId])),
                } as any)
              : next.setup,
          } as any;

          // If the rip kills you outright, resolve immediately.
          if (hpNext <= 0) {
            return maybeEnterDefeat({
              ...next,
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText:
                  `You jam your fingers into the cabinet seam and **YANK**.

A shower of sparks snaps across your knuckles.

🔋 Gained Battery Pack.

Take ${taken} damage.`,
              },
            } as any);
          }

          return {
            ...next,
            nodeScreen: {
              ...ns,
              step: "CARD_PICK",
              pendingCardId,
              pendingRewardText:
                `You jam your fingers into the cabinet seam and **YANK**.

A shower of sparks snaps across your knuckles.

🔋 Gained Battery Pack.

Take ${taken} damage.

Your deck tingles—confirm the card added.`,
              pendingCardResultText:
                `You jam your fingers into the cabinet seam and **YANK**.

A shower of sparks snaps across your knuckles.

🔋 Gained Battery Pack.
🃏 Added permanent Radiation.

Take ${taken} damage.`,
            } as any,
          };
        }

        if (action.choiceId === "overclock_it") {
          // Force the player to explicitly collect the Overclock card.
          return {
            ...state,
            nodeScreen: {
              ...ns,
              step: "CARD_PICK",
              pendingCardId: "skl_overclock",
              pendingExtraCardIds: ["neg_radiation_perm"],
              pendingRewardText:
                `You rewire the output by instinct—two clips, a twist, and a dangerous little smile.

⚡ A card pops loose from the panel… collect it.`,
              pendingCardResultText:
                `You rewire the output by instinct—two clips, a twist, and a dangerous little smile.

⚡ Gained Overclock.
🃏 Added permanent Radiation.`,
            } as any,
          };
        }

        if (action.choiceId === "leave") {
          // Question gate
          const depth = Number((state.map?.nodes?.[nodeId] as any)?.depth ?? ns.depth ?? 1);
          const difficulty = depth <= 4 ? 1 : depth <= 9 ? 2 : 3;
          const qSeed = (state.seed ^ hashStringToInt(`event:gate:charging:${nodeId}`)) >>> 0;
          const qRng = makeRng((qSeed ^ 0xC0FFEE) >>> 0);
          const question = getQuestion({ rng: qRng, difficulty });

          return {
            ...state,
            nodeScreen: {
              ...ns,
              step: "QUESTION_GATE",
              gate: {
                question,
                promptText:
                  "As you step away, the cabinet’s screen flickers: **‘EXIT CHECK’**.\n\nA robotic voice chirps: ‘PLEASE SOLVE TO DISCONNECT.’",
                onCorrectText:
                  "✅ You punch in the answer. The humming stops. You leave without incident.",
                onWrongText:
                  "❌ The station emits an angry beep and snaps a static shock into your fingertips.",
                wrongDamage: 5,
              },
            },
          };
        }

        return state;
      }

      
      if (ns.eventId === "after_school_practice") {
        if (ns.step !== "INTRO") return state;
        if (!state.setup) return state;

        const nodeId = String(ns.nodeId ?? "");
        const dmgExtra = 10;
        const goldLoss = 30;
        const goldGain = 50;

        const cur = (state.currentSupplyIds ?? []).slice();
        const extraSwingId = "sup_multi_attack_plus";

        if (action.choiceId === "extra_reps") {
          if (cur.includes(extraSwingId)) return state;

          const before0 = Number(state.hp);
          const before = Number.isFinite(before0) ? Math.max(0, Math.floor(before0)) : 0;
          const taken = Math.min(before, dmgExtra);
          const hpNext = before - taken;

          const next = maybeEnterDefeat({
            ...state,
            hp: hpNext,
          } as any);

          // If the hit drops you to 0, go straight to defeat.
          if ((next as any).screen === "DEFEAT") return next as any;

          // Require confirming the supply reward (consistent with newer events).
          return {
            ...(next as any),
            nodeScreen: {
              ...ns,
              step: "SUPPLY_PICK",
              pendingSupplyIds: [extraSwingId],
              pendingRewardText:
                `Coach points at you and the whistle shrieks. “AGAIN.”\n\nYou give everything you’ve got—then a little more.${taken > 0 ? `\n\nTake ${taken} damage.` : ""}`,
            } as any,
          } as any;
        }

        if (action.choiceId === "defensive_strategy") {
          const gold0 = Number(state.gold);
          const gold = Number.isFinite(gold0) ? Math.max(0, Math.floor(gold0)) : 0;
          const paid = Math.min(gold, goldLoss);

          // Require confirming the card reward (consistent with newer events).
          return {
            ...state,
            gold: gold - paid,
            nodeScreen: {
              ...ns,
              step: "CARD_PICK",
              pendingCardId: "blk_dig_in",
              pendingRewardText: `💠 Gain Dig In.${paid > 0 ? `\n\nLose ${paid} gold.` : ""}`,
              pendingCardResultText:
                `You slow down, watch the patterns, and start calling out coverages.

💠 Gained Dig In.${paid > 0 ? `\n\nLose ${paid} gold.` : ""}`,
            } as any,
          };
        }

        if (action.choiceId === "skip") {
          const gold0 = Number(state.gold);
          const gold = Number.isFinite(gold0) ? Math.max(0, Math.floor(gold0)) : 0;

          // Require confirming the negative card reward.
          return {
            ...state,
            gold: gold + goldGain,
            nodeScreen: {
              ...ns,
              step: "CARD_PICK",
              pendingCardId: "neg_curse",
              pendingRewardText: `Gain ${goldGain} gold.\n\n🧟 Add Curse (permanent).`,
              pendingCardResultText:
                `You vanish into the hallway and somehow “find” a forgotten roll of lunch money.

Gain ${goldGain} gold.

But the guilt sticks to you like sweat.

🧟 Added Curse (permanent).`,
            } as any,
          };
        }

        if (action.choiceId === "leave") {
          const depth = Number((state.map?.nodes?.[nodeId] as any)?.depth ?? ns.depth ?? 1);
          const difficulty = depth <= 4 ? 1 : depth <= 9 ? 2 : 3;
          const qSeed = (state.seed ^ hashStringToInt(`event:gate:practice:${nodeId}`)) >>> 0;
          const qRng = makeRng((qSeed ^ 0xC0FFEE) >>> 0);
          const question = getQuestion({ rng: qRng, difficulty });

          return {
            ...state,
            nodeScreen: {
              ...ns,
              step: "QUESTION_GATE",
              gate: {
                question,
                promptText:
                  "Coach’s shadow stretches across the doorway. “Leaving already?”\n\nTheir whistle clicks once. The lights flicker. The only way out is to prove you belong here.",
                onCorrectText:
                  "✅ You answer calmly. Coach blinks, the smile fades, and the doorway is suddenly just… a doorway.\n\nYou slip out.",
                onWrongText:
                  "❌ Coach’s grin returns. The whistle shrieks and your lungs burn as you’re forced through one last sprint.",
                wrongDamage: 5,
              },
            },
          };
        }

        return state;
      }

      if (ns.eventId === "weight_room") {
        if (ns.step !== "INTRO") return state;
        if (!state.setup) return state;

        const nodeId = String(ns.nodeId ?? "");
        const beltId = "sup_strength_to_block";
        const cost = 75;

        const cur = (state.currentSupplyIds ?? []).slice();

        if (action.choiceId === "belt_up") {
          const gold0 = Math.max(0, Math.floor(Number(state.gold ?? 0)));
          if (gold0 < cost || cur.includes(beltId)) return state;

          // Require confirming the supply reward.
          return {
            ...state,
            gold: gold0 - cost,
            nodeScreen: {
              ...ns,
              step: "SUPPLY_PICK",
              pendingSupplyIds: [beltId],
              pendingRewardText:
                "You buckle the belt tight. The room feels heavier… but so do you.\n\nLose 75 gold.",
            } as any,
          } as any;
        }

        if (action.choiceId === "sparring_partner") {
          const dmg = 20;
          const before0 = Number(state.hp);
          const before = Number.isFinite(before0) ? Math.max(0, Math.floor(before0)) : 0;
          const taken = Math.min(before, dmg);
          const hpNext = before - taken;

          const next = maybeEnterDefeat({
            ...state,
            hp: hpNext,
          });

          // If the hit drops you to 0, go straight to defeat.
          if ((next as any).screen === "DEFEAT") return next as any;

          return {
            ...next,
            nodeScreen: {
              ...ns,
              step: "CARD_PICK",
              pendingCardId: "atk_shield_conversion",
              pendingRewardText: `⚔️ Gain Shield Conversion.${taken > 0 ? `\n\nTake ${taken} damage.` : ""}`,
              pendingCardResultText:
                `You square up. A “friendly” jab lands like a textbook.

⚔️ Gained Shield Conversion.${taken > 0 ? `\n\nTake ${taken} damage.` : ""}`,
            } as any,
          } as any;
        }

        if (action.choiceId === "punching_bag") {
          const dmg = 20;
          const before0 = Number(state.hp);
          const before = Number.isFinite(before0) ? Math.max(0, Math.floor(before0)) : 0;
          const taken = Math.min(before, dmg);
          const hpNext = before - taken;

          const next = maybeEnterDefeat({
            ...state,
            hp: hpNext,
          });

          if ((next as any).screen === "DEFEAT") return next as any;

          return {
            ...next,
            nodeScreen: {
              ...ns,
              step: "CARD_PICK",
              pendingCardId: "atk_unload",
              pendingRewardText: `⚔️ Gain Unload.${taken > 0 ? `\n\nTake ${taken} damage.` : ""}`,
              pendingCardResultText:
                `You unload on the bag until your hands go numb.

⚔️ Gained Unload.${taken > 0 ? `\n\nTake ${taken} damage.` : ""}`,
            } as any,
          } as any;
        }

        if (action.choiceId === "leave") {
          const depth = Number((state.map?.nodes?.[nodeId] as any)?.depth ?? ns.depth ?? 1);
          const difficulty = depth <= 4 ? 1 : depth <= 9 ? 2 : 3;
          const qSeed = (state.seed ^ hashStringToInt(`event:gate:weight:${nodeId}`)) >>> 0;
          const qRng = makeRng((qSeed ^ 0xC0FFEE) >>> 0);
          const question = getQuestion({ rng: qRng, difficulty });

          return {
            ...state,
            nodeScreen: {
              ...ns,
              step: "QUESTION_GATE",
              gate: {
                question,
                promptText:
                  "As you back toward the door, the plates stop clanging. Everyone turns in unison.\n\nA chalky hand points to a whiteboard: **SOLVE TO LEAVE.**",
                onCorrectText:
                  "✅ You scribble the answer. The room exhales. The noise returns like nothing happened.\n\nYou leave.",
                onWrongText:
                  "❌ The room goes silent again. A barbell rolls across the floor and clips your ankle as you stumble away.",
                wrongDamage: 5,
              },
            },
          };
        }

        return state;
      }



      // ----------------
      // Poison Extraction
      // ----------------
      if (ns.eventId === "poison_extraction") {
        const nodeId = String(ns.nodeId ?? "");

        if (ns.step !== "INTRO") return state;

        const supplyIdsNow = (state.currentSupplyIds ?? []).slice();
        const setupSupplyIds = (state.setup as any)?.supplyIds ? (state.setup as any).supplyIds.slice() : [];
        const legacySupplyId = (state.setup as any)?.supplyId ?? null;

        if (action.choiceId === "extract_antidote") {
          const dmg = 12;
          const before0 = Number(state.hp);
          const before = Number.isFinite(before0) ? Math.max(0, Math.floor(before0)) : 0;
          const taken = Math.min(before, dmg);
          const hpNext = before - taken;

          // Deal the damage immediately, then let the player confirm the card addition.
          return maybeEnterDefeat({
            ...state,
            hp: hpNext,
            nodeScreen: {
              ...ns,
              step: "CARD_PICK",
              pendingRewardText:
                `You clamp the clear vial into the spinner and set the dial with shaking fingers.

The machine whirs. The clean solution separates… and you bottle it like it’s the last good thing left in this room.

🧪 Gain Detox Extract.${taken > 0 ? `

The fumes burn your throat. Take ${taken} damage.` : ""}`,
              pendingCardId: "skl_detox_extract",
              pendingCardResultText:
                `You bottle the clean solution and label it carefully.

🧪 Gained Detox Extract.${taken > 0 ? `

The fumes burn your throat. Take ${taken} damage.` : ""}`,
            } as any,
          });
        }

        if (action.choiceId === "extract_poison") {
          const sid = "sup_negative_draw_burst";
          if (supplyIdsNow.includes(sid)) {
            return {
              ...state,
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText:
                  "You reach for the dark vial… then realize you already have something just like it tucked away.\n\nYou decide not to double-dip."
              },
            };
          }

          // Let the player confirm claiming the supply (consistent with other event rewards).
          return {
            ...state,
            nodeScreen: {
              ...ns,
              step: "SUPPLY_PICK",
              pendingSupplyIds: [sid],
              pendingRewardText:
                "You uncap the ink-dark vial and the room seems to lean in.\n\nYou seal it fast—your fingers tingling as if they learned a new reflex.\n\nClaim Red Pen.",
            } as any,
          };
        }

        if (action.choiceId === "leave") {
          const depth = Number((state.map?.nodes?.[nodeId] as any)?.depth ?? ns.depth ?? 1);
          const difficulty = depth <= 4 ? 1 : depth <= 9 ? 2 : 3;
          const qSeed = (state.seed ^ hashStringToInt(`event:gate:poison:${nodeId}`)) >>> 0;
          const qRng = makeRng((qSeed ^ 0xC0FFEE) >>> 0);
          const question = getQuestion({ rng: qRng, difficulty });

          return {
            ...state,
            nodeScreen: {
              ...ns,
              step: "QUESTION_GATE",
              gate: {
                question,
                promptText:
                  "The handle refuses to turn. A keypad beeps once, like it’s amused.\n\nA note slides from under the door: **SOLVE TO LEAVE.**",
                onCorrectText:
                  "✅ The lock clicks. For a moment, the lab feels… disappointed.\n\nYou step back into the hallway.",
                onWrongText:
                  "❌ The keypad shrieks. The centrifuge spikes in pitch and the air stings your lungs as you cough.",
                wrongDamage: 5,
              },
            },
          };
        }

        return state;
      }

      // ----------------
      // Attendance Office
      // ----------------
      if (ns.eventId === "attendance_office") {
        if (ns.step !== "INTRO") return state;

        const goldNow0 = Number(state.gold ?? 0);
        const goldNow = Number.isFinite(goldNow0) ? Math.max(0, Math.floor(goldNow0)) : 0;
        const inv = (state.consumables ?? []).slice();
        const slots = Math.max(0, 3 - inv.length);

        const supplyIdsNow = (state.currentSupplyIds ?? []).slice();
        const setupSupplyIds = (state.setup as any)?.supplyIds ? (state.setup as any).supplyIds.slice() : [];
        const legacySupplyId = (state.setup as any)?.supplyId ?? null;
        const hasPerfect = supplyIdsNow.includes("sup_no_negative_cards") || setupSupplyIds.includes("sup_no_negative_cards") || legacySupplyId === "sup_no_negative_cards";

        if (action.choiceId === "absence_note") {
          const cost = 60;
          if (goldNow < cost) return state;
          if (slots <= 0) return state;

          const nextGold = goldNow - cost;

          // Let the player claim/skip the consumable and come back before choosing the next node.
          return {
            ...state,
            gold: nextGold,
            nodeScreen: {
              ...ns,
              step: "CONSUMABLE_CLAIM",
              pendingRewardText:
                "You slide the payment across the counter. The attendant’s smile doesn’t change—only the stamp moves.\n\n**THUNK.**\n\n📝 Absence Note acquired.",
              pendingConsumableIds: ["con_absence_note"],
              claimedConsumableIds: [],
            } as any,
          };
        }

        if (action.choiceId === "apologize") {
          const healAmt = 15;
          const paid = Math.min(goldNow, 30);
          const hpNow0 = Number(state.hp);
          const hpNow = Number.isFinite(hpNow0) ? Math.max(0, Math.floor(hpNow0)) : 0;
          const hpNext = Math.min(state.maxHp, hpNow + healAmt);

          return {
            ...state,
            gold: goldNow - paid,
            hp: hpNext,
            nodeScreen: {
              ...ns,
              step: "RESULT",
              resultText:
                `You take a breath and tell the truth. The attendant nods… too slowly.

You feel lighter, like a weight slid off your shoulders.

💚 Healed ${Math.max(0, hpNext - hpNow)} HP.${paid > 0 ? `

Pay ${paid} gold.` : ""}`,
            },
          };
        }

        if (action.choiceId === "forge_signature") {
          const gain = 100;

          // Two permanent negatives (unless Perfect Record blocks them).
          const negPool = ["neg_curse", "neg_pop_quiz", "neg_infestation_perm", "neg_radiation_perm"];

          if (hasPerfect) {
            // Flash the supply and skip adding negatives.
            return {
              ...state,
              gold: goldNow + gain,
              supplyFlashNonce: Number((state as any).supplyFlashNonce ?? 0) + 1,
              supplyFlashIds: ["sup_no_negative_cards"],
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText:
                  "You forge the signature anyway. The pen scratches on its own, like it already knows your name.\n\nA drawer pops open and you snag a handful of coins.\n\nPerfect Record blocks the consequences.\n\n💰 Gained 100 gold.",
              },
            };
          }

          if (!state.setup) return state;

          const nodeId = String((ns as any).nodeId ?? "");
          const rSeed = (state.seed ^ hashStringToInt(`event:attendance:forge:${nodeId}`)) >>> 0;
          const rng = makeRng((rSeed ^ 0xBADA55) >>> 0);
          const picks = pickUnique(rng, negPool, 2);
          const [first, second] = picks;

          return {
            ...state,
            nodeScreen: {
              ...ns,
              step: "CARD_PICK",
              pendingGoldGain: gain,
              pendingCardId: first,
              pendingExtraCardIds: second ? [second] : undefined,
              pendingRewardText:
                `You steady your hand and copy a signature you’ve only seen once.

The pen feels warm. The stamp feels heavier than it should.

💰 Gain 100 gold.
🃏 Confirm 2 permanent negatives.`,
              pendingCardResultText:
                `You steady your hand and copy a signature you’ve only seen once.

The pen feels warm. The stamp feels heavier than it should.

💰 Gained 100 gold.
🃏 Added 2 permanent negatives.`,
            } as any,
          };
        }

        if (action.choiceId === "leave") {
          const dmg = 5;
          const before0 = Number(state.hp);
          const before = Number.isFinite(before0) ? Math.max(0, Math.floor(before0)) : 0;
          const taken = Math.min(before, dmg);
          const hpNext = before - taken;

          return maybeEnterDefeat({
            ...state,
            hp: hpNext,
            nodeScreen: {
              ...ns,
              step: "RESULT",
              resultText:
                `You turn to go and the office lights flicker—just once.

The air bites. Take ${taken} damage.`,
            },
          });
        }

        return state;
      }



      // ----------------
      // Pop-Up Vendor (Event Shop)
      // ----------------
      if (ns.eventId === "pop_up_vendor") {
        if (ns.step !== "INTRO") return state;
        const nodeId = String(ns.nodeId ?? "");

        // Prevent duplicate purchases if the player re-enters the node.
        const alreadyBought = !!(ns as any).vendorMysteryUsed;

        const goldNow0 = Number(state.gold ?? 0);
        const goldNow = Number.isFinite(goldNow0) ? Math.max(0, Math.floor(goldNow0)) : 0;

        if (action.choiceId === "browse_wares") {
          const supplyIds = state.currentSupplyIds ?? [];
          const shop = buildEventShopNodeState({
            runSeed: state.seed,
            nodeId,
            depth: ns.depth,
            supplyIds,
            title: "Pop-Up Vendor",
            flavorText:
              "A folding table of suspicious bargains. The vendor never blinks. Prices are written in fresh marker — like they’re decided *after* you look.",
          });

          (shop as any).subTitle = "Event Shop";
          return {
            ...state,
            nodeScreen: shop as any,
          };
        }

        if (action.choiceId === "mystery_bag") {
          if (alreadyBought) return state;
          const cost = 30;
          if (goldNow < cost) return state;

          const inv = (state.consumables ?? []).slice();
          if (inv.length >= 3) return state;

          const basePool = CONSUMABLES_10.filter((c: any) => !(c as any)?.eventOnly).map((c) => c.id);
          if (basePool.length === 0) return state;

          const rSeed = (state.seed ^ hashStringToInt(`event:vendor:mystery:${nodeId}`)) >>> 0;
          const rng = makeRng((rSeed ^ 0xFACEFEED) >>> 0);
          const picked = pickWeighted(rng, basePool, (id) => weightByRarity((CONSUMABLE_BY_ID.get(id) as any)?.rarity));
          if (!picked) return state;

          return {
            ...state,
            gold: goldNow - cost,
            nodeScreen: {
              ...ns,
              // Show the reward as a pick/claim flow (so the player can close and come back
              // before choosing their next node), then return to INTRO instead of ending the event.
              step: "CONSUMABLE_PICK",
              pendingConsumableIds: [picked],
              pendingRewardText:
                `You buy the mystery bag. It's warm. That’s… not ideal.\n\nChoose your mystery consumable:`,
              afterConsumablePickStep: "INTRO",
              vendorMysteryUsed: true,
            },
          };
        }

        if (action.choiceId === "leave") {
          return {
            ...state,
            nodeScreen: {
              ...ns,
              step: "RESULT",
              resultText:
                "You decide not to engage. The vendor keeps smiling as you walk away… and you swear the table is gone when you look back.",
            },
          };
        }

        return state;
      }

      // ----------------
      // Exam Week Ladder
      // ----------------
      if (ns.eventId === "exam_week_ladder") {
        const nodeId = String(ns.nodeId ?? "");

        const depth = Number((state.map?.nodes?.[nodeId] as any)?.depth ?? ns.depth ?? 1);
        const difficulty: 1 | 2 | 3 = depth <= 4 ? 1 : depth <= 9 ? 2 : 3;

        const makeExamQuestion = (rungIndex1: number): Question => {
          const qSeed = (state.seed ^ hashStringToInt(`event:exam_ladder:${nodeId}:r${rungIndex1}`)) >>> 0;
          const rng = makeRng((qSeed ^ 0xE6A7D3) >>> 0);
          return getQuestion({ rng, difficulty });
        };

        const endWithReward = (correctCount: number, headerText?: string): GameState => {
          const inv = (state.consumables ?? []).slice();
          const goldNow0 = Number(state.gold ?? 0);
          const goldNow = Number.isFinite(goldNow0) ? Math.max(0, Math.floor(goldNow0)) : 0;

          const prefix = headerText ? `${headerText}\n\n` : "";

          if (correctCount <= 0) {
            return {
              ...state,
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText:
                  `${prefix}The marker squeals and the ladder flips to **FAILED**.\n\nNo reward. (Ouch.)`,
                gate: undefined,
                examLadder: undefined,
              },
            } as any;
          }

          if (correctCount === 1) {
            return {
              ...state,
              gold: goldNow + 30,
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText:
                  `${prefix}You clear **Rung 1**. A small tray clicks open.\n\n💰 Gain 30 gold.`,
                gate: undefined,
                examLadder: undefined,
              },
            } as any;
          }

          if (correctCount === 2) {
            return {
              ...state,
              gold: goldNow + 60,
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText:
                  `${prefix}You clear **Rung 2**. The speaker crackles approvingly.\n\n💰 Gain 60 gold.`,
                gate: undefined,
                examLadder: undefined,
              },
            } as any;
          }

          if (correctCount === 3) {
            // Choose an event-only consumable.
            if (inv.length >= 3) {
              return {
                ...state,
                gold: goldNow + 60,
                nodeScreen: {
                  ...ns,
                  step: "RESULT",
                  resultText:
                    `${prefix}You reach **Rung 3**… but your bag is already stuffed.\n\nYour reward converts into 💰 60 gold instead.`,
                  gate: undefined,
                  examLadder: undefined,
                },
              } as any;
            }

            const pool = CONSUMABLES_10.filter((c: any) => !!(c as any)?.eventOnly).map((c) => c.id);
            const rSeed = (state.seed ^ hashStringToInt(`event:exam_ladder:${nodeId}:reward:c3`)) >>> 0;
            const rng = makeRng((rSeed ^ 0xC0A51A) >>> 0);
            const offer = pickUnique(rng, pool, 2);

            if (offer.length === 0) {
              return {
                ...state,
                gold: goldNow + 60,
                nodeScreen: {
                  ...ns,
                  step: "RESULT",
                  resultText:
                    `${prefix}You hit **Rung 3**, but the reward tray is empty.\n\n💰 Take 60 gold instead.`,
                  gate: undefined,
                  examLadder: undefined,
                },
              } as any;
            }

            return {
              ...state,
              nodeScreen: {
                ...ns,
                step: "CONSUMABLE_PICK",
                pendingConsumableIds: offer,
                pendingRewardText:
                  `${prefix}You clear **Rung 3**. A hidden compartment slides open.\n\nChoose **one** reward:`,
                gate: undefined,
                examLadder: undefined,
              },
            } as any;
          }

          if (correctCount === 4) {
            const pool = BASE_CARDS.filter((c: any) => !!(c as any)?.eventOnly).map((c) => c.id);
            const rSeed = (state.seed ^ hashStringToInt(`event:exam_ladder:${nodeId}:reward:c4`)) >>> 0;
            const rng = makeRng((rSeed ^ 0xC4A4D) >>> 0);
            const offer = pickUnique(rng, pool, 3);

            if (offer.length === 0) {
              return {
                ...state,
                gold: goldNow + 60,
                nodeScreen: {
                  ...ns,
                  step: "RESULT",
                  resultText:
                    `${prefix}You reach **Rung 4**, but there's no card left to claim.\n\n💰 Take 60 gold instead.`,
                  gate: undefined,
                  examLadder: undefined,
                },
              } as any;
            }

            return {
              ...state,
              nodeScreen: {
                ...ns,
                step: "CARD_PICK",
                pendingCardIds: offer,
                pendingCardResultText:
                  `${prefix}You clear **Rung 4**. A stamped card drops from a slot with a sharp *clack*.\n\nChoose **one** card:`,
                gate: undefined,
                examLadder: undefined,
              },
            } as any;
          }

          // correctCount >= 5
          {
            // Rung 5 reward is fixed: Perfect Record.
            const PERFECT_RECORD = "sup_no_negative_cards";
            const owned = new Set((state.currentSupplyIds ?? []).map(String));
            if (owned.has(PERFECT_RECORD)) {
              return {
                ...state,
                gold: goldNow + 100,
                nodeScreen: {
                  ...ns,
                  step: "RESULT",
                  resultText:
                    `${prefix}You conquer **Rung 5**. The proctor nods once.\n\nYou already have **Perfect Record**, so your reward converts into 💰 100 gold.`,
                  gate: undefined,
                  examLadder: undefined,
                },
              } as any;
            }

            return {
              ...state,
              nodeScreen: {
                ...ns,
                step: "SUPPLY_PICK",
                pendingSupplyIds: [PERFECT_RECORD],
                pendingRewardText:
                  `${prefix}You conquer **Rung 5**. A pristine folder slides out.\n\nClaim your reward:`,
                gate: undefined,
                examLadder: undefined,
              },
            } as any;
          }
        };

        // INTRO choices
        if (ns.step === "INTRO") {
          if (action.choiceId === "start") {
            const q1 = makeExamQuestion(1);
            return {
              ...state,
              nodeScreen: {
                ...ns,
                step: "QUESTION_GATE",
                examLadder: {
                  correct: 0,
                  rung: 1,
                  difficulty,
                },
                gate: {
                  question: q1,
                  promptText:
                    "Rung 1/5. Answer correctly to climb. One wrong answer ends the ladder and locks in your reward.",
                },
              },
            } as any;
          }

          if (action.choiceId === "leave") {
            return {
              ...state,
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText:
                  "You decide not to tempt fate. The laminated ladder stays perfectly still as you walk away.",
              },
            } as any;
          }

          return state;
        }

        // FEEDBACK -> next rung OR cash out
        if (ns.step === "EXAM_LADDER_FEEDBACK") {
          const ladder: any = (ns as any).examLadder ?? null;
          const correctSoFar = Number(ladder?.correct ?? 0);

          if (action.choiceId === "ladder_cashout") {
            return endWithReward(correctSoFar, "🛑 You decide to cash out.");
          }

          if (action.choiceId !== "ladder_continue") return state;
          const nextQ: any = ladder?.nextQuestion ?? null;
          const nextRung: number = Number(ladder?.nextRung ?? (ladder?.correct ?? 0) + 1);
          if (!nextQ) return state;

          return {
            ...state,
            nodeScreen: {
              ...ns,
              step: "QUESTION_GATE",
              gate: {
                question: nextQ,
                promptText:
                  `Rung ${nextRung}/5. Answer correctly to climb. One wrong answer ends the ladder and locks in your reward.`,
              },
              examLadder: {
                ...(ladder ?? {}),
                rung: nextRung,
                nextQuestion: undefined,
                nextRung: undefined,
              },
            },
          } as any;
        }

        return state;
      }

// Fallback: unconfigured event
      return {
        ...state,
        nodeScreen: { ...ns, step: "RESULT", resultText: "Nothing happens... (unconfigured event)" },
      };
	    }

    case "EVENT_HALLWAY_ANSWER": {
      if (state.screen !== "NODE" || !state.nodeScreen || state.nodeScreen.type !== "EVENT") return state;
      const ns: any = state.nodeScreen as any;
      if (ns.eventId !== "hallway_shortcut" || ns.step !== "HALLWAY") return state;

      try {
        console.log("[EVENT hallway_shortcut] EVENT_HALLWAY_ANSWER", {
          answer: (action as any).answer,
          pending: (ns as any).hallwayPending,
          gold: state.gold,
          hp: state.hp,
        });
      } catch {}

      const lockers0: any[] = Array.isArray(ns.hallwayLockers) ? ns.hallwayLockers : [];
      const pending: any = ns.hallwayPending ?? null;
      const quiz: any = ns.hallwayQuiz ?? null;

      // If the UI gets into a weird state (eg. quiz cleared but Submit pressed),
      // clear the pending selection so the player isn't soft-locked.
      if (!pending) return state;
      if (!quiz || quiz.pendingIndex !== pending.index) {
        // baseState isn't initialized yet in this branch (and we haven't modified state),
        // so just return a cleaned-up copy of state.
        return { ...state,
          nodeScreen: {
            ...ns,
            step: "HALLWAY",
            hallwayLockers: lockers0.slice(),
            hallwayPending: undefined,
            hallwayQuiz: undefined,
            hallwayLastText: "",
          },
        };
      }

      const locker0 = lockers0[pending.index];
      if (!locker0 || locker0.collected) return state;

      const given = Math.floor(Number(action.answer));
      const expected = Math.floor(Number(quiz.question?.answer ?? NaN));
      const correct = Number.isFinite(given) && Number.isFinite(expected) && given === expected;

      let baseState: GameState = state;
      if (!correct) {
        try {
          const nodeId = String(ns.nodeId ?? "");
          const depth0: any = (state.map as any)?.nodes?.[nodeId]?.depth ?? ns.depth ?? null;
          const depthN = Number(depth0);
          const depth = Number.isFinite(depthN) ? Math.max(1, Math.floor(depthN)) : null;
          const location = depth ? `Floor ${depth} • Hallway Shortcut` : `Hallway Shortcut`;
          const entry = {
            id: `wa:${Date.now()}:${Math.random().toString(16).slice(2)}`,
            atMs: Date.now(),
            source: "HALLWAY",
            location,
            prompt: String(quiz.question?.prompt ?? ""),
            expected: String(quiz.question?.answer ?? ""),
            given: String(action.answer ?? ""),
          } as any;
          baseState = appendWrongAnswerLog(baseState, entry);
        } catch {}
      }

      // Mark resolved and clear quiz/pending
      let lockers = updateArrayItem(lockers0, pending.index, (l: any) => ({ ...l, collected: true, negated: false }));
      const baseNext: any = {
        ...ns,
        step: "HALLWAY" as const,
        hallwayLockers: lockers,
        hallwayPending: undefined,
        hallwayQuiz: undefined,
        hallwayTally: ns.hallwayTally ?? {},
      };

      if (correct) {
        lockers = updateArrayItem(lockers0, pending.index, (l: any) => ({ ...l, collected: true, negated: true }));
        return { ...baseState,
          nodeScreen: {
            ...baseNext,
            hallwayLockers: lockers,
            hallwayLastText: "✅ Negated.",
          },
        };
      }

      // Wrong answer: apply the penalty
      if (pending.kind === "lose_gold") {
        const amt = Math.max(0, Math.floor(Number(pending.amount ?? 0)));
        const before0 = Number(state.gold);
        const before = Number.isFinite(before0) ? Math.max(0, Math.floor(before0)) : 0;
        const lost = Math.min(before, amt);
        return { ...baseState,
          gold: before - lost,
          nodeScreen: {
            ...baseNext,
            hallwayLastText: lost > 0 ? `❌ Incorrect. A hand shoots out and snatches coins. (-${lost} gold)` : "❌ Incorrect. A hand shoots out… but you have no coins to take.",
            hallwayTally: { ...(ns.hallwayTally ?? {}), goldLost: ((ns.hallwayTally?.goldLost ?? 0) + lost) },
          },
        };
      }

      if (pending.kind === "damage") {
        const amt = Math.max(0, Math.floor(Number(pending.amount ?? 0)));
        const before0 = Number(state.hp);
        const before = Number.isFinite(before0) ? Math.max(0, Math.floor(before0)) : 0;
        const taken = Math.min(before, amt);
        const hpNext = before - taken;
        return maybeEnterDefeat({ ...baseState,
          hp: hpNext,
          nodeScreen: {
            ...baseNext,
            hallwayLastText: `❌ Incorrect. A trap snaps shut on your arm. (Take ${taken} damage)`,
            hallwayTally: { ...(ns.hallwayTally ?? {}), damageTaken: ((ns.hallwayTally?.damageTaken ?? 0) + taken) },
          },
        });
      }

      return { ...baseState, nodeScreen: baseNext };
    }


    case "EVENT_GATE_ANSWER": {
      if (state.screen !== "NODE" || !state.nodeScreen || state.nodeScreen.type !== "EVENT") return state;
      const ns: any = state.nodeScreen as any;
      if (ns.step !== "QUESTION_GATE") return state;
      const gate: any = ns.gate ?? null;
      const q: any = gate?.question ?? null;
      if (!gate || !q) {
        // Fail safe: allow the player to leave.
        return {
          ...state,
          nodeScreen: {
            ...ns,
            step: "RESULT",
            resultText: "You slip away, confused but unharmed.",
            gate: undefined,
          },
        };
      }

      const given = Math.floor(Number(action.answer));
      const expected = Math.floor(Number(q.answer ?? NaN));
      const correct = Number.isFinite(given) && Number.isFinite(expected) && given === expected;


      let baseState: GameState = state;
      if (!correct) {
        try {
          const nodeId = String(ns.nodeId ?? "");
          const depth0: any = (state.map as any)?.nodes?.[nodeId]?.depth ?? ns.depth ?? null;
          const depthN = Number(depth0);
          const depth = Number.isFinite(depthN) ? Math.max(1, Math.floor(depthN)) : null;
          const ev: any = (EVENTS as any).find((e: any) => String(e.id) === String(ns.eventId)) ?? null;
          const title = String(ev?.title ?? ns.eventId ?? "Event");
          const location = depth ? `Floor ${depth} • ${title} • Question Gate` : `${title} • Question Gate`;
          const entry = {
            id: `wa:${Date.now()}:${Math.random().toString(16).slice(2)}`,
            atMs: Date.now(),
            source: "EVENT",
            location,
            prompt: String(q?.prompt ?? ""),
            expected: String(q?.answer ?? ""),
            given: String(action.answer ?? ""),
          } as any;
          baseState = appendWrongAnswerLog(baseState, entry);
        } catch {}
      }

      // Special-case: Exam Week Ladder chains multiple questions and awards a single reward.
      if (String(ns.eventId ?? "") === "exam_week_ladder") {
        const nodeId = String(ns.nodeId ?? "");
        const ladder: any = ns.examLadder ?? { correct: 0, rung: 1, difficulty: (ns.depth ?? 1) <= 4 ? 1 : (ns.depth ?? 1) <= 9 ? 2 : 3 };
        const correctSoFar = Math.max(0, Math.floor(Number(ladder.correct ?? 0)));
        const depth = Number((state.map?.nodes?.[nodeId] as any)?.depth ?? ns.depth ?? 1);
        const difficulty: 1 | 2 | 3 = (ladder.difficulty ?? (depth <= 4 ? 1 : depth <= 9 ? 2 : 3)) as any;

        const makeExamQuestion = (rungIndex1: number): Question => {
          const qSeed = (state.seed ^ hashStringToInt(`event:exam_ladder:${nodeId}:r${rungIndex1}`)) >>> 0;
          const rng = makeRng((qSeed ^ 0xE6A7D3) >>> 0);
          return getQuestion({ rng, difficulty });
        };

        const endWithReward = (count: number, headerText: string): GameState => {
          const inv = (state.consumables ?? []).slice();
          const goldNow0 = Number(state.gold ?? 0);
          const goldNow = Number.isFinite(goldNow0) ? Math.max(0, Math.floor(goldNow0)) : 0;

          if (count <= 0) {
            return { ...baseState,
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText: `${headerText}\n\nNo reward.`,
                gate: undefined,
                examLadder: undefined,
              },
            } as any;
          }

          if (count === 1) {
            return { ...baseState,
              gold: goldNow + 30,
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText: `${headerText}\n\n💰 Gain 30 gold.`,
                gate: undefined,
                examLadder: undefined,
              },
            } as any;
          }

          if (count === 2) {
            return { ...baseState,
              gold: goldNow + 60,
              nodeScreen: {
                ...ns,
                step: "RESULT",
                resultText: `${headerText}\n\n💰 Gain 60 gold.`,
                gate: undefined,
                examLadder: undefined,
              },
            } as any;
          }

          if (count === 3) {
            if (inv.length >= 3) {
              return { ...baseState,
                gold: goldNow + 60,
                nodeScreen: {
                  ...ns,
                  step: "RESULT",
                  resultText: `${headerText}\n\nYour consumable slots are full, so the reward converts into 💰 60 gold instead.`,
                  gate: undefined,
                  examLadder: undefined,
                },
              } as any;
            }
            const pool = CONSUMABLES_10.filter((c: any) => !!(c as any)?.eventOnly).map((c) => c.id);
            const rSeed = (state.seed ^ hashStringToInt(`event:exam_ladder:${nodeId}:reward:c3`)) >>> 0;
            const rng = makeRng((rSeed ^ 0xC0A51A) >>> 0);
            const offer = pickUnique(rng, pool, 2);
            return { ...baseState,
              nodeScreen: {
                ...ns,
                step: offer.length > 0 ? "CONSUMABLE_PICK" : "RESULT",
                pendingConsumableIds: offer.length > 0 ? offer : undefined,
                pendingRewardText: offer.length > 0 ? headerText + "\n\nChoose **one** consumable:" : undefined,
                resultText: offer.length === 0 ? `${headerText}\n\nThe reward tray is empty. 💰 Take 60 gold instead.` : undefined,
                gate: undefined,
                examLadder: undefined,
              },
              gold: offer.length === 0 ? goldNow + 60 : goldNow,
            } as any;
          }

          if (count === 4) {
            const pool = BASE_CARDS.filter((c: any) => !!(c as any)?.eventOnly).map((c) => c.id);
            const rSeed = (state.seed ^ hashStringToInt(`event:exam_ladder:${nodeId}:reward:c4`)) >>> 0;
            const rng = makeRng((rSeed ^ 0xC4A4D) >>> 0);
            const offer = pickUnique(rng, pool, 3);
            if (offer.length === 0) {
              return { ...baseState,
                gold: goldNow + 60,
                nodeScreen: {
                  ...ns,
                  step: "RESULT",
                  resultText: `${headerText}\n\nNo card left to claim. 💰 Take 60 gold instead.`,
                  gate: undefined,
                  examLadder: undefined,
                },
              } as any;
            }
            return { ...baseState,
              nodeScreen: {
                ...ns,
                step: "CARD_PICK",
                pendingCardIds: offer,
                pendingCardResultText: headerText + "\n\nChoose **one** card:",
                gate: undefined,
                examLadder: undefined,
              },
            } as any;
          }

          // count >= 5
          {
            // Rung 5 reward is fixed: Perfect Record.
            const PERFECT_RECORD = "sup_no_negative_cards";
            const owned = new Set((state.currentSupplyIds ?? []).map(String));
            if (owned.has(PERFECT_RECORD)) {
              return { ...baseState,
                gold: goldNow + 100,
                nodeScreen: {
                  ...ns,
                  step: "RESULT",
                  resultText: `${headerText}\n\nYou already have **Perfect Record**, so your reward converts into 💰 100 gold.`,
                  gate: undefined,
                  examLadder: undefined,
                },
              } as any;
            }
            return { ...baseState,
              nodeScreen: {
                ...ns,
                step: "SUPPLY_PICK",
                pendingSupplyIds: [PERFECT_RECORD],
                pendingRewardText: headerText + "\n\nClaim your reward:",
                gate: undefined,
                examLadder: undefined,
              },
            } as any;
          }
        };

        if (correct) {
          const newCorrect = correctSoFar + 1;
          if (newCorrect >= 5) {
            return endWithReward(5, "✅ Correct. You climb the final rung.");
          }
          const nextRung = newCorrect + 1;
          const nextQ = makeExamQuestion(nextRung);
          return { ...baseState,
            nodeScreen: {
              ...ns,
              step: "EXAM_LADDER_FEEDBACK",
              resultText:
                `✅ Correct! The ladder ticks upward.\n\nYou are now on **Rung ${newCorrect}/5**.`,
              gate: undefined,
              examLadder: {
                ...ladder,
                correct: newCorrect,
                nextQuestion: nextQ,
                nextRung,
                difficulty,
              },
            },
          } as any;
        }

        return endWithReward(correctSoFar, "❌ Incorrect. The proctor’s speaker crackles: ‘Time.’");
      }

      if (correct) {
        return { ...baseState,
          nodeScreen: {
            ...ns,
            step: "RESULT",
            resultText: String(gate.onCorrectText ?? "✅ Correct."),
            gate: undefined,
          },
        };
      }

      const dmg = Math.max(0, Math.floor(Number(gate.wrongDamage ?? 0)));
      const before0 = Number(state.hp);
      const before = Number.isFinite(before0) ? Math.max(0, Math.floor(before0)) : 0;
      const taken = Math.min(before, dmg);
      const hpNext = before - taken;

      return maybeEnterDefeat({ ...baseState,
        hp: hpNext,
        nodeScreen: {
          ...ns,
          step: "RESULT",
          resultText: `${String(gate.onWrongText ?? "❌ Incorrect.")}${taken > 0 ? `

Take ${taken} damage.` : ""}`,
          gate: undefined,
        },
      });
    }
    case "EVENT_PICK_UPGRADE": {
      if (state.screen !== "NODE" || !state.nodeScreen || state.nodeScreen.type !== "EVENT") return state;
      const ns = state.nodeScreen;
      if (ns.step !== "UPGRADE_PICK") return state;
      if (!state.setup) return state;
      const deck = (state.setup.deckCardIds ?? []).slice();
      const idx = deck.indexOf(action.cardId);
      if (idx < 0) return state;
      const upgraded = upgradeCardId(deck[idx]);
      if (upgraded === deck[idx]) return state;
      deck[idx] = upgraded;
      return {
        ...state,
        setup: { ...state.setup, deckCardIds: deck },
        nodeScreen: {
          ...ns,
          step: "RESULT",
          resultText: `${ns.pendingUpgradeText ?? ""}\n\nYou feel your deck shift.\nUpgraded a card.`,
          pendingUpgradeText: undefined,
        },
      };
    }


    case "EVENT_PICK_CARD": {
      if (state.screen !== "NODE" || !state.nodeScreen || state.nodeScreen.type !== "EVENT") return state;
      const ns = state.nodeScreen;
      if (ns.step !== "CARD_PICK") return state;
      if (!state.setup) return state;
      const cardId = action.cardId;
      const hasPerfectRecord = stateHasSupply(state, PERFECT_RECORD_SUPPLY_ID);
      const blockedByPerfectRecord = hasPerfectRecord && isNegativeCardId(cardId);

      const cardDef: any =
        NEGATIVE_CARD_BY_ID.get(cardId) ?? BASE_CARD_BY_ID.get(cardId) ?? UPGRADED_CARD_BY_ID.get(cardId) ?? null;
      const cardName = String(cardDef?.name ?? cardId);
      // Only allow the offered cards to be added.
      const offered: string[] = Array.isArray((ns as any).pendingCardIds) && (ns as any).pendingCardIds.length > 0
        ? (ns as any).pendingCardIds
        : ((ns as any).pendingCardId ? [(ns as any).pendingCardId] : []);
      if (offered.length > 0 && !offered.includes(cardId)) return state;

      const goldGain0 = Number((ns as any).pendingGoldGain ?? 0);
      const goldGain = Number.isFinite(goldGain0) ? Math.max(0, Math.floor(goldGain0)) : 0;
      const gold0 = Number(state.gold);
      const gold = Number.isFinite(gold0) ? Math.max(0, Math.floor(gold0)) : 0;
      const goldNext = gold + goldGain;

      const extraQueue: string[] = Array.isArray((ns as any).pendingExtraCardIds)
        ? (ns as any).pendingExtraCardIds
        : [];

      // Add the chosen card now. Any queued extras are confirmed one-at-a-time via follow-up CARD_PICK steps.
      const deckBase = (state.setup.deckCardIds ?? []).slice();
      const nextDeckBase = blockedByPerfectRecord ? deckBase : [...deckBase, cardId];

      const baseText = String((ns as any).pendingCardResultText ?? (ns as any).resultText ?? "");
      const blockedText = baseText
        ? `${baseText}\n\n🛡️ Perfect Record prevented ${cardName} from being added to your deck.`
        : `🛡️ Perfect Record prevented ${cardName} from being added to your deck.`;

      const supplyFlashNonce = blockedByPerfectRecord ? (Number((state as any).supplyFlashNonce ?? 0) + 1) : (state as any).supplyFlashNonce;
      const supplyFlashIds = blockedByPerfectRecord ? [PERFECT_RECORD_SUPPLY_ID] : (state as any).supplyFlashIds;

      if (extraQueue.length > 0) {
        const [nextCardId, ...rest] = extraQueue;
        return {
          ...state,
          supplyFlashNonce,
          supplyFlashIds,
          gold: goldNext,
          setup: { ...state.setup, deckCardIds: nextDeckBase },
          nodeScreen: {
            ...ns,
            step: "CARD_PICK",
            pendingCardId: nextCardId,
            pendingCardIds: undefined,
            pendingGoldGain: undefined,
            pendingExtraCardIds: rest.length ? rest : undefined,
            pendingCardResultText: blockedByPerfectRecord ? blockedText : (ns as any).pendingCardResultText,
            pendingRewardText: blockedByPerfectRecord
              ? `${blockedText}\n\nAnother card is waiting—confirm it.`
              : "Another card is waiting—confirm it.",
          } as any,
        };
      }

      return {
        ...state,
        supplyFlashNonce,
        supplyFlashIds,
        gold: goldNext,
        setup: { ...state.setup, deckCardIds: nextDeckBase },
        nodeScreen: {
          ...ns,
          step: "RESULT",
          resultText: blockedByPerfectRecord ? blockedText : (ns.pendingCardResultText ?? `Gained ${cardName}.`),
          pendingCardId: undefined,
          pendingCardIds: undefined,
          pendingCardResultText: undefined,
          pendingRewardText: undefined,
          pendingGoldGain: undefined,
          pendingExtraCardIds: undefined,
        },
      };
    }

    case "EVENT_PICK_CONSUMABLE": {
      if (state.screen !== "NODE" || !state.nodeScreen || state.nodeScreen.type !== "EVENT") return state;
      const ns: any = state.nodeScreen as any;
      const step = String(ns.step ?? "");
      if (step !== "CONSUMABLE_PICK" && step !== "CONSUMABLE_CLAIM") return state;
      const offered: string[] = Array.isArray(ns.pendingConsumableIds) ? ns.pendingConsumableIds : [];
      const id = String(action.consumableId ?? "");
      if (offered.length > 0 && !offered.includes(id)) return state;

      const inv = (state.consumables ?? []).slice();
      if (inv.length >= 3) return state;

      const nextInv = [...inv, id];

      // Classic "choose one" flow.
      if (step === "CONSUMABLE_PICK") {
        const afterStep = String((ns as any).afterConsumablePickStep ?? "");
        if (afterStep) {
          // Some events want the player to continue the event after claiming (e.g., Pop-Up Vendor).
          return {
            ...state,
            consumables: nextInv,
            nodeScreen: {
              ...ns,
              step: afterStep,
              pendingConsumableIds: undefined,
              pendingRewardText: undefined,
              afterConsumablePickStep: undefined,
            },
          };
        }
        return {
          ...state,
          consumables: nextInv,
          nodeScreen: {
            ...ns,
            step: "RESULT",
            resultText:
              String(ns.pendingRewardText ?? "You claim your reward.") +
              `\n\n🎒 Gained **${String((CONSUMABLE_BY_ID.get(id) as any)?.name ?? id)}**.`,
            pendingConsumableIds: undefined,
            pendingRewardText: undefined,
          },
        };
      }

      // Multi-claim flow (claim any/all offered before continuing).
      const remaining = offered.filter((x) => x !== id);
      const claimed: string[] = Array.isArray(ns.claimedConsumableIds) ? ns.claimedConsumableIds : [];
      const nextClaimed = [...claimed, id];

      if (remaining.length <= 0) {
        const gainedNames = nextClaimed
          .map((cid) => (CONSUMABLE_BY_ID.get(cid) as any)?.name ?? cid)
          .join(", ");
        return {
          ...state,
          consumables: nextInv,
          nodeScreen: {
            ...ns,
            step: "RESULT",
            resultText:
              String(ns.pendingRewardText ?? "You collect what you can.") +
              `\n\n🎒 Gained: ${gainedNames || "(none)"}.`,
            pendingConsumableIds: undefined,
            claimedConsumableIds: undefined,
            pendingRewardText: undefined,
          },
        };
      }

      return {
        ...state,
        consumables: nextInv,
        nodeScreen: {
          ...ns,
          step: "CONSUMABLE_CLAIM",
          pendingConsumableIds: remaining,
          claimedConsumableIds: nextClaimed,
        },
      };
    }

    case "EVENT_PICK_SUPPLY": {
      if (state.screen !== "NODE" || !state.nodeScreen || state.nodeScreen.type !== "EVENT") return state;
      const ns: any = state.nodeScreen as any;
      if (ns.step !== "SUPPLY_PICK") return state;
      const offered: string[] = Array.isArray(ns.pendingSupplyIds) ? ns.pendingSupplyIds : [];
      const id = String(action.supplyId ?? "");
      if (offered.length > 0 && !offered.includes(id)) return state;

      const have = new Set((state.currentSupplyIds ?? []).map(String));
      if (have.has(id)) return state;

      let next: GameState = {
        ...state,
        currentSupplyIds: [...(state.currentSupplyIds ?? []), id],
      } as any;
      next = applySupplyOnGain(next, id);
      next = {
        ...next,
        setup: next.setup
          ? ({
              ...(next.setup as any),
              supplyId: id,
              supplyIds: Array.from(new Set([...(next.setup as any).supplyIds ?? [], id])),
            } as any)
          : next.setup,
      } as any;

      return {
        ...next,
        nodeScreen: {
          ...ns,
          step: "RESULT",
          resultText: String(ns.pendingRewardText ?? "You claim your reward.") + `\n\n✨ Gained **${String((SUPPLY_BY_ID.get(id) as any)?.name ?? id)}**.`,
          pendingSupplyIds: undefined,
          pendingRewardText: undefined,
        },
      };
    }
    case "SET_CURRENT_NODE": {
      const movingAwayFromReward = !!state.reward && !!state.rewardNodeId && action.nodeId !== state.rewardNodeId;
      const nextLockedNodeIds = movingAwayFromReward && state.rewardNodeId
        ? Array.from(new Set([...(state.lockedNodeIds ?? []), state.rewardNodeId]))
        : (state.lockedNodeIds ?? []);

      const curNodeId = state.currentNodeId;
      const cacheAdd = curNodeId && state.nodeScreen ? { [curNodeId]: state.nodeScreen } : null;
      const nodeScreenCache = {
        ...(state.nodeScreenCache ?? {}),
        ...(cacheAdd ?? {}),
      };
      return {
        ...state,
        nodeScreenCache,
        currentNodeId: action.nodeId,
        screen: "OVERWORLD",
        nodeScreen: undefined,
        battle: undefined,
        lockedNodeIds: nextLockedNodeIds,
        reward: movingAwayFromReward ? null : state.reward,
        rewardNodeId: movingAwayFromReward ? null : state.rewardNodeId,
      };
    }

    case "START_BATTLE": {
      const nodeId = action.nodeId;
      const movingAwayFromReward = !!state.reward && !!state.rewardNodeId && nodeId !== state.rewardNodeId;

      // If this node has already been completed/locked, don't allow restarting the battle.
      if ((state.lockedNodeIds ?? []).includes(nodeId)) return state;

      const deckCardIds =
        Array.isArray(action.deckCardIds) && action.deckCardIds.length > 0
          ? action.deckCardIds
          : (state.setup?.deckCardIds ?? []);

      // Deterministic RNG per node (stable for a given run seed + nodeId)
      const nodeSeed = (state.seed ^ hashStringToInt(nodeId)) >>> 0;
      const rng = makeRng(nodeSeed);

      const difficulty = action.difficulty;
      const isBoss = action.isBoss;
      const isChallenge = !!(action as any).isChallenge;

      const depth = state.map?.nodes?.[nodeId]?.depth ?? 1;

      // Avoid repeating encounters until the pool is exhausted, then allow repeats.
      // This applies to both standard and challenge pools.
      const usedAll = new Set(state.usedEncounterIds ?? []);

      const poolForThisBattle = (() => {
        if (isBoss) return [BOSS_ENCOUNTER];
        if (isChallenge) {
          return depth <= 4
            ? ENCOUNTER_POOL_CHALLENGE_EASY
            : depth <= 9
              ? ENCOUNTER_POOL_CHALLENGE_MED
              : ENCOUNTER_POOL_CHALLENGE_HARD;
        }
        return depth <= 4 ? ENCOUNTER_POOL_EASY_5 : depth <= 9 ? ENCOUNTER_POOL_MED_5 : ENCOUNTER_POOL_HARD_5;
      })();

      const poolIds = poolForThisBattle.map((e) => e.id);
      const poolIsExhausted = poolIds.length > 0 && poolIds.every((id) => usedAll.has(id));
      const used = poolIsExhausted
        ? new Set((state.usedEncounterIds ?? []).filter((id) => !poolIds.includes(id)))
        : new Set(state.usedEncounterIds ?? []);

      let encounter = pickEncounterForDepth(rng, depth, isBoss, isChallenge);
      if (!isBoss) {
        for (let i = 0; i < 12; i++) {
          if (!used.has(encounter.id)) break;
          encounter = pickEncounterForDepth(rng, depth, isBoss, isChallenge);
        }
      }
      const enemies = encounterToEnemyStates(encounter, rng);

      const setup = state.setup ?? null;

      const playerHpStart = state.hp;
      const playerMaxHp = state.maxHp;

      // SetupScreen guarantees these are set
      const playerName = setup?.playerName ?? "Player";
      const playerSprite =
        setup?.playerSprite ?? { kind: "emoji", value: "🧑‍🎓" };

      try {
        // Use currentSupplyIds from state (supports multiple supplies)
        const supplyIds = (state.currentSupplyIds ?? []).length > 0 
          ? (state.currentSupplyIds ?? [])
          : (setup?.supplyIds ?? (setup?.supplyId ? [setup.supplyId] : []));
        const legacySupplyId = supplyIds.length > 0 ? supplyIds[0] : null;

        let battle = startBattleCore({
          rng,
          difficulty,
          isBoss,
          playerHpStart,
          playerMaxHp,
          deckCardIds,
          enemies,
          playerName,
          playerSprite,
        });

        // Save run metadata onto the battle, so battle logic can access it (e.g., block reflect, challenge fights)
        battle = {
          ...battle,
          meta: {
            ...(battle as any).meta,
            supplyId: legacySupplyId,
            supplyIds,
            isChallenge,
            runGold: state.gold ?? 0,
          },
        };

        // Apply any start-of-battle supply bonuses (e.g., start with Strength)
        battle = applySuppliesToNewBattle(battle, supplyIds);

        // UI: flash the equipped supply when it activates
        const didStartStrength = supplyIds.includes("sup_start_strength");
        const supplyFlashNonce = didStartStrength ? (state.supplyFlashNonce ?? 0) + 1 : (state.supplyFlashNonce ?? 0);
        const supplyFlashIds = didStartStrength ? ["sup_start_strength"] : (state.supplyFlashIds ?? []);


        console.log("✅ START_BATTLE -> screen=BATTLE", {
          nodeId,
          isBoss,
          difficulty,
          deckLen: deckCardIds.length,
          nodeSeed,
        });

        const usedEncounterIds =
          !isBoss
            ? Array.from(new Set([...(Array.from(used) ?? []), encounter.id]))
            : (state.usedEncounterIds ?? []);

        return {
          ...state,
          usedEncounterIds,
          supplyFlashNonce,
          supplyFlashIds,
          currentNodeId: nodeId,
          screen: "BATTLE",
          battle,
          nodeScreen: undefined,
        };
      } catch (err) {
        console.error("❌ START_BATTLE failed:", err);
        return state;
      }
    }

    case "BATTLE_UPDATE": {
      let battle = action.battle;

      // UI: if a supply proc was reported by battle logic, flash ONLY the relevant supply badge(s) once,
      // then clear the proc marker.
      const procIds = (battle as any)?.meta?.procSupplyIds as string[] | undefined;
      const equippedSupplyIds = state.currentSupplyIds ?? [];

      let supplyFlashNonce = state.supplyFlashNonce ?? 0;
      let supplyFlashIds = state.supplyFlashIds ?? [];

      if (Array.isArray(procIds) && procIds.length > 0) {
        const hit = equippedSupplyIds.filter((id) => procIds.includes(id));
        if (hit.length > 0) {
          supplyFlashNonce += 1;
          // If Perfect Record procced, flash ONLY that supply (even if other proc markers were present).
          supplyFlashIds = hit.includes("sup_no_negative_cards") ? ["sup_no_negative_cards"] : hit;
        }

        battle = {
          ...battle,
          meta: {
            ...(battle as any).meta,
            procSupplyIds: [],
          },
        };
      }

      // Don't clear damage/heal events here - let them persist until UI processes them.
      // They'll be cleared in the next BATTLE_UPDATE after popups are spawned.

      let nextState: GameState = { ...state, supplyFlashNonce, supplyFlashIds, battle, hp: battle.playerHP };

      // Run-wide wrong answer logging (battle questions)
      try {
        const prevAwaiting: any = (state.battle as any)?.awaiting ?? null;
        const lastRes: any = (battle as any)?.lastResult ?? null;
        if (prevAwaiting && lastRes && lastRes.correct === false) {
          const cardId = String(prevAwaiting.cardId ?? "");
          const def: any = (BASE_CARD_BY_ID as any).get(cardId) ?? (UPGRADED_CARD_BY_ID as any).get(cardId) ?? null;
          const cardName = String(def?.name ?? cardId);
          const nodeId = String(state.currentNodeId ?? "");
          const depth0: any = (state.map as any)?.nodes?.[nodeId]?.depth ?? null;
          const depthN = Number(depth0);
          const depth = Number.isFinite(depthN) ? Math.max(1, Math.floor(depthN)) : null;
          const location = depth ? `Floor ${depth} • Battle • ${cardName}` : `Battle • ${cardName}`;
          const prompt = String(prevAwaiting.question?.prompt ?? "");
          const expected = String(prevAwaiting.question?.answer ?? "");
          const given = String(((battle as any)?.meta as any)?.lastAnswerInput ?? "");
          const entry = {
            id: `wa:${Date.now()}:${Math.random().toString(16).slice(2)}`
            ,atMs: Date.now()
            ,source: "BATTLE"
            ,location
            ,prompt
            ,expected
            ,given
          } as any;
          nextState = appendWrongAnswerLog(nextState, entry);
        }
      } catch {}

      return nextState;
    }

    case "BATTLE_ENDED": {
      const supplyIds = state.currentSupplyIds ?? [];
      const battleMeta: any = (state.battle as any)?.meta ?? {};
      const returnNodeScreen = battleMeta.returnNodeScreen as any | undefined;
      const skipRewards = !!action.skipRewards || !!battleMeta.skipRewards;
      const incoming = Number.isFinite(action.playerHpAfter) ? action.playerHpAfter : state.hp;
      const hpAfter = Math.max(0, Math.min(state.maxHp, incoming));
      const baseGold = skipRewards ? 0 : (action.goldGained ?? 0);
      const goldGained = applySuppliesToGoldGain(baseGold, supplyIds);
      const hpAfterWin = action.victory ? applySuppliesPostBattleHeal(hpAfter, state.maxHp, supplyIds) : hpAfter;
      const now = Date.now();
      let supplyFlashNonce = state.supplyFlashNonce ?? 0;
      let supplyFlashIds = state.supplyFlashIds ?? [];

      // Collect which supplies procced during this resolution (some screens also flash supplies).
      const flashIds: string[] = [];
      const addFlash = (id: string) => {
        if (!flashIds.includes(id)) flashIds.push(id);
      };
      const finalizeFlash = () => {
        if (flashIds.length > 0) {
          supplyFlashNonce += 1;
          supplyFlashIds = flashIds.slice();
        }
      };

      // Persist deck additions caused during the battle (ex: curses added by enemies).
      const deckAdditions: string[] = Array.isArray((state.battle as any)?.meta?.deckAdditions)
        ? ((state.battle as any).meta.deckAdditions as string[])
        : [];
      const setupWithBattleAdds =
        deckAdditions.length > 0 && state.setup
          ? { ...state.setup, deckCardIds: [...(state.setup.deckCardIds ?? []), ...deckAdditions] }
          : state.setup;

      if (hpAfter <= 0) {
        if (supplyIds.includes("sup_gold_boost") && goldGained > 0) addFlash("sup_gold_boost");
        finalizeFlash();
        return {
          ...state,
          supplyFlashNonce,
          supplyFlashIds,
          hp: 0,
          gold: state.gold + goldGained,
          screen: "DEFEAT",
          runEndMs: state.runEndMs ?? now,
          battle: undefined,
          setup: setupWithBattleAdds,
          lastOutcome: { type: "defeat", isBoss: action.isBoss },
        };
      }

      if (action.victory && action.isBoss) {
        if (supplyIds.includes("sup_gold_boost") && goldGained > 0) addFlash("sup_gold_boost");
        finalizeFlash();
        return {
          ...state,
          supplyFlashNonce,
          supplyFlashIds,
          hp: hpAfterWin,
          gold: state.gold + goldGained,
          screen: "VICTORY",
          runEndMs: state.runEndMs ?? now,
          battle: undefined,
          setup: setupWithBattleAdds,
          lastOutcome: { type: "victory", isBoss: true },
        };
      }

      if (action.victory) {
        const nodeId = state.currentNodeId ?? "unknown_node";

        if (skipRewards) {
          // Skip rewards (ex: Absence Note) — no rewards screen.
          // Still allow post-battle healing supplies to trigger.
          if (supplyIds.includes("sup_post_battle_heal")) addFlash("sup_post_battle_heal");

          // Some battles (ex: ambushes from events) need to return to an event screen
          // instead of going straight back to the overworld.
          if (returnNodeScreen) {
            finalizeFlash();
            return {
              ...state,
              supplyFlashNonce,
              supplyFlashIds,
              hp: hpAfterWin,
              screen: "NODE",
              battle: undefined,
              reward: null,
              rewardNodeId: null,
              setup: setupWithBattleAdds,
              nodeScreen: returnNodeScreen,
              lastOutcome: { type: "victory", isBoss: false },
            };
          }

          finalizeFlash();
          return {
            ...state,
            supplyFlashNonce,
            supplyFlashIds,
            hp: hpAfterWin,
            // No gold / cards / consumables
            screen: "OVERWORLD",
            battle: undefined,
            reward: null,
            rewardNodeId: null,
            setup: setupWithBattleAdds,
            // Absence Note (skip rewards) should lock the node immediately.
            lockedNodeIds: Array.from(new Set([...(state.lockedNodeIds ?? []), nodeId])),
            lastOutcome: { type: "victory", isBoss: false },
          };
        }

        if (supplyIds.includes("sup_post_battle_heal")) addFlash("sup_post_battle_heal");

        const difficulty = (state.battle?.difficulty ?? 1) as 1 | 2 | 3;
        if (supplyIds.includes("sup_double_offers")) addFlash("sup_double_offers");
        if (supplyIds.includes("sup_upgraded_rewards")) addFlash("sup_upgraded_rewards");
        const isChallengeFight = !!((state.battle as any)?.meta?.isChallenge);
        const reward = buildBattleRewards({ runSeed: state.seed, nodeId, difficulty, supplyIds, isChallenge: isChallengeFight });

        finalizeFlash();
        return {
          ...state,
          supplyFlashNonce,
          supplyFlashIds,
          hp: hpAfterWin,
          // Gold is collected from the reward screen (click-to-collect)
          screen: "REWARD",
          battle: undefined,
          reward,
          rewardNodeId: nodeId,
          setup: setupWithBattleAdds,
          lastOutcome: { type: "victory", isBoss: false },
        };
      }

      // Fallback (should not happen): return to overworld with no rewards
      finalizeFlash();
      return {
        ...state,
        supplyFlashNonce,
        supplyFlashIds,
        hp: hpAfter,
        gold: state.gold + goldGained,
        screen: "OVERWORLD",
        battle: undefined,
        setup: setupWithBattleAdds,
        lastOutcome: state.lastOutcome,
      };
    }


    case "CLOSE_NODE": {
      const curNodeId = state.currentNodeId;
      const cacheAdd = curNodeId && state.nodeScreen ? { [curNodeId]: state.nodeScreen } : null;
      const nodeScreenCache = {
        ...(state.nodeScreenCache ?? {}),
        ...(cacheAdd ?? {}),
      };
      return { ...state, nodeScreenCache, screen: "OVERWORLD" };
    }

    case "CLAIM_REWARD": {
      // Return to overworld but keep the reward state intact so the player can reopen
      // the Rewards screen for this node until they actually move on to another node.
      return { ...state, screen: "OVERWORLD" };
    }

    case "REWARD_SELECT_CARD": {
      if (state.screen !== "REWARD" || !state.reward) return state;
      return {
        ...state,
        reward: { ...state.reward, selectedCardId: action.cardId },
      };
    }

    case "REWARD_CONFIRM_CARD": {
      if (state.screen !== "REWARD" || !state.reward) return state;
      if (state.reward.cardConfirmed) return state;
      const cardId = state.reward.selectedCardId;
      if (!cardId) return state;

      const setup = state.setup ? { ...state.setup } : null;
      if (setup) {
        setup.deckCardIds = [...(setup.deckCardIds ?? []), cardId];
      }

      return {
        ...state,
        setup,
        reward: { ...state.reward, cardConfirmed: true },
      };
    }

    case "REWARD_SKIP_CARDS": {
      if (state.screen !== "REWARD" || !state.reward) return state;
      return {
        ...state,
        reward: { ...state.reward, selectedCardId: null, cardConfirmed: true },
      };
    }

    case "REWARD_CLAIM_SUPPLY": {
      if (state.screen !== "REWARD" || !state.reward) return state;
      const supplyId = state.reward.supplyOfferId;
      if (!supplyId) return state;

      // Prevent duplicate supplies
      if ((state.currentSupplyIds ?? []).includes(supplyId)) {
        return state; // Already have this supply, don't add it again
      }

      // Add supply to current supplies
      const currentSupplyIds = [...(state.currentSupplyIds ?? []), supplyId];
      let next: GameState = {
        ...state,
        currentSupplyIds,
        reward: { ...state.reward, supplyOfferId: null },
      };

      // Apply "on gain" effects
      next = applySupplyOnGain(next, supplyId);

      return next;
    }

    case "REWARD_CLAIM_GOLD": {
      if (state.screen !== "REWARD" || !state.reward) return state;
      if (state.reward.goldClaimed) return state;

      const supplyIds = state.currentSupplyIds ?? [];
      let supplyFlashNonce = state.supplyFlashNonce ?? 0;
      let supplyFlashIds = state.supplyFlashIds ?? [];

      if (supplyIds.includes("sup_gold_boost") && (state.reward.goldAmount ?? 0) > 0) {
        supplyFlashNonce += 1;
        supplyFlashIds = ["sup_gold_boost"];
      }

      return {
        ...state,
        supplyFlashNonce,
        supplyFlashIds,
        gold: state.gold + state.reward.goldAmount,
        reward: { ...state.reward, goldClaimed: true },
      };
    }

    case "REWARD_CLAIM_CONSUMABLE": {
      if (state.screen !== "REWARD" || !state.reward) return state;
      if (state.reward.consumableClaimed) return state;
      const id = state.reward.consumableOfferId;
      if (!id) return state;

      // max 3 carried
      if ((state.consumables ?? []).length >= 3) return state;

      return {
        ...state,
        consumables: [...(state.consumables ?? []), id],
        reward: { ...state.reward, consumableClaimed: true },
      };
    }

    case "REWARD_SKIP_EXTRAS": {
      if (state.screen !== "REWARD" || !state.reward) return state;
      return {
        ...state,
        reward: { ...state.reward, goldClaimed: true, consumableClaimed: true },
      };
    }

    case "REWARD_SKIP_ALL": {
      if (state.screen !== "REWARD" || !state.reward) return state;
      return {
        ...state,
        reward: {
          ...state.reward,
          selectedCardId: null,
          cardConfirmed: true,
          goldClaimed: true,
          consumableClaimed: true,
        },
      };
    }

    case "TRASH_BIN_REMOVE_CARD": {
      // Trash Bin is an out-of-battle consumable that permanently removes a card from the deck.
      if (state.screen === "BATTLE" && state.battle) return state;
      if (!state.setup) return state;

      const inv = (state.consumables ?? []).slice();
      const trashIdx = inv.indexOf("con_trash_bin");
      if (trashIdx < 0) return state;

      const deck = (state.setup.deckCardIds ?? []).slice();
      const idx = deck.indexOf(action.cardId);
      if (idx < 0) return state;

      // Don't allow removing the last card.
      if (deck.length <= 1) return state;

      deck.splice(idx, 1);
      // Consume the Trash Bin.
      inv.splice(trashIdx, 1);

      return {
        ...state,
        setup: { ...state.setup, deckCardIds: deck },
        consumables: inv,
      };
    }


    case "DISCARD_CONSUMABLE": {
      const id = action.consumableId;
      const idx = (state.consumables ?? []).findIndex((x) => x === id);
      if (idx < 0) return state;
      const next = (state.consumables ?? []).slice();
      next.splice(idx, 1);
      return { ...state, consumables: next };
    }

    case "USE_CONSUMABLE": {
      // Consumables are global run inventory. Most are battle-only, but some (ex: Water) can be used anywhere.
      const inv = (state.consumables ?? []).slice();
      const idx = inv.indexOf(action.consumableId);
      if (idx < 0) return state;

      const isWater = action.consumableId === "con_water";

      // ---- Out of battle: only allow Water (max HP) ----
      if (state.screen !== "BATTLE" || !state.battle) {
        if (!isWater) return state;

        const beforeMax = Math.max(1, Math.floor(state.maxHp ?? 1));
        const beforeHP = Math.max(0, Math.floor(state.hp ?? 0));
        const afterMax = beforeMax + 7;
        const afterHP = Math.min(afterMax, beforeHP + 7);

        inv.splice(idx, 1);
        return {
          ...state,
          consumables: inv,
          maxHp: afterMax,
          hp: afterHP,
        };
      }

      // ---- In battle ----
      // Deterministic-ish rng for draw/shuffle. (Good enough for now.)
      const salt = hashStringToInt(
        `use-consumable:${state.currentNodeId ?? "node"}:${state.battle.turn}:${action.consumableId}`
      );
      const rng = makeRng((state.seed ^ salt) >>> 0);

      const res = tryUseConsumableInBattle({ rng, state: state.battle, consumableId: action.consumableId });

      // If it didn't actually "use", keep it in inventory
      if (!res.used) {
        return { ...state, battle: res.next, hp: res.next.playerHP, maxHp: res.next.playerMaxHP };
      }

      // Consume it
      inv.splice(idx, 1);

      return { ...state, consumables: inv, battle: res.next, hp: res.next.playerHP, maxHp: res.next.playerMaxHP };
    }

    case "DEBUG_ADD_ALL_CONSUMABLES": {
      const allIds = CONSUMABLES_10.map((c) => c.id);
      return { ...state, consumables: Array.from(new Set([...(state.consumables ?? []), ...allIds])) };
    }
    case "DEBUG_CLEAR_CONSUMABLES": {
      return { ...state, consumables: [] };
    }
    case "DEBUG_SET_SUPPLY": {
      if (!state.setup) return state;

      // Keep legacy setup.supplyId updated for UI display, but treat supplies as run inventory.
      const setup = { ...state.setup, supplyId: action.supplyId };

      if (!action.supplyId) {
        // Allow clearing the legacy display without mutating run supplies.
        return { ...state, setup };
      }

      // Prevent duplicates
      if ((state.currentSupplyIds ?? []).includes(action.supplyId)) {
        return { ...state, setup };
      }

      const currentSupplyIds = [...(state.currentSupplyIds ?? []), action.supplyId];
      let next: GameState = { ...state, setup, currentSupplyIds };
      next = applySupplyOnGain(next, action.supplyId);
      return next;
    }
    case "DEBUG_ADD_CARD_TO_DECK": {
      if (!state.setup) return state;
      const setup = { ...state.setup, deckCardIds: [...(state.setup.deckCardIds ?? []), action.cardId] };
      return { ...state, setup };
    }
    case "DEBUG_ADD_CARD_TO_HAND": {
      if (!state.battle) return state;
      return { ...state, battle: { ...state.battle, hand: [...(state.battle.hand ?? []), action.cardId] } };
    }
    case "DEBUG_GIVE_GOLD": {
      return { ...state, gold: Math.max(0, (state.gold ?? 0) + Math.floor(action.amount ?? 0)) };
    }
    case "DEBUG_HEAL_FULL": {
      const next: any = { ...state, hp: state.maxHp };
      if (next.battle) {
        next.battle = {
          ...next.battle,
          playerHP: Number(next.battle.playerMaxHP ?? next.maxHp ?? state.maxHp),
        };
      }
      return next;
    }
    case "DEBUG_TOGGLE_SKIP_QUESTIONS": {
      return { ...state, debugSkipQuestions: !state.debugSkipQuestions };
    }

    case "DEBUG_FORCE_BATTLE": {
      if (state.screen !== "OVERWORLD") return state;
      if (!state.setup) return state;

      try {
        // Find the encounter by ID
        const allEncounters = [
          ...ENCOUNTER_POOL_EASY_5,
          ...ENCOUNTER_POOL_MED_5,
          ...ENCOUNTER_POOL_HARD_5,
          ...ENCOUNTER_POOL_CHALLENGE_EASY,
          ...ENCOUNTER_POOL_CHALLENGE_MED,
          ...ENCOUNTER_POOL_CHALLENGE_HARD,
          BOSS_ENCOUNTER,
        ];
        
        const encounter = allEncounters.find((enc) => enc.id === action.encounterId);
        if (!encounter) {
          console.error("DEBUG_FORCE_BATTLE: Encounter not found:", action.encounterId);
          return state;
        }

        const isBoss = encounter.id === BOSS_ENCOUNTER.id;
        const isChallenge = action.isChallenge ?? (encounter.id.startsWith("ch_"));
        const difficulty = action.difficulty ?? (isBoss ? 3 : isChallenge ? 2 : 1);

        // Use a fixed seed for debug battles
        const rng = makeRng(12345);
        const enemies = encounterToEnemyStates(encounter, rng);

        const deckCardIds = state.setup?.deckCardIds ?? [];
        const playerHpStart = state.hp;
        const playerMaxHp = state.maxHp;
        const playerName = state.setup?.playerName ?? "Player";
        const playerSprite = state.setup?.playerSprite ?? { kind: "emoji", value: "🧑‍🎓" };

        const supplyIds = (state.currentSupplyIds ?? []).length > 0 
          ? (state.currentSupplyIds ?? [])
          : (state.setup?.supplyIds ?? (state.setup?.supplyId ? [state.setup.supplyId] : []));
        const legacySupplyId = supplyIds.length > 0 ? supplyIds[0] : null;

        let battle = startBattleCore({
          rng,
          difficulty,
          isBoss,
          playerHpStart,
          playerMaxHp,
          deckCardIds,
          enemies,
          playerName,
          playerSprite,
        });

        battle = {
          ...battle,
          meta: {
            ...(battle as any).meta,
            supplyId: legacySupplyId,
            supplyIds,
            isChallenge,
            runGold: state.gold ?? 0,
          },
        };
        battle = applySuppliesToNewBattle(battle, supplyIds);

        const didStartStrength = supplyIds.includes("sup_start_strength");
        const supplyFlashNonce = didStartStrength ? (state.supplyFlashNonce ?? 0) + 1 : (state.supplyFlashNonce ?? 0);
        const supplyFlashIds = didStartStrength ? ["sup_start_strength"] : (state.supplyFlashIds ?? []);

        console.log("✅ DEBUG_FORCE_BATTLE -> screen=BATTLE", {
          encounterId: action.encounterId,
          isBoss,
          isChallenge,
          difficulty,
          deckLen: deckCardIds.length,
          battleKeys: Object.keys(battle),
        });

        return {
          ...state,
          screen: "BATTLE",
          battle,
          supplyFlashNonce,
          supplyFlashIds,
          nodeScreen: undefined,
        };
      } catch (err) {
        console.error("❌ DEBUG_FORCE_BATTLE failed:", err);
        return state;
      }
    }


case "DEBUG_SET_FORCED_EVENT": {
  // Allow setting/clearing a forced event id for the next EVENT node opened.
  return { ...state, debugForcedEventId: action.eventId ?? null };
}

case "DEBUG_FORCE_EVENT": {
  // Jump into an EVENT node immediately (useful for testing).
  if (!state.map) return state;

  const allNodes = Object.values(state.map.nodes ?? {});
  const eventNodes = allNodes.filter((n) => n.type === "EVENT");
  if (eventNodes.length === 0) return state;

  const curDepth = state.currentNodeId ? (state.map.nodes?.[state.currentNodeId]?.depth ?? 0) : 0;
  const candidates = eventNodes
    .filter((n) => n.depth >= curDepth)
    .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
  const chosen = (candidates[0] ?? eventNodes.sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))[0])!;

  const movingAwayFromReward = !!state.reward && !!state.rewardNodeId && chosen.id !== state.rewardNodeId;
  const nextLockedNodeIds = movingAwayFromReward && state.rewardNodeId
    ? Array.from(new Set([...(state.lockedNodeIds ?? []), state.rewardNodeId]))
    : (state.lockedNodeIds ?? []);

  const rebuilt = buildEventNodeState(state.seed, chosen.id, chosen.depth) as any;
  const nodeScreen = { ...rebuilt, eventId: action.eventId, step: "INTRO", resultText: undefined, pendingUpgradeText: undefined };

  return {
    ...state,
    currentNodeId: chosen.id,
    screen: "NODE",
    nodeScreen,
    lockedNodeIds: nextLockedNodeIds,
    debugForcedEventId: null,
    reward: movingAwayFromReward ? null : state.reward,
    rewardNodeId: movingAwayFromReward ? null : state.rewardNodeId,
  };
}

    default:
      return state;
  }
}
