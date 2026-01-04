// src/screens/BattleScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Rnd } from "react-rnd";
import type { RNG } from "../game/rng";
import type { BattleState } from "../game/battle";
import { chooseCard, chooseDiscard, resolveCardAnswer, endPlayerTurn, stepEnemyTurn } from "../game/battle";
import { ALL_CARDS_40ish, cardDescForUi, EXHAUST_TOOLTIP } from "../content/cards";
import { getEffectDef } from "../content/effects";
import { modifyAttackDamage } from "../game/effects";
import { sfx } from "../game/sfx";
import type { SetupSelection } from "../game/state";
import { SUPPLIES_POOL_10 } from "../content/supplies";
import { CONSUMABLES_10 } from "../content/consumables";
import { QuestionVizView } from "../components/QuestionViz";
import { BoxPlotBuilder, defaultBuildStart } from "../components/BoxPlotBuilder";

function pct(current: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / max) * 100)));
}

function normalizeType(t: any): "ATTACK" | "BLOCK" | "SKILL" {
  const s = String(t ?? "").toUpperCase();
  if (s === "ATTACK") return "ATTACK";
  if (s === "BLOCK") return "BLOCK";
  return "SKILL";
}

function cardCost(def: any) {
  const n = Number(def?.cost ?? 1);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 1;
}

function effectText(typeRaw: any) {
  const type = normalizeType(typeRaw);
  if (type === "ATTACK") return "Deal 6";
  if (type === "BLOCK") return "Gain 6 Block";
  return "Gain 3 Block • Draw 1";
}

function SpriteView(props: { sprite?: any; fallbackEmoji: string; alt: string }) {
  const s = props.sprite;

  if (!s) return <div className="entitySprite" aria-hidden>{props.fallbackEmoji}</div>;

  if (s.kind === "emoji") {
    return <div className="entitySprite" aria-hidden>{s.value || props.fallbackEmoji}</div>;
  }

  if (s.kind === "image" && s.src) {
    return (
      <div className="entitySprite entitySpriteImg">
        <img src={s.src} alt={s.alt ?? props.alt} draggable={false} />
      </div>
    );
  }

  if (typeof s === "string") {
    const looksLikeUrl =
      s.startsWith("data:") || s.startsWith("http://") || s.startsWith("https://") || s.startsWith("/");
    if (looksLikeUrl) {
      return (
        <div className="entitySprite entitySpriteImg">
          <img src={s} alt={props.alt} draggable={false} />
        </div>
      );
    }
    return <div className="entitySprite" aria-hidden>{s}</div>;
  }

  return <div className="entitySprite" aria-hidden>{props.fallbackEmoji}</div>;
}

// Intent indicator helpers - rebuilt from scratch
function getIntentIcon(intentKind: string): string {
  if (intentKind === "ATTACK") return "⚔";
  if (intentKind === "BLOCK") return "🛡";
  if (intentKind === "HEAL") return "➕";
  if (intentKind === "DEBUFF") return "☠";
  if (intentKind === "BUFF") return "✨";
  if (intentKind === "SUMMON") return "👥";
  if (intentKind === "ADD_NEGATIVE_CARD") return "🕷";
  if (intentKind === "ERASE_BUFFS") return "🧽";
  if (intentKind === "EXHAUST_RANDOM_CARD") return "🔥";
  if (intentKind === "FORCE_QUESTION") return "📚";
  if (intentKind === "CLEANSE_SELF") return "🧼";
  return "?";
}

function getIntentColor(intentKind: string): string {
  if (intentKind === "ATTACK") return "rgba(245,158,11,0.35)"; // warn/orange
  if (intentKind === "BLOCK") return "rgba(59,130,246,0.35)"; // blue
  if (intentKind === "HEAL") return "rgba(34,197,94,0.35)"; // green
  if (intentKind === "DEBUFF") return "rgba(239,68,68,0.35)"; // red
  if (intentKind === "BUFF") return "rgba(168,85,247,0.35)"; // purple
  if (intentKind === "SUMMON") return "rgba(139,92,246,0.35)"; // purple
  if (intentKind === "ADD_NEGATIVE_CARD") return "rgba(239,68,68,0.35)"; // red
  if (intentKind === "ERASE_BUFFS") return "rgba(255,255,255,0.18)"; // default
  return "rgba(255,255,255,0.18)"; // default
}

function getIntentFlashColor(intentKind: string): string {
  if (intentKind === "ATTACK") return "rgba(245,158,11,0.7)";
  if (intentKind === "BLOCK") return "rgba(59,130,246,0.7)";
  if (intentKind === "HEAL") return "rgba(34,197,94,0.7)";
  if (intentKind === "DEBUFF") return "rgba(239,68,68,0.7)";
  if (intentKind === "BUFF") return "rgba(168,85,247,0.7)";
  if (intentKind === "SUMMON") return "rgba(139,92,246,0.7)";
  if (intentKind === "ADD_NEGATIVE_CARD") return "rgba(239,68,68,0.7)";
  if (intentKind === "ERASE_BUFFS") return "rgba(255,255,255,0.35)";
  return "rgba(255,255,255,0.35)";
}

function getIntentDescription(intent: any, playerStatuses?: any[], enemyStatuses?: any[], ctx?: { enemy?: any; battle?: any }): string {
  if (!intent || !intent.kind) return "perform an unknown action";
  
  switch (intent.kind) {
    case "ATTACK": {
      const hits = Math.max(1, Math.floor(Number(intent.hits ?? 1)));
      const baseDmg = Math.max(0, Math.floor(Number(intent.dmg ?? 0)));
      const finalDmg = modifyAttackDamage(baseDmg, enemyStatuses ?? [], playerStatuses ?? []);
      if (hits > 1) {
        return `deal ${finalDmg} × ${hits} damage (${finalDmg * hits} total)`;
      }
      return `deal ${finalDmg} damage`;
    }
    case "BLOCK":
      return `gain ${intent.block} Block`;
    case "HEAL":
      return `heal ${intent.heal} HP`;
    case "DEBUFF":
      return `apply ${intent.statusId} (${intent.stacks})`;
    case "BUFF":
      return `gain ${intent.statusId} (${intent.stacks})`;
    case "SUMMON":
      return `summon ${intent.count} ${intent.spawn?.name ?? "minion"}(s)`;
    case "ADD_NEGATIVE_CARD":
      return `add a curse to your deck`;
    case "ERASE_BUFFS":
      return "erase all of your buffs";
    case "CONSUME_MINIONS_HEAL":
      try {
        const enemyId = String(ctx?.enemy?.id ?? "");
        const battle = ctx?.battle as any;
        const all = Array.isArray(battle?.enemies) ? (battle.enemies as any[]) : [];
        const minions = all.filter((m) => (m?.hp ?? 0) > 0 && String(m?.summonerId ?? "") === enemyId);
        if (minions.length <= 0) return "consume its minions to regain their health";
        const names = minions.map((m) => String(m?.name ?? m?.id ?? "minion")).join(", ");
        const total = minions.reduce((sum, m) => sum + Math.max(0, Math.floor(Number(m?.hp ?? 0))), 0);
        return `consume ${names} to regain ${total} HP`;
      } catch {
        return "consume its minions to regain their health";
      }
    case "EXHAUST_RANDOM_CARD":
      return "exhaust a random card from your hand";
    case "FORCE_QUESTION":
      return "Exam — On your next turn Mrs Pain forces a question for massive damage.";
    case "CLEANSE_SELF":
      return "cleanse all debuffs from herself";
    default:
      return "perform an unknown action";
  }
}

function getIntentValue(intent: any, playerStatuses?: any[], enemyStatuses?: any[]): string | number {
  if (!intent || !intent.kind) return 0;

  if (intent.kind === "ATTACK") {
    const hits = Math.max(1, Math.floor(Number(intent.hits ?? 1)));
    const baseDmg = Math.max(0, Math.floor(Number(intent.dmg ?? 0)));
    const finalDmg = modifyAttackDamage(baseDmg, enemyStatuses ?? [], playerStatuses ?? []);
    return hits > 1 ? `${finalDmg}×${hits}` : finalDmg;
  }
  if (intent.kind === "BLOCK") return Math.max(0, Math.floor(Number(intent.block ?? 0)));
  if (intent.kind === "HEAL") return Math.max(0, Math.floor(Number(intent.heal ?? 0)));
  if (intent.kind === "DEBUFF") return Math.max(0, Math.floor(Number(intent.stacks ?? 0)));
  if (intent.kind === "BUFF") return Math.max(0, Math.floor(Number(intent.stacks ?? 0)));
  if (intent.kind === "SUMMON") return Math.max(1, Math.floor(Number(intent.count ?? 1)));
  if (intent.kind === "ADD_NEGATIVE_CARD") return "1";
  if (intent.kind === "ERASE_BUFFS") return "!";
  if (intent.kind === "FORCE_QUESTION") return "Exam";
  if (intent.kind === "EXHAUST_RANDOM_CARD") return "!";
  if (intent.kind === "CLEANSE_SELF") return "Cleanse";

  return 0;
}


export default function BattleScreen(props: {
  rng: RNG;
  battle: BattleState;
  setup?: SetupSelection | null;
  showHints?: boolean;
  debugSkipQuestions?: boolean;
  onUpdate: (next: BattleState) => void;
  onEnd: (victory: boolean, goldGained: number, playerHpAfter: number, skipRewards?: boolean) => void;
}) {
  const b = props.battle;

  const [battleLogOpen, setBattleLogOpen] = useState(false);
  const [battleLogBox, setBattleLogBox] = useState<{ x: number; y: number; w: number; h: number }>({ x: 18, y: 120, w: 360, h: 320 });

  // Safety check: if battle state is invalid, show error message
  if (!b) {
    console.error("BattleScreen: battle state is null/undefined");
    return (
      <div className="container battleLayout">
        <div className="battleMain">
          <h2>Error</h2>
          <p>Battle state is invalid. Please return to the overworld.</p>
        </div>
      </div>
    );
  }
  
  const setup = props.setup ?? null;

  const cardById = useMemo(() => new Map(ALL_CARDS_40ish.map((c: any) => [c.id, c])), []);

  const supplyById = useMemo(() => new Map(SUPPLIES_POOL_10.map((s: any) => [s.id, s])), []);
  const consumableById = useMemo(() => new Map(CONSUMABLES_10.map((c: any) => [c.id, c])), []);

  const supply = setup?.supplyId ? supplyById.get(setup.supplyId) : null;
  const consumable = setup?.lunchItemId ? consumableById.get(setup.lunchItemId) : null;

  const [input, setInput] = useState("");
  const answerInputRef = useRef<HTMLInputElement | null>(null);

  const [stagedHandIndex, setStagedHandIndex] = useState<number | null>(null);

  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dragOverPlayZone, setDragOverPlayZone] = useState(false);

  // Visual flashes
  const [playerHitFlash, setPlayerHitFlash] = useState(false);
  const [screenShake, setScreenShake] = useState(false);
  const [playerHealFlash, setPlayerHealFlash] = useState(false);
  const [regenIconFlash, setRegenIconFlash] = useState(false);
  const [playerBlockFlash, setPlayerBlockFlash] = useState(false);
  const [playerFullBlockFlash, setPlayerFullBlockFlash] = useState(false);
  const [playerBlockBreakFlash, setPlayerBlockBreakFlash] = useState(false);
  const [playerCurseFlash, setPlayerCurseFlash] = useState(false);

  // HP popups (floating numbers near HP bars)
  type HpPopup = { id: string; target: "player" | string; amount: number; createdAt: number; index: number; kind: "dmg" | "heal" };
  const [dmgPopups, setDmgPopups] = useState<HpPopup[]>([]);
  const [intentTip, setIntentTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const streakBadgeRef = useRef<HTMLSpanElement | null>(null);

  const [openPile, setOpenPile] = useState<null | { kind: "draw" | "discard" | "exhaust" }>(null);

  const [pendingDiscardCardId, setPendingDiscardCardId] = useState<string | null>(null);

  const [deckCurseGlow, setDeckCurseGlow] = useState(false);
  const deckCurseGlowTimerRef = useRef<number | null>(null);

  const [energyDrainFlash, setEnergyDrainFlash] = useState(false);
  const [handCurseFlashCardId, setHandCurseFlashCardId] = useState<string | null>(null);
  const spawnDmgPopup = (target: "player" | string, amount: number, index: number = 0, kind: "dmg" | "heal" = "dmg") => {
    const id = `${target}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const popup: HpPopup = { id, target, amount, createdAt: Date.now(), index, kind };
    setDmgPopups((prev) => [...prev, popup]);
    window.setTimeout(() => {
      setDmgPopups((prev) => prev.filter((p: HpPopup) => p.id !== id));
    }, 1400);
  };

  const fixEffectTip = (s: any, raw: string) => {
    if (String(s?.id ?? "") !== "desk_phone_shield") return raw;
    const defendedId = String((b as any).meta?.deskShieldTargetId ?? "");
    const letter = defendedId.startsWith("smartphone_") ? defendedId.replace("smartphone_", "").toUpperCase() : "___";
    return String(raw ?? "").replace("___", letter || "___");
  };

  const showFloatingTip = (text: string, ev?: React.MouseEvent) => {
    if (!text) return;
    const x = Math.min(window.innerWidth - 380, Math.max(8, Math.floor(Number(ev?.clientX ?? 0) + 14)));
    const y = Math.min(window.innerHeight - 80, Math.max(8, Math.floor(Number(ev?.clientY ?? 0) + 14)));
    setIntentTip({ text, x, y });
  };

  const triggerShake = (ms = 220) => {
    setScreenShake(true);
    setTimeout(() => setScreenShake(false), ms);
  };

  // Enemy phase timing
  const enemyTimerRef = useRef<number | null>(null);

  const [enemyHitFlash, setEnemyHitFlash] = useState<Record<string, number>>({});
  const [recentlyDead, setRecentlyDead] = useState<Record<string, number>>({});
  
  // Enemy block flash states: "gain" (blue), "lose" (orange), "break" (red)
  const [enemyBlockFlash, setEnemyBlockFlash] = useState<Record<string, "gain" | "lose" | "break">>({});

  const [enemyStatusProcFlash, setEnemyStatusProcFlash] = useState<{ enemyId: string; statusId: string } | null>(null);

  const cleanseHoverTimerRef = useRef<number | null>(null);
  const cleanseHoverIntervalRef = useRef<number | null>(null);
  const cleanseHoverEnemyIdRef = useRef<string | null>(null);
  const lastCleanseFlashNonceRef = useRef<number>(0);
  const lastPendingHandExhaustTriggerNonceRef = useRef<number>(0);

  const [cleanseHoverEnemyId, setCleanseHoverEnemyId] = useState<string | null>(null);

  // Briefly enlarge the enemy panel that is currently attacking
  const [enemyAttackPulseId, setEnemyAttackPulseId] = useState<string | null>(null);
  
  // Track which enemy intents have been resolved (for flashing) - key: "enemyId-intentIndex"
  const [resolvedIntents, setResolvedIntents] = useState<Record<string, number>>({});

  // Enemy hover anti-spam
  const lastEnemyHoverIdRef = useRef<string | null>(null);

  const awaiting = b.awaiting;
  const isEnemyPhase = String((b as any).meta?.phase ?? "PLAYER") === "ENEMY";
  const awaitingCardId = awaiting?.cardId ?? null;
  const isExam = awaitingCardId === "forced_question";
  const examDamage = Math.max(0, Math.floor(Number((b as any).meta?.forcedQuestionDamage ?? 0)));
  const examEnemyId = String((b as any).meta?.forcedQuestionByEnemyId ?? "mrs_pain");
  const examEnemyName = String((b.enemies ?? []).find((e: any) => String(e?.id ?? "") === examEnemyId)?.name ?? "Mrs Pain");
  const awaitingCardDef = awaitingCardId ? cardById.get(awaitingCardId) : null;
  const isChallenge = Boolean((b as any).meta?.isChallenge);

  // Interactive box-plot build questions (Unit 8.2).
  const [boxplotBuild, setBoxplotBuild] = useState<null | { min: number; q1: number; median: number; q3: number; max: number }>(null);
  const buildMeta = (awaiting as any)?.question?.build as any;
  const buildQuestionKey = String((awaiting as any)?.question?.id ?? (awaiting as any)?.question?.prompt ?? "");

  // Define blockBadgeStyle early so it can be used in StreakBadge
  const blockBadgeStyle: React.CSSProperties = {
    boxShadow: playerBlockBreakFlash
      ? "0 0 0 3px rgba(255,80,80,0.85)"
      : playerFullBlockFlash
        ? "0 0 0 3px rgba(80,170,255,0.85)"
        : playerBlockFlash
          ? "0 0 0 2px rgba(80,170,255,0.55)"
          : "none",
    border: playerBlockBreakFlash
      ? "1px solid rgba(255,80,80,0.75)"
      : playerFullBlockFlash || playerBlockFlash
        ? "1px solid rgba(80,170,255,0.55)"
        : undefined,
    transition: "box-shadow 120ms ease, border 120ms ease",
  };

  // Auto-focus answer input when a question appears
  useEffect(() => {
    if (!awaiting) return;
    if (String((awaiting as any)?.question?.kind ?? "") === "boxplot_build") return;
    setTimeout(() => {
      answerInputRef.current?.focus();
      answerInputRef.current?.select();
    }, 0);
  }, [awaitingCardId, awaiting]);

  // Initialize builder state when an interactive box-plot question appears.
  useEffect(() => {
    if (!awaiting) {
      setBoxplotBuild(null);
      return;
    }
    if (String((awaiting as any)?.question?.kind ?? "") !== "boxplot_build") {
      setBoxplotBuild(null);
      return;
    }
    const m: any = (awaiting as any)?.question?.build ?? {};
    const axisMin = Number(m.axisMin ?? 0);
    const axisMax = Number(m.axisMax ?? 10);
    const step = Number(m.tickStep ?? 1);

    let start = defaultBuildStart(axisMin, axisMax);
    // Snap to tick step if provided
    const snap = (n: number) => {
      if (!Number.isFinite(step) || step <= 0) return n;
      return Math.round(n / step) * step;
    };
    start = {
      min: snap(start.min),
      q1: snap(start.q1),
      median: snap(start.median),
      q3: snap(start.q3),
      max: snap(start.max),
    };
    // Clamp ordering & axis
    start.min = Math.max(axisMin, Math.min(start.min, start.q1));
    start.q1 = Math.max(start.min, Math.min(start.q1, start.median));
    start.median = Math.max(start.q1, Math.min(start.median, start.q3));
    start.q3 = Math.max(start.median, Math.min(start.q3, start.max));
    start.max = Math.min(axisMax, Math.max(start.q3, start.max));

    setBoxplotBuild(start);
  }, [buildQuestionKey]);

  const playerMax = b.playerMaxHP ?? 50;
  const enemyMax = b.enemyMaxHP ?? (b.isBoss ? 55 : 32);

  // Enemies list (fallback to legacy single enemy)
  let enemies: any[] = [];
  try {
    enemies =
    (b as any).enemies?.length
      ? ((b as any).enemies as any[])
      : [
          {
            id: "enemy-1",
            name: b.isBoss ? "Boss" : "Enemy",
              hp: b.enemyHP ?? 0,
            maxHP: enemyMax,
              intent: { kind: "ATTACK", dmg: b.enemyIntentDamage ?? 0, hits: 1 },
            block: 0,
            sprite: { kind: "emoji", value: b.isBoss ? "👹" : "👾" },
            statuses: [],
          },
        ];
  } catch (err) {
    console.error("Error computing enemies list:", err);
    enemies = [{
      id: "enemy-1",
      name: "Enemy",
      hp: b.enemyHP ?? 0,
      maxHP: enemyMax,
      intent: { kind: "ATTACK", dmg: b.enemyIntentDamage ?? 0, hits: 1 },
      block: 0,
      sprite: { kind: "emoji", value: "👾" },
      statuses: [],
    }];
  }

  const livingEnemies = enemies.filter((e: any) => (e?.hp ?? 0) > 0);
  const enemiesAlive = livingEnemies.length > 0;

  const isOver = b.playerHP <= 0 || !enemiesAlive;
  const victory = b.playerHP > 0 && !enemiesAlive;

  const [showOutcomeOverlay, setShowOutcomeOverlay] = useState(false);

  useEffect(() => {
    if (!isOver) {
      setShowOutcomeOverlay(false);
      return;
    }
    const t = window.setTimeout(() => setShowOutcomeOverlay(true), 520);
    return () => window.clearTimeout(t);
  }, [isOver]);

  // Only sum intent for living enemies (attack intent number display)
  const incomingIntent = livingEnemies.reduce((sum: number, en: any) => {
    const intent = en?.intent;
    if (intent?.kind !== "ATTACK") return sum;
    const hits = Math.max(1, Math.floor(Number((intent as any).hits ?? 1)));
    const dmg = Math.max(0, Math.floor(Number((intent as any).dmg ?? 0)));
    return sum + dmg * hits;
  }, 0);

  // Auto-retarget if selected target died / not set
  const selectedEnemyId = (b as any).selectedEnemyId as string | undefined;
  const livingIdsKey = livingEnemies.map((e: any) => e.id).join("|");

  useEffect(() => {
    if (isOver) return;
    if (!livingEnemies.length) return;

    const selectedAlive =
      selectedEnemyId && livingEnemies.some((e: any) => e.id === selectedEnemyId);

    if (!selectedAlive) {
      const preferred = livingEnemies.find((e: any) => !(e as any).frontRow) ?? livingEnemies[0];
      props.onUpdate({ ...(b as any), selectedEnemyId: preferred.id } as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOver, livingIdsKey, selectedEnemyId]);

  
  useEffect(() => {
    return () => {
      if (enemyTimerRef.current != null) {
        window.clearTimeout(enemyTimerRef.current);
        enemyTimerRef.current = null;
      }

      if (cleanseHoverTimerRef.current != null) {
        window.clearTimeout(cleanseHoverTimerRef.current);
        cleanseHoverTimerRef.current = null;
      }

      if (cleanseHoverIntervalRef.current != null) {
        window.clearInterval(cleanseHoverIntervalRef.current);
        cleanseHoverIntervalRef.current = null;
      }
      cleanseHoverEnemyIdRef.current = null;
      setCleanseHoverEnemyId(null);
    };
  }, []);
// ---------- SFX + VFX triggers by diffing state ----------
  const enemyHpKey = enemies.map((e: any) => `${e.id}:${Number(e.hp ?? 0)}`).join("|");
  const lastResultKey = b.lastResult ? `${b.turn}:${b.lastResult.correct}:${b.lastResult.message}` : null;

  // Used for UI flashes that should still happen even if the player takes damage in the same "End Turn" update.
  const healFlashNonce = Number((b as any).meta?.healFlashNonce ?? 0);
  const statusFlashKey = `${Number((b as any).meta?.statusFlashNonce ?? 0)}:${String(
    (b as any).meta?.statusFlashId ?? ""
  )}:${String((b as any).meta?.statusFlashTarget ?? "")}`;

  const negativeCardEventsKey = String((b as any).meta?.negativeCardEvents?.length ?? 0);

  const blockedNegativeCardNonce = Number((b as any).meta?.blockedNegativeCardNonce ?? 0);
  const blockedNegativeCardByEnemyId = String((b as any).meta?.blockedNegativeCardByEnemyId ?? "");

  const energyDrainNonce = Number((b as any).meta?.energyDrainNonce ?? 0);
  const handDiscardFlashNonce = Number((b as any).meta?.handDiscardFlashNonce ?? 0);
  const handDiscardFlashCardId = String((b as any).meta?.handDiscardFlashCardId ?? "");

  const processedDamageEventsRef = useRef<Set<string>>(new Set());
  const processedHealEventsRef = useRef<Set<string>>(new Set());

  const prevRef = useRef<{
    turn: number;
    intentSum: number;
    playerHP: number;
    playerBlock: number;
    enemyHP: Record<string, number>;
    enemyBlock: Record<string, number>;
    lastResultKey: string | null;
    healFlashNonce: number;
    statusFlashKey: string;
    lastEnemyAttackId: string;
    lastEnemyAttackNonce: number;
    pendingEnemyAttackId: string;
    processedDamageEvents: Set<string>;
    processedHealEvents: Set<string>;
    processedNegativeEvents: Set<string>;
    energyDrainNonce: number;
    handDiscardFlashNonce: number;
    handDiscardFlashCardId: string;
    blockedNegativeCardNonce: number;
  }>({
    turn: Number(b.turn ?? 1),
    intentSum: incomingIntent,
    playerHP: Number(b.playerHP ?? 0),
    playerBlock: Number((b as any).playerBlock ?? 0),
    enemyHP: Object.fromEntries((enemies ?? []).map((e: any) => [String(e.id), Number(e.hp ?? 0)])),
    enemyBlock: Object.fromEntries((enemies ?? []).map((e: any) => [String(e.id), Number((e as any).block ?? 0)])),
    lastResultKey,
    healFlashNonce,
    statusFlashKey,
    lastEnemyAttackId: String((b as any).meta?.lastEnemyAttackId ?? ""),
    lastEnemyAttackNonce: Number((b as any).meta?.lastEnemyAttackNonce ?? 0),
    pendingEnemyAttackId: String((b as any).meta?.pendingEnemyAttackId ?? ""),
    processedDamageEvents: processedDamageEventsRef.current,
    processedHealEvents: processedHealEventsRef.current,
    processedNegativeEvents: new Set<string>(),
    energyDrainNonce,
    handDiscardFlashNonce,
    handDiscardFlashCardId,
    blockedNegativeCardNonce,
  });

  useEffect(() => {
    const prev = prevRef.current;

    const currTurn = Number(b.turn ?? 1);
    const currIntentSum = incomingIntent;

    const currPlayerHP = Number(b.playerHP ?? 0);
    const currPlayerBlockNow = Number((b as any).playerBlock ?? 0);

    let didPlayerTakeDamage = false;

    // Player takes damage - check for multi-hit events first
    const damageEvents = (b as any).meta?.damageEvents ?? [];
    const healEvents = (b as any).meta?.healEvents ?? [];
    const playerDamageEvents = damageEvents.filter((e: any) => {
      if (e.target !== "player") return false;
      // Only process events we haven't seen before (use timestamp as unique ID)
      const eventId = `player-${e.timestamp}-${e.amount}`;
      return !prev.processedDamageEvents.has(eventId);
    });
    
    let processedAnyPlayerEvents = false;
    if (playerDamageEvents.length > 0) {
      // Multi-hit: spawn popups for each hit with delays
      didPlayerTakeDamage = true;
      processedAnyPlayerEvents = true;
      setPlayerHitFlash(true);
      setTimeout(() => setPlayerHitFlash(false), 140);
      triggerShake(220);
      
      playerDamageEvents.forEach((event: any, idx: number) => {
        const eventId = `player-${event.timestamp}-${event.amount}`;
        prev.processedDamageEvents.add(eventId);
        setTimeout(() => {
          try { sfx.hurt(); } catch {} // Use same sound as single attacks
          spawnDmgPopup("player", event.amount, idx);
        }, idx * 250); // 250ms delay between each hit (slower)
      });
    } else if (currPlayerHP < prev.playerHP) {
      // Single hit: use legacy behavior
      didPlayerTakeDamage = true;
      try { sfx.hurt(); } catch {}
      setPlayerHitFlash(true);
      spawnDmgPopup("player", Math.max(0, prev.playerHP - currPlayerHP));
      setTimeout(() => setPlayerHitFlash(false), 140);
      triggerShake(220);
    }

    
    // Player heal events (for heal popups, including cases where a heal and damage happen in the same End Turn update)
    const playerHealEvents = (healEvents ?? []).filter((e: any) => {
      if (e.target !== "player") return false;
      const eventId = `player-heal-${e.timestamp}-${e.amount}`;
      return !prev.processedHealEvents.has(eventId);
    });

    let processedAnyHealEvents = false;
    if (playerHealEvents.length > 0) {
      processedAnyHealEvents = true;
      playerHealEvents.forEach((event: any, idx: number) => {
        const eventId = `player-heal-${event.timestamp}-${event.amount}`;
        prev.processedHealEvents.add(eventId);
        setTimeout(() => {
          spawnDmgPopup("player", Math.max(0, Math.floor(Number(event.amount ?? 0))), idx, "heal");
        }, idx * 200);
      });
    }

    // Player healed (green flash)
    // We trigger this either when HP net-increases OR when the battle engine explicitly reports a heal tick
    // (ex: regen can heal, then the enemy hits in the same End Turn update, making net HP <= before).
    const didHealThisUpdate =
      currPlayerHP > prev.playerHP || healFlashNonce > prev.healFlashNonce || playerHealEvents.length > 0;
    if (didHealThisUpdate) {
      try { sfx.heal(); } catch {}
      setPlayerHealFlash(true);
      setTimeout(() => setPlayerHealFlash(false), 180);
    }

    // Fallback: if HP increased but the engine didn't emit heal events, still show a single heal popup.
    if (currPlayerHP > prev.playerHP && playerHealEvents.length === 0) {
      spawnDmgPopup("player", Math.max(0, currPlayerHP - prev.playerHP), 0, "heal");
    }

    // Negative card / curse events (supports multi-hit Scissors: one cue per card)
    const negEvents = ((b as any).meta?.negativeCardEvents ?? []) as Array<{ cardId: string; timestamp: number }>;
    for (const ev of negEvents) {
      const eventId = `${String(ev.cardId ?? "neg")}::${Number(ev.timestamp ?? 0)}`;
      if (prev.processedNegativeEvents.has(eventId)) continue;
      prev.processedNegativeEvents.add(eventId);
      try { sfx.curse(); } catch {}
      setPlayerCurseFlash(true);
      window.setTimeout(() => setPlayerCurseFlash(false), 650);

      // Purple glow pulse on deck/discard shortly after the curse lands (sync with sound/flash)
      if (deckCurseGlowTimerRef.current != null) {
        window.clearTimeout(deckCurseGlowTimerRef.current);
        deckCurseGlowTimerRef.current = null;
      }
      deckCurseGlowTimerRef.current = window.setTimeout(() => {
        setDeckCurseGlow(true);
        window.setTimeout(() => setDeckCurseGlow(false), 950);
      }, 120);
    }

    // Radiation: when energy is drained by a negative card, flash the energy UI purple.
    if (energyDrainNonce !== prev.energyDrainNonce) {
      try { sfx.curse(); } catch {}
      setEnergyDrainFlash(true);
      window.setTimeout(() => setEnergyDrainFlash(false), 1400);

      // Sync with the existing purple pile glow.
      if (deckCurseGlowTimerRef.current != null) {
        window.clearTimeout(deckCurseGlowTimerRef.current);
        deckCurseGlowTimerRef.current = null;
      }
      deckCurseGlowTimerRef.current = window.setTimeout(() => {
        setDeckCurseGlow(true);
        window.setTimeout(() => setDeckCurseGlow(false), 950);
      }, 80);
    }

    // Infestation: when a random hand card is discarded by a negative card, flash that card.
    if (handDiscardFlashNonce !== prev.handDiscardFlashNonce && handDiscardFlashCardId) {
      try { sfx.curse(); } catch {}
      setHandCurseFlashCardId(handDiscardFlashCardId);
      window.setTimeout(() => setHandCurseFlashCardId(null), 1600);
    }

    // Regen icon flash (driven by engine-reported "regen tick" when available)
    if (statusFlashKey !== prev.statusFlashKey && statusFlashKey.endsWith(":regen")) {
      setRegenIconFlash(true);
      setTimeout(() => setRegenIconFlash(false), 650);
    } else if (statusFlashKey !== prev.statusFlashKey) {
      const flashId = String((b as any).meta?.statusFlashId ?? "");
      const flashTarget = String((b as any).meta?.statusFlashTarget ?? "");
      if (flashTarget === "player" && flashId === "add_negative_card") {
        try { sfx.curse(); } catch {}
        setPlayerCurseFlash(true);
        window.setTimeout(() => setPlayerCurseFlash(false), 650);
      }

      if (flashTarget === "player" && flashId === "pop_quiz") {
        try { sfx.curse(); } catch {}
        setPlayerCurseFlash(true);
        window.setTimeout(() => setPlayerCurseFlash(false), 650);
      }

      if (flashId === "mrs_pain_pop_quiz") {
        try { sfx.curse(); } catch {}
      }

      if (flashId === "toxic_immunity") {
        try { sfx.proc(); } catch {}
      }

      if (flashId === "weak" || flashId === "vulnerable" || flashId === "poison") {
        try { sfx.proc(); } catch {}
      }

      if (flashTarget === "player" && flashId === "pending_hand_exhaust") {
        // Make this sound distinct from generic curse events.
        try { sfx.bad(); } catch {}
      }

      if (flashId === "cleanse") {
        try { sfx.buff(); } catch {}
      }

      if (flashId === "trigger_clone_at_20") {
        try { sfx.clone(); } catch {}
      } else if (
        flashId === "trigger_block_at_13" ||
        flashId === "trigger_erase_buffs_at_5" ||
        flashId === "aura_strength_to_pencil" ||
        flashId === "gain_strength_when_hit" ||
        flashId === "strength"
      ) {
        try { sfx.proc(); } catch {}
      }

      if (flashTarget && flashTarget !== "player") {
        // Visual: flash the exact status chip on the correct enemy.
        setEnemyStatusProcFlash({ enemyId: flashTarget, statusId: flashId });
        window.setTimeout(() => setEnemyStatusProcFlash(null), 650);
      }

      if (flashTarget && flashTarget !== "player" && (flashId === "auto_strength" || flashId === "auto_block")) {
        // Visual: flash the exact status chip on the correct enemy.
        setEnemyStatusProcFlash({ enemyId: flashTarget, statusId: flashId });
        window.setTimeout(() => setEnemyStatusProcFlash(null), 650);

        // Audio: only play an extra cue for Rage (auto_strength). Fortify (auto_block) already triggers shield SFX via block gain.
        if (flashId === "auto_strength") {
          try { sfx.buff(); } catch {}
        }
      }
    } else if (currPlayerHP > prev.playerHP) {
      // Fallback: if HP went up and regen is present, flash it.
      const hasRegen = (b.playerStatuses ?? []).some((s: any) => s.id === "regen" && (s.stacks ?? 0) > 0);
      if (hasRegen) {
        setRegenIconFlash(true);
        setTimeout(() => setRegenIconFlash(false), 650);
      }
    }

    // If Perfect Record blocks a negative card, explicitly flash that ADD_NEGATIVE_CARD intent red.
    if (blockedNegativeCardNonce !== prev.blockedNegativeCardNonce && blockedNegativeCardByEnemyId) {
      const enemyId = blockedNegativeCardByEnemyId;
      const enemy = enemies.find((e: any) => String(e.id) === String(enemyId));
      if (enemy) {
        const intents = ((enemy as any).intents && Array.isArray((enemy as any).intents) && (enemy as any).intents.length > 1)
          ? (enemy as any).intents
          : [(enemy as any).intent].filter(Boolean);
        const idx = intents.findIndex((it: any) => it?.kind === "ADD_NEGATIVE_CARD");
        if (idx >= 0) {
          const intentKey = `${enemyId}-${idx}`;
          setResolvedIntents((prevMap) => ({ ...prevMap, [intentKey]: Date.now() }));
          setTimeout(() => {
            setResolvedIntents((prevMap) => {
              const copy: any = { ...prevMap };
              delete copy[intentKey];
              return copy;
            });
          }, 550);
        }
      }
    }

    // Enemy attack pulse: enlarge the enemy panel that actually attacked (works for single + multi fights)
    // Enemy attack pulse: pulse before attack (based on pending flag) or after (legacy)
    const pendingEnemyAttackId = String((b as any).meta?.pendingEnemyAttackId ?? "");
    const prevPendingEnemyAttackId = String(prev.pendingEnemyAttackId ?? "");
    
    // Pulse on pending attack (before damage)
    if (pendingEnemyAttackId && pendingEnemyAttackId !== prevPendingEnemyAttackId) {
      setEnemyAttackPulseId(pendingEnemyAttackId);
      setTimeout(() => setEnemyAttackPulseId(null), 520);
      
      // Flash intents for this enemy when they're about to attack
      const enemy = enemies.find((e: any) => e.id === pendingEnemyAttackId);
      if (enemy) {
        const intents = ((enemy as any).intents && Array.isArray((enemy as any).intents) && (enemy as any).intents.length > 1)
          ? (enemy as any).intents
          : [(enemy as any).intent].filter(Boolean);
        
        intents.forEach((intent: any, idx: number) => {
          if (intent) {
            const intentKey = `${pendingEnemyAttackId}-${idx}`;
            setResolvedIntents((prev) => ({ ...prev, [intentKey]: Date.now() }));
            setTimeout(() => {
              setResolvedIntents((prev) => {
                const next = { ...prev };
                delete next[intentKey];
                return next;
              });
            }, 500);
          }
        });
      }
    }
    
    // Legacy: pulse after attack (fallback)
    const prevLastEnemyAttackNonce = Number(prev.lastEnemyAttackNonce ?? 0);
    if (
      !pendingEnemyAttackId &&
      String((b as any).meta?.lastEnemyAttackId ?? "") &&
      Number((b as any).meta?.lastEnemyAttackNonce ?? 0) > 0 &&
      Number((b as any).meta?.lastEnemyAttackNonce ?? 0) !== prevLastEnemyAttackNonce
    ) {
      setEnemyAttackPulseId(String((b as any).meta?.lastEnemyAttackId ?? ""));
      setTimeout(() => setEnemyAttackPulseId(null), 520);
    }


// Block gained (blue flash + shield sfx)
    if (currPlayerBlockNow > prev.playerBlock) {
      try { sfx.shield(); } catch {}
      setPlayerBlockFlash(true);
      setTimeout(() => setPlayerBlockFlash(false), 170);
    }

    // Fully blocked attack (stronger blue flash)
    // Heuristic: an enemy turn happened (turn advanced), prev intent > 0, HP unchanged, but block went down
    if (
      currTurn > prev.turn &&
      prev.intentSum > 0 &&
      currPlayerHP === prev.playerHP &&
      currPlayerBlockNow < prev.playerBlock
    ) {
      try { sfx.block(); } catch {}
      setPlayerFullBlockFlash(true);
      setTimeout(() => setPlayerFullBlockFlash(false), 220);
    }

    // Block partially broke (you had block, but damage still reached HP) -> red flash on Block badge
    if (
      currTurn > prev.turn &&
      prev.intentSum > 0 &&
      prev.playerBlock > 0 &&
      currPlayerHP < prev.playerHP
    ) {
      try { sfx.shieldBreak(); } catch {}
      setPlayerBlockBreakFlash(true);
      setTimeout(() => setPlayerBlockBreakFlash(false), 220);
    }

    // Enemy damage/death
    const currEnemyHP: Record<string, number> = Object.fromEntries(
      enemies.map((e: any) => [e.id, Number(e.hp ?? 0)])
    );
    
    // Enemy block tracking
    const currEnemyBlock: Record<string, number> = Object.fromEntries(
      enemies.map((e: any) => [e.id, Number(e.block ?? 0)])
    );

    let didAnyEnemyTakeDamage = false;
    
    // Track enemy block changes for flashing
    for (const id of Object.keys(currEnemyBlock)) {
      const before = prev.enemyBlock[id] ?? 0;
      const now = currEnemyBlock[id] ?? 0;
      
      if (now > before) {
        // Block gained - blue flash
        try { sfx.shield(); } catch {} // Sound effect for enemy gaining block
        setEnemyBlockFlash((m) => ({ ...m, [id]: "gain" }));
        setTimeout(() => {
          setEnemyBlockFlash((m) => {
            const next = { ...m };
            delete next[id];
            return next;
          });
        }, 170);
      } else if (now < before) {
        if (before > 0 && now === 0) {
          // Block fully broken - red flash
          setEnemyBlockFlash((m) => ({ ...m, [id]: "break" }));
          setTimeout(() => {
            setEnemyBlockFlash((m) => {
              const next = { ...m };
              delete next[id];
              return next;
            });
          }, 220);
        } else if (before > 0) {
          // Block lost (but not fully broken) - orange flash
          setEnemyBlockFlash((m) => ({ ...m, [id]: "lose" }));
          setTimeout(() => {
            setEnemyBlockFlash((m) => {
              const next = { ...m };
              delete next[id];
              return next;
            });
          }, 170);
        }
      }
    }

    // Check for multi-hit damage events for enemies
    const enemyDamageEvents = damageEvents.filter((e: any) => {
      if (e.target === "player") return false;
      // Only process events we haven't seen before
      const eventId = `${e.target}-${e.timestamp}-${e.amount}`;
      return !prev.processedDamageEvents.has(eventId);
    });
    const enemyDamageByTarget: Record<string, Array<{ amount: number; timestamp: number }>> = {};
    let processedAnyEnemyEvents = false;
    enemyDamageEvents.forEach((event: any) => {
      if (!enemyDamageByTarget[event.target]) enemyDamageByTarget[event.target] = [];
      enemyDamageByTarget[event.target].push(event);
      const eventId = `${event.target}-${event.timestamp}-${event.amount}`;
      prev.processedDamageEvents.add(eventId);
      processedAnyEnemyEvents = true;
    });

    // Heal events for enemies (green popups), including cases where heal and damage happen in the same update.
    const enemyHealEvents = (healEvents ?? []).filter((e: any) => {
      if (!e || e.target === "player") return false;
      const eventId = `${String(e.target)}-heal-${e.timestamp}-${e.amount}`;
      return !prev.processedHealEvents.has(eventId);
    });

    const enemyHealByTarget: Record<string, Array<{ amount: number; timestamp: number }>> = {};
    enemyHealEvents.forEach((event: any) => {
      const tid = String(event.target);
      if (!enemyHealByTarget[tid]) enemyHealByTarget[tid] = [];
      enemyHealByTarget[tid].push(event);
      const eventId = `${tid}-heal-${event.timestamp}-${event.amount}`;
      prev.processedHealEvents.add(eventId);
      processedAnyHealEvents = true;
    });
    
    for (const id of Object.keys(currEnemyHP)) {
      const before = prev.enemyHP[id] ?? currEnemyHP[id];
      const now = currEnemyHP[id];
      const hitsForThisEnemy = enemyDamageByTarget[id] ?? [];
      const healsForThisEnemy = enemyHealByTarget[id] ?? [];

      // took damage (still alive)
      if (now > 0 && now < before) {
        didAnyEnemyTakeDamage = true;
        try { sfx.hit(); } catch {}
        setEnemyHitFlash((m) => ({ ...m, [id]: Date.now() }));
        setTimeout(() => {
          setEnemyHitFlash((m) => {
            const next = { ...m };
            delete next[id];
            return next;
          });
        }, 140);
        
        if (hitsForThisEnemy.length > 0) {
          // Multi-hit: spawn popups for each hit with delays
          hitsForThisEnemy.forEach((event: any, idx: number) => {
            setTimeout(() => {
              try { sfx.hit(); } catch {} // Sound effect for each hit
              spawnDmgPopup(id, event.amount, idx);
            }, idx * 250); // 250ms delay between each hit (slower)
          });
        } else {
          // Single hit: use legacy behavior
          spawnDmgPopup(id, Math.max(0, before - now));
        }
      }

      // healed this update (still alive)
      if (now > 0 && (healsForThisEnemy.length > 0 || now > before)) {
        if (healsForThisEnemy.length > 0) {
          healsForThisEnemy.forEach((event: any, idx: number) => {
            setTimeout(() => {
              spawnDmgPopup(id, Math.max(0, Math.floor(Number(event.amount ?? 0))), idx, "heal");
            }, idx * 200);
          });
        } else if (now > before) {
          spawnDmgPopup(id, Math.max(0, now - before), 0, "heal");
        }
      }

      // died this update
      if (before > 0 && now <= 0) {
        try { sfx.poof(); } catch {}
        setRecentlyDead((m) => ({ ...m, [id]: Date.now() }));
        setTimeout(() => {
          setRecentlyDead((m) => {
            const next = { ...m };
            delete next[id];
            return next;
          });
        }, 260);
      }
    }

    // Small screen shake when enemies take damage (so hits feel punchy)
    if (didAnyEnemyTakeDamage) {
      triggerShake(160);
    }

    // Wrong answer thud ONLY if it didn't already hurt you (prevents double “bad” feel)
    if (lastResultKey && lastResultKey !== prev.lastResultKey && b.lastResult) {
      if (!b.lastResult.correct) {
        if (!didPlayerTakeDamage) {
          try { sfx.bad(); } catch {}
        }
      }
      // Correct answer sound intentionally omitted (hit/shield already covers feedback)
    }

    // Clear processed damage events immediately after processing to prevent double processing
    // (popups will still spawn from the setTimeout calls above)
    if (processedAnyPlayerEvents || processedAnyEnemyEvents || processedAnyHealEvents) {
      const meta: any = { ...(b as any).meta };
      meta.damageEvents = [];
      meta.healEvents = [];
      props.onUpdate({ ...b, meta } as any);
    }
    
    prevRef.current = {
      turn: currTurn,
      intentSum: currIntentSum,
      playerHP: currPlayerHP,
      playerBlock: Number((b as any).playerBlock ?? 0),
      enemyHP: currEnemyHP,
      lastResultKey: lastResultKey ?? prev.lastResultKey,
      healFlashNonce,
      statusFlashKey,
      lastEnemyAttackId: String((b as any).meta?.lastEnemyAttackId ?? ""),
      lastEnemyAttackNonce: Number((b as any).meta?.lastEnemyAttackNonce ?? 0),
      pendingEnemyAttackId: String((b as any).meta?.pendingEnemyAttackId ?? ""),
      processedDamageEvents: prev.processedDamageEvents,
      processedHealEvents: prev.processedHealEvents,
      processedNegativeEvents: prev.processedNegativeEvents,
      enemyBlock: currEnemyBlock,
      energyDrainNonce,
      handDiscardFlashNonce,
      handDiscardFlashCardId,
      blockedNegativeCardNonce,
    };
  }, [b.turn, incomingIntent, b.playerHP, (b as any).playerBlock, enemyHpKey, lastResultKey, enemies, healFlashNonce, statusFlashKey, negativeCardEventsKey, blockedNegativeCardNonce, blockedNegativeCardByEnemyId, energyDrainNonce, handDiscardFlashNonce, handDiscardFlashCardId, Number((b as any).meta?.healEvents?.length ?? 0), (b as any).meta?.lastEnemyAttackId, (b as any).meta?.lastEnemyAttackNonce]);

  // Cleanse: when it fires, flash each removed debuff chip in a clearly visible sequence.
  useEffect(() => {
    const nonce = Number((b as any).meta?.cleanseFlashNonce ?? 0);
    if (!nonce || nonce === lastCleanseFlashNonceRef.current) return;
    lastCleanseFlashNonceRef.current = nonce;

    const enemyId = String((b as any).meta?.cleanseFlashEnemyId ?? "");
    const ids = Array.isArray((b as any).meta?.cleanseFlashStatusIds) ? ((b as any).meta?.cleanseFlashStatusIds as string[]) : [];
    if (!enemyId || ids.length <= 0) return;

    try { sfx.buff(); } catch {}
    ids.forEach((sid, i) => {
      window.setTimeout(() => {
        setEnemyStatusProcFlash({ enemyId, statusId: String(sid) });
        window.setTimeout(() => setEnemyStatusProcFlash(null), 520);
      }, i * 140);
    });
  }, [Number((b as any).meta?.cleanseFlashNonce ?? 0)]);

  // Scheduled hand exhaust TRIGGER: distinct audio cue (separate from the scheduling cue).
  useEffect(() => {
    const nonce = Number((b as any).meta?.pendingHandExhaustTriggerNonce ?? 0);
    if (!nonce || nonce === lastPendingHandExhaustTriggerNonceRef.current) return;
    lastPendingHandExhaustTriggerNonceRef.current = nonce;

    // Strong, obvious cue when a card is exhausted from hand.
    try { sfx.poof(); } catch {}

    // Optionally also flash the player curse glow (reuses existing visual language).
    setPlayerCurseFlash(true);
    window.setTimeout(() => setPlayerCurseFlash(false), 650);
  }, [Number((b as any).meta?.pendingHandExhaustTriggerNonce ?? 0)]);

  // Defensive Desk: flash shield + defended phone icons when a redirect happens.
  useEffect(() => {
    const nonce = Number((b as any).meta?.deskShieldHitNonce ?? 0);
    if (!nonce) return;
    const phoneId = String((b as any).meta?.deskShieldHitPhoneId ?? "");
    const deskId = String((b as any).meta?.deskShieldHitDeskId ?? "defensive_desk");
    if (!phoneId) return;

    setEnemyStatusProcFlash({ enemyId: deskId, statusId: "desk_phone_shield" });
    window.setTimeout(() => setEnemyStatusProcFlash(null), 650);

    try { sfx.block(); } catch {}

    window.setTimeout(() => {
      setEnemyStatusProcFlash({ enemyId: phoneId, statusId: "desk_phone_defended" });
      window.setTimeout(() => setEnemyStatusProcFlash(null), 650);
    }, 80);
  }, [Number((b as any).meta?.deskShieldHitNonce ?? 0)]);

  // Defensive Desk: ensure a phone is always defended whenever desk + any phone are alive.
  useEffect(() => {
    const enemies0 = (b.enemies ?? []) as any[];
    const deskAlive = enemies0.some((e) => String(e?.id ?? "") === "defensive_desk" && (e?.hp ?? 0) > 0);
    if (!deskAlive) return;
    const phoneIds = ["smartphone_a", "smartphone_b", "smartphone_c"];
    const alivePhones = enemies0.filter((e) => phoneIds.includes(String(e?.id ?? "")) && (e?.hp ?? 0) > 0);
    if (alivePhones.length === 0) {
      const defendedId0 = String((b as any).meta?.deskShieldTargetId ?? "");
      if (defendedId0) {
        const meta2: any = { ...((b as any).meta ?? {}), deskShieldTargetId: null };
        props.onUpdate({ ...(b as any), meta: meta2 } as any);
      }
      return;
    }

    const defendedId = String((b as any).meta?.deskShieldTargetId ?? "");
    const defendedAlive = defendedId && alivePhones.some((p) => String(p?.id ?? "") === defendedId);
    if (defendedAlive) return;

    const aliveSet = new Set(alivePhones.map((p) => String(p?.id ?? "")));
    const pick = aliveSet.has("smartphone_a")
      ? "smartphone_a"
      : aliveSet.has("smartphone_b")
        ? "smartphone_b"
        : "smartphone_c";

    const meta2: any = { ...((b as any).meta ?? {}), deskShieldTargetId: pick };
    props.onUpdate({ ...(b as any), meta: meta2 } as any);
  }, [
    (b.enemies ?? []).map((e: any) => `${String(e?.id ?? "")}:${Number(e?.hp ?? 0)}`).join("|"),
    String((b as any).meta?.deskShieldTargetId ?? ""),
  ]);

  // Minion death queue: UI delay + sound + flash, then apply hp=0 to queued minions.
  useEffect(() => {
    const q = ((b as any).meta?.minionDeathQueue ?? []) as Array<{ summonerId: string; minionIds: string[]; t: number }>;
    if (!Array.isArray(q) || q.length === 0) return;

    const head = q[0];
    if (!head || !Array.isArray(head.minionIds) || head.minionIds.length === 0) return;

    // Flash the first minion briefly (uses existing enemyStatusProcFlash)
    setEnemyStatusProcFlash({ enemyId: head.minionIds[0], statusId: "dies_with_summoner" });
    window.setTimeout(() => setEnemyStatusProcFlash(null), 900);

    // Death sound timed with collapse
    window.setTimeout(() => {
      try { sfx.poof(); } catch {}
    }, 900);

    // Apply kill + dequeue
    const killTimer = window.setTimeout(() => {
      const killSet = new Set(head.minionIds.map(String));
      const enemies2 = (b.enemies ?? []).map((e: any) => (killSet.has(String(e.id)) ? { ...e, hp: 0, block: 0 } : e));
      const meta2: any = { ...(b as any).meta };
      meta2.minionDeathQueue = q.slice(1);
      props.onUpdate({ ...(b as any), enemies: enemies2, meta: meta2 } as any);
    }, 1400);

    return () => {
      window.clearTimeout(killTimer);
    };
  }, [String((b as any).meta?.minionDeathQueue?.[0]?.t ?? ""), (b as any).meta?.minionDeathQueue?.length]);

  const forced = null;

  const topDiscardId = b.discardPile.length ? b.discardPile[b.discardPile.length - 1] : null;
  const topDiscardDef = topDiscardId ? cardById.get(topDiscardId) : null;
  const topDiscardDesc = topDiscardDef ? cardDescForUi(topDiscardDef as any) : "";

  const openPileModal = (kind: "draw" | "discard" | "exhaust") => {
    try { sfx.click(); } catch {}
    setOpenPile({ kind });
  };

  const closePileModal = () => setOpenPile(null);

  const pileModalTitle =
    openPile?.kind === "draw"
      ? `Draw Pile (${b.drawPile.length})`
      : openPile?.kind === "discard"
        ? `Discard Pile (${b.discardPile.length})`
        : openPile?.kind === "exhaust"
          ? `Exhaust Pile (${(b as any).exhaustPile?.length ?? 0})`
          : "";

  const pileIds: string[] = useMemo(() => {
    if (!openPile) return [];

    if (openPile.kind === "draw") {
      const ids = (b.drawPile ?? []).slice();
      return ids
        .slice()
        .sort((a, c) => {
          const an = (cardById.get(a)?.name ?? a).toLowerCase();
          const cn = (cardById.get(c)?.name ?? c).toLowerCase();
          return an.localeCompare(cn);
        });
    }

    if (openPile.kind === "discard") {
      return (b.discardPile ?? []).slice().reverse();
    }

    return (((b as any).exhaustPile ?? []) as string[]).slice().reverse();
  }, [openPile, b.drawPile, b.discardPile, (b as any).exhaustPile, cardById]);

  const draggingCardId = draggingIdx != null ? b.hand[draggingIdx] : null;
  const draggingDef = draggingCardId ? cardById.get(draggingCardId) : null;

  function statusTip(s: any): string {
    const id = typeof s?.id === "string" ? s.id : "";
    const def = getEffectDef(id);
    if (def && id === "desk_phone_shield") return `${def.name} — ${fixEffectTip(s, def.description)}`;
    if (def && id === "auto_strength" && typeof s?.stacks === "number") {
      return `${def.name} — At the start of its turn, gain Strength +${s.stacks}.`;
    }
    return def ? `${def.name} — ${def.description}` : String(s?.label ?? s?.id ?? "Status");
  }

  function statusIcon(s: any): string {
    const id = typeof s?.id === "string" ? s.id : "";
    const def = getEffectDef(id);
    return String(s?.icon ?? def?.icon ?? "✨");
  }

  function canPlay(cardTypeRaw: any, cost: number) {
    const cardType = normalizeType(cardTypeRaw);
    if (isOver) return false;
    if (awaiting) return false;
    if (isEnemyPhase) return false;
    if (b.energy < cost) return false;
    return true;
  }

  function stageCard(i: number) {
    if (awaiting || isOver || isEnemyPhase) return;
    if ((b as any).awaitingDiscard) return;
    const cardId = b.hand[i];
    if (!cardId) return;

    const def = cardById.get(cardId);
    if ((def as any)?.unplayable) return;
    const cost = cardCost(def);
    if (!canPlay(def?.type, cost)) return;

    try { sfx.select(); } catch {}
    setStagedHandIndex(i);
  }

  function playIndex(i: number) {
    if (awaiting || isOver || isEnemyPhase) return;
    if ((b as any).awaitingDiscard) return;
    const cardId = b.hand[i];
    if (!cardId) return;

    try {
    const def = cardById.get(cardId);
    if ((def as any)?.unplayable) return;
    const cost = cardCost(def);
    if (!canPlay(def?.type, cost)) return;

    const next = chooseCard(b, props.rng, cardId);
    props.onUpdate(next);

    setStagedHandIndex(null);
    setInput("");
    } catch (err) {
      console.error("Error playing card:", err, { cardId, index: i });
      // Don't update state if there's an error - keep the battle screen visible
    }
  }

  function submitAnswer() {
    if (!awaiting) return;
    try { sfx.confirm(); } catch {}
    try {
      const qKind = String((awaiting as any)?.question?.kind ?? "");

      // If debug skip questions is enabled, allow submitting with empty input.
      // For special interactive questions, the answer is encoded from the builder state.
      let answerInput: string;
      if (qKind === "boxplot_build") {
        const exp = (awaiting as any)?.question?.build?.expected;
        const expStr = exp ? `${Number(exp.min)},${Number(exp.q1)},${Number(exp.median)},${Number(exp.q3)},${Number(exp.max)}` : "";
        if (props.debugSkipQuestions && !String(input).trim()) {
          answerInput = expStr;
        } else {
          const v = boxplotBuild;
          answerInput = v ? `${Number(v.min)},${Number(v.q1)},${Number(v.median)},${Number(v.q3)},${Number(v.max)}` : expStr;
        }
      } else {
        answerInput = props.debugSkipQuestions ? String(input || (awaiting as any).question.answer) : String(input);
      }
      
      console.log("submitAnswer: Calling resolveCardAnswer", { 
        cardId: awaiting.cardId, 
        input: answerInput,
        battleState: b 
      });
      
      const next = resolveCardAnswer({ rng: props.rng, state: b, input: answerInput });
      
      console.log("submitAnswer: Got result from resolveCardAnswer", { 
        next,
        hasPlayerHP: typeof next?.playerHP === 'number',
        hasEnemies: Array.isArray(next?.enemies),
        hasHand: Array.isArray(next?.hand)
      });
      
      // Validate the result before updating
      if (!next || typeof next !== 'object') {
        console.error("submitAnswer: Invalid battle state returned", next);
        return; // Don't update if state is invalid
      }
      
      // Check for critical properties
      if (typeof next.playerHP !== 'number' || typeof next.playerMaxHP !== 'number') {
        console.error("submitAnswer: Battle state missing critical properties", next);
        return; // Don't update if critical properties are missing
      }
      
    props.onUpdate(next);
    setInput("");
    } catch (err) {
      console.error("Error submitting answer:", err, { battle: b, awaiting, error: err });
      // Don't update state if there's an error - keep the battle screen visible
    }
  }

  function endMyTurn() {
    if (awaiting) return;
    if (isOver) return;
    if (isEnemyPhase) return;
    if ((b as any).awaitingDiscard) return;

    try { sfx.click(); } catch {}

    // If an enemy timer is still running (shouldn't happen, but safe), clear it.
    if (enemyTimerRef.current != null) {
      window.clearTimeout(enemyTimerRef.current);
      enemyTimerRef.current = null;
    }

    // Start enemy phase (discard, end-of-turn ticks, etc)
    let cur = endPlayerTurn(b, props.rng);
    props.onUpdate(cur);
    setInput("");
    setStagedHandIndex(null);

    // If we entered enemy phase, step enemies one by one with a short delay so it doesn't feel instant.
    const phase = String((cur as any).meta?.phase ?? "PLAYER");
    if (phase !== "ENEMY") return;

    const step = () => {
      // Stop if battle ended
      if (cur.playerHP <= 0) return;
      const anyAlive = (cur.enemies ?? []).some((e: any) => Number(e.hp ?? 0) > 0);
      if (!anyAlive) return;

      const p = String((cur as any).meta?.phase ?? "PLAYER");
      if (p !== "ENEMY") return;

      // Set pending attack flag first (triggers pulse), then apply damage after delay
      const queue: string[] = Array.isArray((cur as any).meta?.enemyQueue) ? (cur as any).meta.enemyQueue : (cur.enemies ?? []).filter((e: any) => (e.hp ?? 0) > 0).map((e: any) => e.id);
      const idx = Math.max(0, Math.floor(Number((cur as any).meta?.enemyActIndex ?? 0)));
      
      if (idx < queue.length) {
        const enemyId = queue[idx];
        // Set pending flag to trigger pulse
        const metaWithPending: any = { ...(cur as any).meta, pendingEnemyAttackId: enemyId };
        cur = { ...cur, meta: metaWithPending };
        props.onUpdate(cur);
        
        // Apply damage after a short delay (allows pulse to show first)
        setTimeout(() => {
          cur = stepEnemyTurn(cur, props.rng);
          props.onUpdate(cur);
          
          const p2 = String((cur as any).meta?.phase ?? "PLAYER");
          if (p2 === "ENEMY") {
            const delay = 1100 + Math.floor(Math.random() * 500); // 1.1s–1.6s per enemy
            enemyTimerRef.current = window.setTimeout(step, delay);
          } else {
            enemyTimerRef.current = null;
          }
        }, 300); // 300ms delay for pulse
        return;
      }

      // One enemy attacks (or finishes the phase and draws the next hand)
      cur = stepEnemyTurn(cur, props.rng);
      props.onUpdate(cur);

    };

    enemyTimerRef.current = window.setTimeout(step, 900);
  }

function onDropPlayZone(e: React.DragEvent) {
    e.preventDefault();
    setDragOverPlayZone(false);

    const raw =
      e.dataTransfer.getData("application/x-hand-index") ||
      e.dataTransfer.getData("text/plain");

    const idx = Number(raw);
    if (!Number.isFinite(idx)) return;

    playIndex(idx);
    setDraggingIdx(null);
    clearDragImage();
  }

  // Drag image helpers
  const dragImgRef = useRef<HTMLElement | null>(null);

  function clearDragImage() {
    if (dragImgRef.current) {
      dragImgRef.current.remove();
      dragImgRef.current = null;
    }
  }

  function setRealCardDragImage(e: React.DragEvent<HTMLElement>, el: HTMLElement) {
    clearDragImage();

    const clone = el.cloneNode(true) as HTMLElement;
    clone.style.position = "fixed";
    clone.style.left = "-9999px";
    clone.style.top = "-9999px";
    clone.style.pointerEvents = "none";
    clone.style.opacity = "1";
    clone.style.transform = "none";
    clone.style.width = `${el.getBoundingClientRect().width}px`;
    clone.style.height = `${el.getBoundingClientRect().height}px`;

    document.body.appendChild(clone);
    dragImgRef.current = clone;

    e.dataTransfer.setDragImage(
      clone,
      Math.round(clone.getBoundingClientRect().width / 2),
      Math.round(clone.getBoundingClientRect().height / 2)
    );
  }

  const streak = (b as any).meta?.streak ?? 0;
  const streakBonusEnergy = (b as any).meta?.streakBonusEnergy ?? 0;
  const hasStreak = streak > 0;
  const isStreakMilestone = streak > 0 && streak % 5 === 0;

  const streakTooltip = hasStreak 
    ? `${streak} consecutive correct answer${streak !== 1 ? 's' : ''}!${streakBonusEnergy > 0 ? ` (+${streakBonusEnergy} bonus energy available)` : ''}${streak >= 5 ? ' Every 5 correct answers grants +1 bonus energy.' : ''}`
    : '';

  const StreakBadge = hasStreak ? (
    <span
      ref={streakBadgeRef}
      className="badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: blockBadgeStyle?.padding || "6px 10px",
        height: "fit-content",
        background: isStreakMilestone 
          ? "linear-gradient(135deg, rgba(255,215,0,0.25), rgba(255,140,0,0.25))"
          : "rgba(255,140,0,0.15)",
        boxShadow: isStreakMilestone 
          ? "0 0 0 2px rgba(255,215,0,0.6), 0 0 12px rgba(255,215,0,0.3)"
          : undefined,
        border: isStreakMilestone ? "1px solid rgba(255,215,0,0.5)" : "1px solid rgba(255,140,0,0.3)",
        transition: "all 200ms ease",
        cursor: "help",
      }}
      title={streakTooltip}
      onMouseEnter={(ev) => showFloatingTip(streakTooltip, ev)}
      onMouseMove={(ev) => showFloatingTip(streakTooltip, ev)}
      onMouseLeave={() => setIntentTip(null)}
    >
      <span style={{ fontSize: 14 }}>🔥</span>
      <strong>{streak}</strong>
      {streakBonusEnergy > 0 && <span style={{ marginLeft: 4, opacity: 0.9, fontSize: 12 }}>+{streakBonusEnergy}⚡</span>}
    </span>
  ) : null;

  // blockBadgeStyle is already defined above, don't redefine it

  const EnergyBadge = (
    <span
      className="badge"
      style={{
        width: 170,
        justifyContent: "center",
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        border: "1px solid rgba(255,255,255,0.20)",
        background: "rgba(120,140,255,0.12)",
      }}
      title="Energy (spent to play cards)"
    >
      <span style={{ fontSize: 16, transform: "translateY(-1px)" }}>⚡</span>
      <span style={{ fontWeight: 900 }}>
        {b.energy}/{b.maxEnergy}
      </span>
      <span style={{ display: "inline-flex", gap: 4, marginLeft: 2 }}>
        {Array.from({ length: b.maxEnergy }).map((_, i) => (
          <span
            key={i}
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.25)",
              background: i < b.energy ? "rgba(34,197,94,0.85)" : "rgba(255,255,255,0.08)",
              boxShadow: i < b.energy ? "0 0 0 2px rgba(34,197,94,0.12)" : "none",
            }}
          />
        ))}
      </span>
    </span>
  );

  const playZoneHint = (b as any).awaitingDiscard
    ? "Choose a card to discard (then confirm)."
    : awaiting
      ? "Submit your answer below."
    : draggingIdx != null
      ? (dragOverPlayZone ? "Release to play" : "Drag here to play")
      : "Drop a card here to play it";

  const playerSpriteWrapStyle: React.CSSProperties = {
    borderRadius: 14,
    boxShadow: playerHitFlash
      ? "0 0 0 2px rgba(255,80,80,0.7)"
      : playerHealFlash
        ? "0 0 0 3px rgba(80,255,140,0.85)"
        : playerFullBlockFlash
        ? "0 0 0 3px rgba(80,170,255,0.85)"
        : playerBlockFlash
          ? "0 0 0 2px rgba(80,170,255,0.55)"
          : "none",
    filter: playerHitFlash ? "saturate(1.4) brightness(1.2)" : "none",
    transition: "box-shadow 120ms ease, filter 120ms ease",
  };

  // Defensive checks for required battle state properties
  if (typeof b.playerHP !== 'number' || typeof b.playerMaxHP !== 'number') {
    console.error("BattleScreen: Invalid player HP values", { playerHP: b.playerHP, playerMaxHP: b.playerMaxHP });
    return (
      <div className="container">
        <div className="panel">
          <h2>Error</h2>
          <p>Battle state has invalid HP values. Please return to the overworld.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`container battleLayout${screenShake ? " screenShake" : ""}`}>
      {battleLogOpen &&
        createPortal(
          <Rnd
            bounds="window"
            size={{ width: battleLogBox.w, height: battleLogBox.h }}
            position={{ x: battleLogBox.x, y: battleLogBox.y }}
            minWidth={280}
            minHeight={180}
            onDragStop={(_, d) => setBattleLogBox((box) => ({ ...box, x: d.x, y: d.y }))}
            onResizeStop={(_, __, ref, ___, pos) =>
              setBattleLogBox({ x: pos.x, y: pos.y, w: ref.offsetWidth, h: ref.offsetHeight })
            }
            style={{ zIndex: 99999 }}
          >
            <div className="panel" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 900 }}>Battle Log</div>
                <button className="btn btn-sm" onClick={() => setBattleLogOpen(false)}>
                  Close
                </button>
              </div>

              <div
                style={{
                  marginTop: 10,
                  overflow: "auto",
                  flex: 1,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: 12,
                  lineHeight: 1.35,
                  whiteSpace: "pre-wrap",
                  opacity: 0.92,
                }}
              >
                {(((b as any).meta?.battleLog ?? []) as Array<{ t: number; turn: number; text: string }>).length === 0 ? (
                  <div className="muted">No events yet.</div>
                ) : (
                  (((b as any).meta?.battleLog ?? []) as Array<{ t: number; turn: number; text: string }>).map((e, idx) => {
                    const text = String(e.text ?? "");

                    // Lightweight “semantic” coloring by common log phrases.
                    // We only color the number itself, not the whole phrase.
                    const colorize = (s: string) => {
                      const out: React.ReactNode[] = [];
                      let rest = s;

                      // Order matters (more specific first)
                      const rules: Array<{ re: RegExp; cls: string }> = [
                        { re: /(\d+)\s*(?:dmg|damage)\b/i, cls: "logDmg" },
                        { re: /(\d+)\s*blocked\b/i, cls: "logBlock" },
                        { re: /(\d+)\s*block\b/i, cls: "logBlock" },
                        { re: /(\d+)\s*heal\b/i, cls: "logHeal" },
                        { re: /(\d+)\s*cursed\b/i, cls: "logCurse" },
                        { re: /(\d+)\s*strength\b/i, cls: "logBuff" },
                        { re: /(\d+)\s*(?:poison)\b/i, cls: "logDebuff" },
                        { re: /(\d+)\s*(?:weak)\b/i, cls: "logDebuff" },
                        { re: /(\d+)\s*(?:vulnerable)\b/i, cls: "logDebuff" },
                      ];

                      while (rest.length > 0) {
                        let best: { idx: number; m: RegExpExecArray; cls: string } | null = null;
                        for (const r of rules) {
                          const m = r.re.exec(rest);
                          if (m && (best == null || m.index < best.idx)) best = { idx: m.index, m, cls: r.cls };
                        }
                        if (!best) {
                          out.push(rest);
                          break;
                        }

                        if (best.idx > 0) out.push(rest.slice(0, best.idx));
                        const full = best.m[0];
                        const num = best.m[1];
                        const beforeNumIdx = full.toLowerCase().indexOf(String(num).toLowerCase());
                        const afterNumIdx = beforeNumIdx + String(num).length;
                        out.push(full.slice(0, beforeNumIdx));
                        out.push(
                          <span key={`${e.t}-${idx}-${out.length}`} className={best.cls}>
                            {num}
                          </span>
                        );
                        out.push(full.slice(afterNumIdx));
                        rest = rest.slice(best.idx + full.length);
                      }
                      return out;
                    };

                    return (
                      <div key={`${e.t}-${idx}`}>
                        <span style={{ opacity: 0.75 }}>T{e.turn}:</span> {colorize(text)}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </Rnd>,
          document.body
        )}
      <div className="battleMain">
        <div className="grid two">
          {/* Player */}
          <div
            className="panel"
            style={
              playerCurseFlash
                ? {
                    boxShadow: "0 0 0 3px rgba(239,68,68,0.45), 0 0 18px rgba(239,68,68,0.18)",
                    borderColor: "rgba(239,68,68,0.45)",
                    transition: "box-shadow 120ms ease, border-color 120ms ease",
                  }
                : undefined
            }
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={playerSpriteWrapStyle}>
                  <SpriteView sprite={(b as any).playerSprite} fallbackEmoji="🧑‍🎓" alt={b.playerName || "Player"} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {b.playerName ?? "Player"}
                  </div>
                </div>
              </div>
            </div>

            <div className="enemyCard" style={{ marginTop: 16 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div className="muted">HP</div>
                  <div>
                    <strong>{b.playerHP}</strong> / {playerMax}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0 }}>
                  {StreakBadge}
                  <span className="badge" style={blockBadgeStyle}>
                    <span aria-hidden style={{ marginRight: 6 }}>🛡</span>
                    Block <strong>{b.playerBlock}</strong>
                  </span>
                </div>
              </div>
              <div className="bar" style={{ marginTop: 6, position: "relative", overflow: "visible" }}>
                {dmgPopups.filter((p) => p.target === "player").map((p) => (
                  <div
                    key={p.id}
                    className={p.kind === "heal" ? "healPopup" : "dmgPopup"}
                    style={{
                      top: `${-44 - (p.index * 15)}px`,
                      bottom: "auto",
                    }}
                  >
                    {p.kind === "heal" ? `+${p.amount}` : `-${p.amount}`}
                  </div>
                ))}
                <div className="barFill" style={{ width: `${pct(b.playerHP, playerMax)}%` }} />
              </div>

              <div className="statusRow" style={{ marginTop: 10 }}>
                {/* If Regen just ticked and the stack dropped to 0, render a brief "ghost" chip so the flash is still visible. */}
                {regenIconFlash && !((b as any).playerStatuses ?? []).some((s: any) => s.id === "regen") && (
                  <div
                    className="statusChip statusChipHealFlash"
                    data-tip={statusTip({ id: "regen" } as any)}
                    title={statusTip({ id: "regen" } as any)}
                  >
                    <span className="statusIcon" aria-hidden>{statusIcon({ id: "regen" } as any)}</span>
                  </div>
                )}

                {((b as any).playerStatuses ?? []).map((s: any, i: number) => (
                  <div
                    key={s.id ?? i}
                    className={`statusChip${regenIconFlash && s.id === "regen" ? " statusChipHealFlash" : ""}`}
                    data-tip={fixEffectTip(s, statusTip(s))}
                    title={fixEffectTip(s, statusTip(s))}
                  >
                    <span className="statusIcon" aria-hidden>{statusIcon(s)}</span>
                    {typeof s.stacks === "number" && <span className="statusStacks">{s.stacks}</span>}
                  </div>
                ))}
              </div>

              {forced && !isOver && (
                <div style={{ marginTop: 12 }}>
                  <span className={"badge " + (forced === "ATTACK" ? "good" : "warn")}>
                    Forced: <strong>{forced}</strong>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Enemies */}
          <div className="panel" style={{ position: "relative" }}>
            {isOver && showOutcomeOverlay && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                  zIndex: 5,
                  pointerEvents: "none",
                }}
              >
                <div
                  className="panel soft"
                  style={{
                    width: "min(520px, 92%)",
                    pointerEvents: "auto",
                    textAlign: "center",
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(0,0,0,0.92)",
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 900 }}>
                    {victory ? "Victory ✅" : "Defeat ❌"}
                  </div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    {victory ? "Nice work — collect your reward." : "Try again when you’re ready."}
                  </div>

                  <div style={{ marginTop: 14, display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
                    <button
                      className={"btn " + (victory ? "primary" : "danger")}
                      onClick={() => {
                        const gold = 0; // Gold rewards are handled on the Reward screen
                        props.onEnd(victory, gold, b.playerHP, (b as any).meta?.skipRewards ?? false);
                      }}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              </div>
            )}

            {(() => {
              const visible = (enemies ?? []).filter((en: any) => {
                const alive = (en?.hp ?? 0) > 0;
                const deathPop = recentlyDead[en?.id] != null;
                return alive || deathPop;
              });

              // Special-case layout: keep summoners pinned top-right once they have spawned anything.
              const hasLiveMinionBySummonerId = new Map<string, boolean>();
              for (const e of visible as any[]) {
                const sid = String((e as any)?.summonerId ?? "");
                if (sid && (e as any).hp > 0) hasLiveMinionBySummonerId.set(sid, true);
              }
              const pinnedSummoners = (visible as any[]).filter((e) => hasLiveMinionBySummonerId.get(String((e as any)?.id ?? "")));
              const binder = visible.find((x: any) => String(x?.id ?? "") === "possessed_binder");
              const primaryPinned = (binder as any) ?? pinnedSummoners[0];
              const pinned = !!primaryPinned && visible.length > 1;

              // Visual "front row" ordering:
              // We want summons/minions to appear lower (closer to the player). With a 2-col grid,
              // simply sorting isn't enough when there are 2 cards (they'll still be on the top row).
              const cols = visible.length > 1 ? 2 : 1;
              const back = visible.filter((x: any) => !(x as any).frontRow);
              const front = visible.filter((x: any) => (x as any).frontRow);

              // Ensure the first front-row enemy starts on a new row by padding with an invisible spacer.
              const padCount = front.length > 0 ? ((cols - (back.length % cols)) % cols) : 0;
              let ordered: Array<any> = [...back, ...Array.from({ length: padCount }).map((_, i) => ({ __spacer: true, id: `spacer_${i}` })), ...front];

              if (pinned && cols === 2) {
                const pinId = String((primaryPinned as any)?.id ?? "");
                const others = ordered.filter((x: any) => !(x as any)?.__spacer && String(x?.id ?? "") !== pinId);
                const topLeft = others[0] ?? { __spacer: true, id: "spacer_pinned_left" };
                const rest = others.slice(1);
                ordered = [topLeft, primaryPinned, ...rest];
              }

              return (
                <div
                  className="enemyGrid"
                  style={{
                    display: "grid",
                    gap: 12,
                    gridTemplateColumns: cols > 1 ? "repeat(2, minmax(0, 1fr))" : "1fr",
                  }}
                >
                  {ordered.map((en: any) => {
                    if ((en as any).__spacer) {
                      return <div key={(en as any).id} style={{ visibility: "hidden", pointerEvents: "none" }} />;
                    }
                    const alive = (en.hp ?? 0) > 0;
                    const hpPct = pct(Number(en.hp ?? 0), Number(en.maxHP ?? 1));
                    const baseStatuses = (en.statuses ?? []) as any[];

                    // --- Desk/Phone UX chips (computed, not stored on enemy) ---
                    const deskAlive = (enemies ?? []).some((x: any) => String(x?.id ?? "") === "defensive_desk" && (x?.hp ?? 0) > 0);
                    const defendedId = String((b as any).meta?.deskShieldTargetId ?? "");
                    const isPhone = String(en.id ?? "").startsWith("smartphone_");
                    const phoneIds = ["smartphone_a", "smartphone_b", "smartphone_c"];
                    const alivePhones = (enemies ?? []).filter((x: any) => phoneIds.includes(String(x?.id ?? "")) && (x?.hp ?? 0) > 0);
                    const anyPhoneAlive = alivePhones.length > 0;
                    const isLastPhone = isPhone && alivePhones.length === 1;

                    const computed: any[] = [];
                    if (String(en.id) === "defensive_desk" && anyPhoneAlive) {
                      computed.push({ id: "desk_phone_shield", stacks: 1 });
                    }
                    if (isPhone) {
                      computed.push({ id: "phone_last_alive", stacks: 1 });
                      if (deskAlive && anyPhoneAlive && defendedId && defendedId === String(en.id)) {
                        computed.push({ id: "desk_phone_defended", stacks: 1 });
                      }
                    }

                    const statuses = (() => {
                      const merged = [...computed, ...baseStatuses];
                      const seen = new Set<string>();
                      const out: any[] = [];
                      for (const s of merged) {
                        const id = String(s?.id ?? "");
                        if (!id) continue;
                        if (seen.has(id)) continue;
                        seen.add(id);
                        out.push(s);
                      }
                      return out;
                    })();

                const flashing = enemyHitFlash[en.id] != null;
                const deathPop = recentlyDead[en.id] != null;

                const spriteWrapStyle: React.CSSProperties = {
                  borderRadius: 14,
                  boxShadow: flashing ? "0 0 0 2px rgba(255,80,80,0.75)" : "none",
                  filter: flashing ? "saturate(1.6) brightness(1.2)" : "none",
                  transition: "box-shadow 120ms ease, filter 120ms ease",
                };

                return (
                  <div
                    key={en.id}
                    className={"enemyCard cardTile " + (alive && !isOver ? "cardPlayable" : "cardDisabled")}
                    onMouseEnter={() => {
                      if (!alive || isOver) return;
                      if (lastEnemyHoverIdRef.current === en.id) return;
                      lastEnemyHoverIdRef.current = en.id;
                      try { sfx.cardHover(); } catch {}
                    }}
                    onMouseLeave={() => {
                      if (lastEnemyHoverIdRef.current === en.id) lastEnemyHoverIdRef.current = null;
                    }}
                    onClick={
                      !alive || isOver
                        ? undefined
                        : () => {
                            try { sfx.select(); } catch {}
                            props.onUpdate({ ...(b as any), selectedEnemyId: en.id } as any);
                          }
                    }
                    style={{
                      cursor: !alive || isOver ? "default" : "pointer",
                      transform: enemyAttackPulseId === en.id ? "scale(1.04)" : "scale(1)",
                      boxShadow: enemyAttackPulseId === en.id ? "0 0 0 3px rgba(255,255,255,0.28)" : undefined,
                      outline:
                        alive && en.id === (b as any).selectedEnemyId
                          ? "2px solid rgba(255,255,255,0.65)"
                          : "none",
                      outlineOffset: 2,
                      transition: "transform 160ms ease, box-shadow 160ms ease, outline 120ms ease, filter 120ms ease",
                      pointerEvents: alive ? "auto" : "none",
                      filter: deathPop ? "grayscale(0.9) brightness(0.9)" : undefined,
                    }}
                  >
                    <div className="row" style={{ justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexDirection: "row-reverse" }}>
                        <div 
                          style={{ position: "relative" }}
                          onClick={(ev) => ev.stopPropagation()} // Prevent card selection when clicking sprite
                        >
                          <div 
                            style={spriteWrapStyle}
                            data-tip={`${en.name ?? "Enemy"}`}
                            title={`${en.name ?? "Enemy"}`}
                            className="tip"
                          >
                            <SpriteView sprite={en.sprite} fallbackEmoji="👾" alt={en.name || "Enemy"} />
                          </div>

                          {deathPop && (
                            <div
                              aria-hidden
                              style={{
                                position: "absolute",
                                inset: -6,
                                display: "grid",
                                placeItems: "center",
                                fontSize: 22,
                                filter: "none",
                              }}
                            >
                              💥
                            </div>
                          )}
                        </div>

                        <div
                          style={{
                            fontWeight: 900,
                            whiteSpace: "normal",
                            overflow: "visible",
                            textOverflow: "clip",
                            wordBreak: "break-word",
                            lineHeight: 1.05,
                            fontSize: 13,
                            textAlign: "right",
                          }}
                        >
                          {en.name ?? "Enemy"}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                        {/* Intent indicator - aligned left above block */}
                        <div className="enemyIntent" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {/* New intent indicator - supports multiple intents */}
                          {(() => {
                            try {
                              const intents = ((en as any).intents && Array.isArray((en as any).intents) && (en as any).intents.length > 1)
                                ? (en as any).intents
                                : [(en as any).intent].filter(Boolean);
                              
                              if (!intents || intents.length === 0) return null;
                              
                              return intents
                                .map((intent: any, idx: number) => {
                                  if (!intent) return null;
                                  
                                  const intentKind = intent.kind ?? "ATTACK";
                                  const icon = (() => {
                                    if (intentKind !== "DEBUFF") return getIntentIcon(intentKind);
                                    const sid = String((intent as any).statusId ?? "");
                                    if (sid === "poison") return "☠";
                                    if (sid === "weak") return "🪶";
                                    if (sid === "vulnerable") return "🎯";
                                    return "☠";
                                  })();
                                  const value = getIntentValue(intent, b.playerStatuses, en.statuses);
                                  const description = getIntentDescription(intent, b.playerStatuses, en.statuses, { enemy: en, battle: b });
                                  const enemyName = String((en as any)?.name ?? "Enemy");
                                  const tooltip = `${enemyName} intends to ${description}`;
                                  const intentKey = `${en.id}-${idx}`;
                                  const isFlashing = resolvedIntents[intentKey] !== undefined;
                                  const borderColor = isFlashing 
                                    ? getIntentFlashColor(intentKind)
                                    : getIntentColor(intentKind);
                                  
                          return (
                                    <div
                              key={idx}
                                      style={{ 
                                        display: "inline-block", 
                                        position: "relative",
                                        cursor: "help",
                                        zIndex: 10,
                                        pointerEvents: "auto"
                                      }}
                                      title={tooltip}
                                      onMouseEnter={(ev) => {
                                        ev.stopPropagation();
                                        showFloatingTip(tooltip, ev);

                                        if (intentKind === "CLEANSE_SELF") {
                                          // Hovering Cleanse: smooth glow-pulse highlight on her debuffs.
                                          setCleanseHoverEnemyId(String(en.id));
                                        }
                                      }}
                                      onMouseMove={(ev) => {
                                        ev.stopPropagation();
                                        showFloatingTip(tooltip, ev);
                                      }}
                                      onMouseLeave={(ev) => {
                                        ev.stopPropagation();
                                        setIntentTip(null);

                                        // Stop cleanse hover pulsing
                                        if (intentKind === "CLEANSE_SELF") {
                                          cleanseHoverEnemyIdRef.current = null;
                                          if (cleanseHoverIntervalRef.current != null) {
                                            window.clearInterval(cleanseHoverIntervalRef.current);
                                            cleanseHoverIntervalRef.current = null;
                                          }
                                          setCleanseHoverEnemyId(null);
                                        }
                                      }}
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        ev.preventDefault();
                                      }}
                                    >
                                      <span
                                        className="badge"
                                        style={{
                                          borderColor,
                                          cursor: "help",
                                          position: "relative",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: 6,
                                          transition: isFlashing ? "box-shadow 200ms ease, border-color 200ms ease" : "border-color 200ms ease",
                                          boxShadow: isFlashing ? `0 0 0 3px ${borderColor}` : "none",
                                        }}
                            >
                                        <span aria-hidden style={{ fontSize: 16 }}>{icon}</span>
                                        <strong>{value}</strong>
                            </span>
                                    </div>
                          );
                        })
                                .filter((item: any) => item !== null);
                            } catch (err) {
                              console.error("Error rendering intents:", err);
                              return null;
                            }
                          })()}
                        </div>

                        {/* Block and HP row */}
                        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                          {(() => {
                            const blockAmount = Number(en.block ?? 0);
                            const flashType = enemyBlockFlash[en.id];
                            const flashStyle: React.CSSProperties = flashType === "gain"
                              ? {
                                  boxShadow: "0 0 0 2px rgba(59,130,246,0.7)",
                                  border: "1px solid rgba(59,130,246,0.55)",
                                }
                              : flashType === "lose"
                              ? {
                                  boxShadow: "0 0 0 2px rgba(245,158,11,0.7)",
                                  border: "1px solid rgba(245,158,11,0.55)",
                                }
                              : flashType === "break"
                              ? {
                                  boxShadow: "0 0 0 3px rgba(239,68,68,0.85)",
                                  border: "1px solid rgba(239,68,68,0.75)",
                                }
                              : {};
                            
                            return (
                        <span
                                className="badge" 
                                style={{ 
                                  display: "inline-flex", 
                                  alignItems: "center", 
                                  gap: 6,
                                  transition: flashType ? "box-shadow 170ms ease, border 170ms ease" : "none",
                                  ...flashStyle,
                                }}
                        >
                                <span aria-hidden style={{ marginRight: 6 }}>🛡</span>
                                Block <strong>{blockAmount}</strong>
                        </span>
                            );
                          })()}
                          <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginLeft: "auto" }}>
                        <div className="muted">HP</div>
                        <div>
                          <strong>{Number(en.hp ?? 0)}</strong> / {Number(en.maxHP ?? enemyMax)}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="bar" style={{ marginTop: 6, position: "relative", overflow: "visible" }}>
                        {dmgPopups.filter((p) => p.target === en.id).map((p) => (
                          <div 
                            key={p.id} 
                            className={p.kind === "heal" ? "healPopup" : "dmgPopup"}
                            style={{ 
                              top: `${-44 - (p.index * 50)}px`, // Stack vertically upward, first hit at -44px
                              bottom: "auto"
                            }}
                          >
                            {p.kind === "heal" ? `+${p.amount}` : `-${p.amount}`}
                          </div>
                        ))}
                        <div className="barFill" style={{ width: `${hpPct}%` }} />
                      </div>
                    </div>

                    <div className="statusRow" style={{ marginTop: 10 }}>
                      {statuses.map((s, i) => (
                        <div
                          key={s.id ?? i}
                          className={
                            `statusChip${regenIconFlash && s.id === "regen" ? " statusChipHealFlash" : ""}` +
                            `${enemyStatusProcFlash && enemyStatusProcFlash.enemyId === en.id && enemyStatusProcFlash.statusId === s.id ? (String(s.id) === "toxic_immunity" ? " statusChipProcFlashGreen" : " statusChipProcFlash") : ""}` +
                            `${(String(s.id) === "desk_phone_shield" || String(s.id) === "desk_phone_defended") && anyPhoneAlive ? " statusChipShieldPulse" : ""}` +
                            `${String(s.id) === "phone_last_alive" && isLastPhone ? " statusChipShieldPulse" : ""}` +
                            `${cleanseHoverEnemyId === String(en.id) && (String(s.id) === "poison" || String(s.id) === "weak" || String(s.id) === "vulnerable") ? " statusChipGlowPulse" : ""}`
                          }
                          title={statusTip(s)}
                          onMouseEnter={(ev) => showFloatingTip(statusTip(s), ev)}
                          onMouseMove={(ev) => showFloatingTip(statusTip(s), ev)}
                          onMouseLeave={() => setIntentTip(null)}
                        >
                          <span className="statusIcon" aria-hidden>{statusIcon(s)}</span>
                          {typeof s.stacks === "number" && <span className="statusStacks">{s.stacks}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
                  })}
                </div>
              );
            })()}
          </div>
        </div>

        {/* PLAY / QUESTION */}
        <div className="panel soft">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{awaiting ? "Question" : ""}</div>
          </div>

          {awaiting ? (
            <>
              {awaitingCardDef && (
                <div
                  className="panel soft"
                  style={{
                    marginTop: 12,
                    border: "1px solid rgba(34,197,94,0.30)",
                    background: "rgba(34,197,94,0.05)",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontWeight: 900, fontSize: 13 }}>{awaitingCardDef.name}</div>
                  <div
                    className="muted"
                    style={{ fontSize: 12, marginTop: 2 }}
                    title={(awaitingCardDef as any)?.exhaust ? EXHAUST_TOOLTIP : undefined}
                  >
                    {normalizeType(awaitingCardDef.type)} • {cardDescForUi(awaitingCardDef as any)}
                  </div>
                </div>
              )}

              {String((awaiting as any)?.question?.kind ?? "") === "boxplot_build" && buildMeta ? (
                <div style={{ marginTop: 12 }}>
                  <BoxPlotBuilder
                    axisMin={Number(buildMeta.axisMin ?? 0)}
                    axisMax={Number(buildMeta.axisMax ?? 10)}
                    tickStep={Number(buildMeta.tickStep ?? 1)}
                    value={
                      boxplotBuild ??
                      defaultBuildStart(Number(buildMeta.axisMin ?? 0), Number(buildMeta.axisMax ?? 10))
                    }
                    onChange={setBoxplotBuild}
                  />
                </div>
              ) : awaiting.question.viz ? (
                <QuestionVizView viz={awaiting.question.viz as any} />
              ) : null}
              <div style={{ fontSize: 18, marginTop: 10, whiteSpace: "pre-wrap" }}>{awaiting.question.prompt}</div>
              {props.showHints !== false && awaiting.question.hint && (
                <div className="muted" style={{ marginTop: 10 }}>
                  Hint: {awaiting.question.hint}
                </div>
              )}
            </>
          ) : (
            <div
              className="muted"
              style={{ marginTop: 10, fontSize: 13, display: "flex", justifyContent: "space-between", gap: 12 }}
            >
              <div>Drag a card into the play area (or tap/click a card, then tap the play area)</div>
              <div style={{ fontWeight: 900, whiteSpace: "nowrap" }}>Turn {Number(b.turn ?? 1)}</div>
            </div>
          )}

          {!isOver ? (
            <>
              <hr className="sep" />

              <div
                className={
                  "playZone " +
                  (dragOverPlayZone ? "playZoneHot " : "") +
                  (!awaiting && draggingIdx != null ? "playZoneArmed" : "") +
                  (awaiting && isExam ? "playZoneExam" : "")
                }
                onDragEnter={() => {
                  if (!awaiting) setDragOverPlayZone(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (!awaiting) setDragOverPlayZone(true);
                }}
                onDragLeave={() => setDragOverPlayZone(false)}
                onDrop={onDropPlayZone}
                onClick={() => {
                  if (!awaiting && stagedHandIndex != null) playIndex(stagedHandIndex);
                }}
                title={awaiting ? "Answer the question first." : "Drop a card here to play it."}
                style={{ userSelect: "none" }}
              >
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 900 }}>
                    {awaiting
                      ? (isExam
                        ? `Exam time> Answer this question correct or take ${examDamage} damage from ${examEnemyName}!`
                        : "Answering…")
                      : "PLAY AREA"}
                  </div>

                  {!awaiting && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                      {playZoneHint}
                    </div>
                  )}

                  {!awaiting && draggingDef && dragOverPlayZone && (
                    <div
                      className="panel soft"
                      style={{
                        marginTop: 10,
                        width: "min(320px, 100%)",
                        textAlign: "left",
                        border: "1px solid rgba(34,197,94,0.35)",
                      }}
                    >
                      <div style={{ fontWeight: 900, fontSize: 13 }}>{draggingDef.name}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                        {normalizeType(draggingDef.type)}
                      </div>
                      <div
                        className="muted"
                        style={{ fontSize: 12, marginTop: 8 }}
                        title={(draggingDef as any)?.exhaust ? EXHAUST_TOOLTIP : undefined}
                      >
                        {cardDescForUi(draggingDef as any)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ height: 12 }} />

              <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                {awaiting && String((awaiting as any)?.question?.kind ?? "") === "boxplot_build" ? (
                  <div className="row" style={{ gap: 8 }}>
                    <button
                      className="btn"
                      onClick={() => {
                        const axisMin = Number((awaiting as any)?.question?.build?.axisMin ?? 0);
                        const axisMax = Number((awaiting as any)?.question?.build?.axisMax ?? 10);
                        setBoxplotBuild(defaultBuildStart(axisMin, axisMax));
                      }}
                      disabled={!awaiting}
                    >
                      Reset Plot
                    </button>
                    <button className="btn primary" onClick={submitAnswer} disabled={!awaiting}>
                      Submit
                    </button>
                  </div>
                ) : (
                  <div className="row">
                    <input
                      ref={answerInputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={awaiting ? "Type your answer (number)" : "Play a card first"}
                      className="input"
                      disabled={!awaiting}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitAnswer();
                      }}
                    />
                    <button className="btn primary" onClick={submitAnswer} disabled={!awaiting}>
                      Submit
                    </button>
                  </div>
                )}

                <button className="btn" onClick={endMyTurn} disabled={!!awaiting || !!((b as any).awaitingDiscard) || String((b as any).meta?.phase ?? "PLAYER") === "ENEMY"}>
                  End Turn
                </button>

                <button className="btn" onClick={() => setBattleLogOpen((v) => !v)}>
                  {battleLogOpen ? "Close Log" : "Log"}
                </button>
              </div>

              {b.lastResult && (
                <div style={{ marginTop: 12 }}>
                  <span className={"badge " + (b.lastResult.correct ? "good" : "bad")}>
                    {b.lastResult.message}
                  </span>
                </div>
              )}
            </>
          ) : (
            <>
              <hr className="sep" />
              <div className="muted" style={{ textAlign: "center" }}>
                Battle complete.
              </div>
            </>
          )}
        </div>

        <div style={{ height: 12 }} />

        {/* HAND PANEL */}
        <div className="panel handPanel">
          <div className="handTopRow">
            {/* DRAW */}
            <div
              className={"pileWrap pileInteractive" + (deckCurseGlow ? " curseGlow" : "")}
              title={`Draw pile (${b.drawPile.length})`}
              onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
              onClick={() => openPileModal("draw")}
            >
              <div className="pileLabel">Draw</div>
              <div className="pile">
                <div className="pileCard back" />
                <div className="pileCount">{b.drawPile.length}</div>
              </div>
            </div>

            {/* ENERGY */}
            <div className="energyCenter">
              <span
                className="badge"
                style={{
                  width: 170,
                  justifyContent: "center",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  border: "1px solid rgba(255,255,255,0.20)",
                  background: energyDrainFlash ? "rgba(168,85,247,0.22)" : "rgba(120,140,255,0.12)",
                  boxShadow: energyDrainFlash ? "0 0 0 3px rgba(168,85,247,0.25), 0 0 18px rgba(168,85,247,0.22)" : undefined,
                }}
                title="Energy (spent to play cards)"
              >
                <span style={{ fontSize: 16, transform: "translateY(-1px)" }}>⚡</span>
                <span style={{ fontWeight: 900 }}>
                  {b.energy}/{b.maxEnergy}
                </span>
                <span style={{ display: "inline-flex", gap: 4, marginLeft: 2 }}>
                  {Array.from({ length: b.maxEnergy }).map((_, i) => (
                    <span
                      key={i}
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.25)",
                        background: i < b.energy ? "rgba(34,197,94,0.85)" : "rgba(255,255,255,0.08)",
                        boxShadow: i < b.energy ? "0 0 0 2px rgba(34,197,94,0.12)" : "none",
                      }}
                    />
                  ))}
                </span>
              </span>

              {/* EXHAUST (small, bottom-aligned with other piles) */}
              <div
                className="pileWrapSmall pileInteractive"
                title={`Exhaust pile (${((b as any).exhaustPile ?? []).length})`}
                onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
                onClick={() => openPileModal("exhaust")}
                style={{ marginTop: 10 }}
              >
                <div className="pileLabel">Exhaust</div>
                <div className="pileSmall">
                  <div
                    className="pileCardSmall"
                    style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.16), rgba(0, 0, 0, 0.30))" }}
                  />
                  <div className="pileCount">{((b as any).exhaustPile ?? []).length}</div>
                </div>
              </div>
            </div>

            {/* DISCARD */}
            <div
              className={"pileWrap pileInteractive" + (deckCurseGlow ? " curseGlow" : "")}
              title={`Discard pile (${b.discardPile.length})`}
              onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
              onClick={() => openPileModal("discard")}
            >
              <div className="pileLabel">Discard</div>
              <div className="pile">
                <div className="pileCard face">
                  {topDiscardDef ? (
                    <>
                      <div style={{ fontWeight: 900, fontSize: 12 }}>{topDiscardDef.name ?? topDiscardId}</div>
                      <div
                        className="muted"
                        style={{ fontSize: 11, marginTop: 4 }}
                        title={(topDiscardDef as any)?.exhaust ? EXHAUST_TOOLTIP : undefined}
                      >
                        {topDiscardDesc}
                      </div>
                    </>
                  ) : (
                    <div className="muted" style={{ fontSize: 12 }}>Empty</div>
                  )}
                </div>
                <div className="pileCount">{b.discardPile.length}</div>
              </div>
            </div>
          </div>

          <div className="handTitle">Hand</div>

          {/* Discard overlay */}
          {((b as any).awaitingDiscard) &&
            createPortal(
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 99998,
                  background: "rgba(0,0,0,0.72)",
                  display: "grid",
                  placeItems: "center",
                  padding: 18,
                }}
                onClick={() => {
                  // don't close
                }}
              >
                <div
                  className="panel"
                  style={{
                    width: "min(980px, 96vw)",
                    maxHeight: "90vh",
                    overflow: "auto",
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(8,10,16,0.92)",
                  }}
                >
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 16 }}>Discard</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        Click a card to select it, then confirm.
                      </div>
                    </div>
                    <button
                      className="btn primary"
                      disabled={!pendingDiscardCardId}
                      onClick={() => {
                        if (!pendingDiscardCardId) return;
                        try { sfx.confirm(); } catch {}
                        const next = chooseDiscard(b, props.rng, pendingDiscardCardId);
                        props.onUpdate(next);
                        setPendingDiscardCardId(null);
                      }}
                    >
                      Confirm Discard
                    </button>
                  </div>

                  <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                    {(b.hand ?? []).map((cardId: string, idx: number) => {
                      const def = cardById.get(cardId);
                      const name = def?.name ?? cardId;
                      const type = normalizeType(def?.type);
                      const desc = cardDescForUi(def as any);
                      const selected = pendingDiscardCardId === cardId;
                      return (
                        <div
                          key={`${cardId}_${idx}_discard`}
                          className={
                            "panel soft cardTile " +
                            `rarity-${String(def?.rarity ?? "Common").toLowerCase()}` +
                            (String(cardId ?? "").startsWith("neg_") ? " negativeCard" : "")
                          }
                          role="button"
                          tabIndex={0}
                          onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
                          onClick={() => {
                            try { sfx.select(); } catch {}
                            setPendingDiscardCardId(cardId);
                          }}
                          style={{
                            cursor: "pointer",
                            borderColor: selected ? "rgba(34,197,94,0.75)" : undefined,
                            boxShadow: selected ? "0 0 0 3px rgba(34,197,94,0.18)" : undefined,
                          }}
                          title={`${name}\n${desc}`}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 900, fontSize: 13 }}>{name}</div>
                              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{type}</div>
                            </div>
                          </div>
                          <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>{desc}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>,
              document.body
            )}

          <div className="handCardsGrid">
            {b.hand.map((cardId, idx) => {
              const def = cardById.get(cardId);
              const name = def?.name ?? cardId;
              const type = normalizeType(def?.type);
              const desc = cardDescForUi(def as any);

              const hasPopQuiz = (b.hand ?? []).some((id: any) => String(id ?? "") === "neg_pop_quiz");

              const cost = cardCost(def);
              const blockedByPopQuiz = hasPopQuiz && String(cardId ?? "") !== "neg_pop_quiz";
              const playable = !(def as any)?.unplayable && !blockedByPopQuiz && !((b as any).awaitingDiscard) && canPlay(type, cost);

              const disabledReason =
                (b as any).awaitingDiscard
                  ? "Choose a card to discard."
                  : awaiting
                    ? "Answer the current question first."
                    : (def as any)?.unplayable
                      ? "This card is unplayable."
                      : blockedByPopQuiz
                        ? "Pop Quiz: you must play it before any other cards."
                      : b.energy < cost
                        ? "Not enough energy."
                        : "";

              return (
                <div key={`${cardId}_${idx}`} className="handCardWrap">
                  <div
                    className={
                      "handCard panel soft cardTile " +
                      `rarity-${String(def?.rarity ?? "Common").toLowerCase()}` +
                      (String(cardId ?? "").startsWith("neg_") ? " negativeCard" : "") +
                      " " +
                      (playable ? "cardPlayable" : "cardDisabled")
                    }
                    draggable={playable && !awaiting && !isOver}
                    onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
                    onMouseDown={() => {
                      if (!playable || awaiting || isOver) return;
                      try { sfx.select(); } catch {}
                    }}
                    onDragStart={(e) => {
                      if (!playable || awaiting || isOver) return;

                      try {
                        // Some browsers can be picky about drag data / drag images.
                        // If anything here throws, we still want the drag to work.
                        e.dataTransfer.setData("application/x-hand-index", String(idx));
                        e.dataTransfer.setData("text/plain", String(idx));
                        e.dataTransfer.effectAllowed = "move";

                        try {
                          setRealCardDragImage(e, e.currentTarget as HTMLElement);
                        } catch (err) {
                          // Fallback: allow browser default drag preview
                          console.warn("Drag image failed; using default.", err);
                        }

                        setDraggingIdx(idx);
                      } catch (err) {
                        console.error("Drag start failed", err);
                      }
                    }}
                    onDragEnd={() => {
                      setDraggingIdx(null);
                      setDragOverPlayZone(false);
                      clearDragImage();
                    }}
                    onClick={() => {
                      stageCard(idx);
                    }}
                    title={
                      playable
                        ? `${name}\n${desc}${(def as any)?.exhaust ? `\n${EXHAUST_TOOLTIP}` : ""}\nRarity: ${String((def as any)?.rarity ?? "Common")}`
                        : disabledReason
                    }
                    role="button"
                    tabIndex={0}
                    style={{
                      textAlign: "left",
                      opacity: playable ? 1 : 0.55,
                      cursor: playable ? "grab" : "not-allowed",
                      userSelect: "none",
                      borderColor: handCurseFlashCardId && String(handCurseFlashCardId) === String(cardId) ? "rgba(168,85,247,0.85)" : undefined,
                      boxShadow:
                        handCurseFlashCardId && String(handCurseFlashCardId) === String(cardId)
                          ? "0 0 0 3px rgba(168,85,247,0.28), 0 0 16px rgba(168,85,247,0.18)"
                          : undefined,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900, fontSize: 13 }}>{name}</div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{type}</div>
                      </div>

                      <span className="badge" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span>{cost}</span>
                        <span style={{ opacity: 0.9 }}>⚡</span>
                      </span>
                    </div>

                    <div className="muted handCardDesc" title={(def as any)?.exhaust ? EXHAUST_TOOLTIP : undefined}>{desc}        </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {intentTip &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: intentTip.x,
              top: intentTip.y,
              zIndex: 2147483647,
              pointerEvents: "none",
              maxWidth: 360,
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(12,12,14,0.96)",
              border: "1px solid rgba(255,255,255,0.26)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.55)",
              color: "rgba(255,255,255,0.95)",
              fontSize: 12,
              lineHeight: 1.35,
              whiteSpace: "pre-wrap",
            }}
          >
            {intentTip.text}
          </div>,
          document.body
        )}

      {openPile &&
        createPortal(
          <>
            <div className="pileModalBackdrop" onClick={closePileModal} />
            <div className="panel pileModal">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{pileModalTitle}</div>
                <button
                  className="btn"
                  onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
                  onClick={() => {
                    try { sfx.click(); } catch {}
                    closePileModal();
                  }}
                >
                  Close
                </button>
              </div>

              <div className="muted" style={{ marginTop: 8 }}>
                {openPile.kind === "draw"
                  ? "Sorted A → Z"
                  : "Newest → Oldest"}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12, alignItems: "stretch" }}>
                {pileIds.length === 0 ? (
                  <div className="muted" style={{ padding: 10 }}>Empty</div>
                ) : (
                  pileIds.map((id, i) => {
                    const def = cardById.get(id);
                    const name = def?.name ?? id;
                    const desc = cardDescForUi(def as any);
                    const isNeg = String(id ?? "").startsWith("neg_");
                    return (
                      <div
                        key={`${id}_${i}`}
                        className={
                          "panel soft cardTile " +
                          `rarity-${String(def?.rarity ?? "Common").toLowerCase()}` +
                          (isNeg ? " negativeCard" : "")
                        }
                        style={{ width: 240, minHeight: 140 }}
                        title={`${name}\n${desc}${(def as any)?.exhaust ? `\n${EXHAUST_TOOLTIP}` : ""}`}
                      >
                        <div style={{ fontWeight: 900, fontSize: 13 }}>{name}</div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                          {normalizeType(def?.type)}
                        </div>
                        <div
                          className="muted"
                          style={{ fontSize: 12, marginTop: 8, whiteSpace: "pre-wrap" }}
                          title={(def as any)?.exhaust ? EXHAUST_TOOLTIP : undefined}
                        >
                          {desc}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>,
          document.body
        )}

    </div>
  );
}

