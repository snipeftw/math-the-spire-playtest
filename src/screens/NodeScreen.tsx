// src/screens/NodeScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GameState } from "../game/state";
import { SUPPLIES_POOL_10 } from "../content/supplies";
import { CONSUMABLES_10 } from "../content/consumables";
import {
  BASE_CARDS,
  ALL_CARDS_40ish,
  cardDescForUi,
  EXHAUST_TOOLTIP,
  upgradeCardId,
} from "../content/cards";
import { getEventById } from "../content/events";
import { eventImg } from "../content/assetUrls";
import { sfx } from "../game/sfx";

type ShopItemKind = "card" | "consumable" | "supply";

type ShopOfferItem = {
  kind: ShopItemKind;
  id: string;
  price: number;
};

type NodeScreenProps = {
  node: NonNullable<GameState["nodeScreen"]>;
  gold: number;
  hp: number;
  maxHp: number;
  deckCardIds: string[];
  supplyIds: string[];
  consumables: string[];
  onBuy: (kind: ShopItemKind, id: string) => void;
  onShopRefresh?: () => void;
  onRemoveCard?: (cardId: string) => void;
  onRestHeal: () => void;
  onRestUpgrade: (cardId: string) => void;
  onEventChoose: (choiceId: string) => void;
  onEventPickUpgrade: (cardId: string) => void;
  onEventPickCard: (cardId: string) => void;
  onEventPickConsumable?: (consumableId: string) => void;
  onEventPickSupply?: (supplyId: string) => void;
  onEventHallwayAnswer: (answer: number) => void;
  onEventGateAnswer: (answer: number) => void;
  onDiscardConsumable?: (consumableId: string) => void;
  onInventoryHoverChange?: (targets: { gold?: boolean; hp?: "heal" | "damage"; supplyIds?: string[] } | null) => void;
  onComplete: () => void;
};

function ComingSoonNodeScreen(props: {
  title: string;
  nodeType: string;
  depth: number;
  onComplete: () => void;
}) {
  return (
    <div className="container">
      <div className="header">
        <div>
          <h2 className="h2">{props.title}</h2>
          <div className="sub">
            Depth <strong>{props.depth}</strong>
          </div>
        </div>
        <span className="badge">
          Type: <strong>{props.nodeType}</strong>
        </span>
      </div>

      <div className="panel">
        <div style={{ fontWeight: 900, fontSize: 18 }}>Coming soon</div>
        <div className="muted" style={{ marginTop: 6 }}>
          This node type isn’t implemented yet.
        </div>

        <hr className="sep" />

        <button
          className="btn primary"
          onMouseEnter={() => {
            try {
              sfx.cardHover();
            } catch {}
          }}
          onClick={props.onComplete}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function EventNodeScreen(props: {
  node: Extract<NonNullable<GameState["nodeScreen"]>, { type: "EVENT" }>;
  gold: number;
  hp: number;
  maxHp: number;
  deckCardIds: string[];
  supplyIds: string[];
  consumables: string[];
  onChoose: (choiceId: string) => void;
  onPickUpgrade: (cardId: string) => void;
  onPickCard: (cardId: string) => void;
  onPickConsumable?: (consumableId: string) => void;
  onPickSupply?: (supplyId: string) => void;
  onHallwayAnswer: (answer: number) => void;
  onGateAnswer: (answer: number) => void;
  onDiscardConsumable?: (consumableId: string) => void;
  onHoverTargetsChange?: (targets: { gold?: boolean; hp?: "heal" | "damage"; supplyIds?: string[] } | null) => void;
  onComplete: () => void;
  maps: {
    cardById: Map<string, any>;
    consumableById: Map<string, any>;
    supplyById: Map<string, any>;
  };
}) {
  const { node, maps } = props;
  const title = String((node as any).title ?? "Shop");
  const subTitle = (node as any).subTitle as string | undefined;
  const flavorText = (node as any).flavorText as string | undefined;
  const isEventShop = !!(node as any).eventShop;
  const ev = getEventById(node.eventId);

  const hasGold = (props.gold ?? 0) > 0;

  const renderMultilineWithDamage = (text: string) => {
    const raw = String(text ?? "");
    const lines = raw.split("\n");
    return (
	                  <React.Fragment>
        {lines.map((line, i) => {
          const isHealLine =
            /\bheal\s+\d+\b/i.test(line) ||
            (/\brecover\s+\d+\b/i.test(line) && /\bhp\b/i.test(line)) ||
            (/\bgain\s+\d+\b/i.test(line) && /\bhp\b/i.test(line)) ||
            /\bfull\s+heal\b/i.test(line) ||
            /\bfully\s+heal(?:ed)?\b/i.test(line) ||
            /\bfully\s+healed\b/i.test(line);
          const isDamageLine =
            /\bwrong answer\b/i.test(line) && /\btake\s+\d+\s+damage\b/i.test(line) ||
            /^\s*take\s+\d+\s+damage\b/i.test(line) ||
            /\btake\s+\d+\s+damage\b/i.test(line);
          return (
            <React.Fragment key={i}>
              {isDamageLine ? (
                <span className="damageText">{line}</span>
              ) : isHealLine ? (
                <span className="healText">{line}</span>
              ) : (
                line
              )}
              {i < lines.length - 1 ? <br /> : null}
            </React.Fragment>
          );
        })}
	                  </React.Fragment>
    );
  };

  // Keep icons in sync with the run loadout rendering (see App.tsx).
  const consumableIcon = (id: string | null | undefined): string => {
    switch (id) {
      case "con_apple":
        return "🍎";
      case "con_sandwich":
        return "🥪";
      case "con_rain_coat":
        return "🧥";
      case "con_cookie":
        return "🍪";
      case "con_shake":
        return "🥤";
      case "con_trailmix":
        return "🥜";
      case "con_water":
        return "💧";
      case "con_eraser":
        return "🧽";
      case "con_chips":
        return "🍟";
      case "con_answer_key":
        return "🔑";
      case "con_moldy_food":
        return "🤢";
      case "con_absence_note":
        return "📝";
      case "con_cheat_sheet":
        return "📄";
      case "con_trash_bin":
        return "🗑️";

      // legacy ids
      case "con_banana":
        return "🍌";
      case "con_juice":
        return "🧃";
      case "con_yogurt":
        return "🥣";
      case "con_granola":
        return "🥣";
      default:
        return "🎒";
    }
  };
  const hasPencil = (props.supplyIds ?? []).includes("sup_gold_boost");

  const consumablesCount = (props.consumables ?? []).length;
  const consumablesFull = consumablesCount >= 3;
  const consumableSlots = Math.max(0, 3 - consumablesCount);

  const [pickedBaseId, setPickedBaseId] = useState<string | null>(null);
  const [pickedRewardCardId, setPickedRewardCardId] = useState<string | null>(null);
  const [pickedRewardConsumableId, setPickedRewardConsumableId] = useState<string | null>(null);
  const [pickedRewardSupplyId, setPickedRewardSupplyId] = useState<string | null>(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(node.step === "UPGRADE_PICK");
  const [hallwayAnswer, setHallwayAnswer] = useState("");
  const [gateAnswer, setGateAnswer] = useState("");

  // Global safety: warn if a choice would immediately kill the player.
  const [lethalConfirm, setLethalConfirm] = useState<null | { choiceId: string; damage: number }>(null);

  // Hover previews are only used on the INTRO step. Clear any hover state when leaving INTRO.
  useEffect(() => {
    if (node.step !== "INTRO") {
      props.onHoverTargetsChange?.(null);
      setHoverPreview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.step]);

  // Hover preview can be expensive; guard against rapid enter/leave loops by only
  // updating when the hovered choice actually changes.
  const [hoverPreview, setHoverPreview] = useState<null | { note?: string; cards?: string[]; consumables?: string[]; supplies?: string[] }>(null);
  const lastHoverChoiceIdRef = useRef<string | null>(null);


  // Reset local selection when event step changes
  React.useEffect(() => {
    setHallwayAnswer("");
    setGateAnswer("");
  }, [node.step, (node as any).hallwayPending?.index, (node as any).hallwayQuiz?.question?.id, (node as any).gate?.question?.id]);


  React.useEffect(() => {
    setPickedBaseId(null);
    setPickedRewardCardId(null);
    setPickedRewardConsumableId(null);
    setPickedRewardSupplyId(null);
    setUpgradeModalOpen(node.step === "UPGRADE_PICK");
    setHoverPreview(null);
    setLethalConfirm(null);
  }, [node.step, node.nodeId, node.eventId]);

  const guaranteedDamageForChoice = (eventId: string | undefined | null, choiceId: string): number | null => {
    const evId = String(eventId ?? "");
    switch (evId) {
      case "vault":
        return choiceId === "leave" ? 15 : null;
      case "chem_lab_spill":
        return choiceId === "leave" ? 5 : null;
      case "after_school_practice":
        return choiceId === "extra_reps" ? 10 : null;
      case "weight_room":
        return choiceId === "sparring_partner" || choiceId === "punching_bag" ? 20 : null;
      case "charging_station":
        return choiceId === "rip_it_out" ? 15 : null;
      case "poison_extraction":
        return choiceId === "extract_antidote" ? 12 : null;
      case "attendance_office":
        return choiceId === "leave" ? 5 : null;
      default:
        return null;
    }
  };

  const commitChoice = (choiceId: string) => {
    try {
      sfx.confirm();
    } catch {}
    props.onHoverTargetsChange?.(null);
    lastHoverChoiceIdRef.current = null;
    setHoverPreview(null);
    props.onChoose(choiceId);
  };

  // Play a negative SFX when a question gate is answered incorrectly (i.e., causes damage).
  const prevStepRef = useRef<string | null>(null);
  const prevHpRef = useRef<number>(props.hp);
  useEffect(() => {
    const prevStep = prevStepRef.current;
    const prevHp = prevHpRef.current;

    if (prevStep === "QUESTION_GATE" && node.step === "RESULT") {
      const hpDelta = Number(props.hp) - Number(prevHp);
      const txt = String((node as any).resultText ?? "");
      const wrong = hpDelta < 0 || txt.includes("❌");
      try {
        (wrong ? sfx.hurt : sfx.confirm)();
      } catch {}
    }

    prevStepRef.current = String(node.step ?? "");
    prevHpRef.current = props.hp;
  }, [node.step, (node as any).resultText, props.hp]);

  const artUrl = ev ? eventImg(ev.artFile) : "";

  const choices = (() => {
    if (ev?.id === "vault") {
      return [
        {
          id: "offer_all_gold",
          label: "Offer all your gold",
          hint: "Lose all gold. Heal 15 HP.",
          disabled: !hasGold,
          disabledReason: "You have no gold.",
          tags: ["🪙 Offering", "❤️ Heal"],
        },
        {
          id: "trade_golden_pencil",
          label: "Trade the Golden Pencil",
          hint: "Lose Golden Pencil. Upgrade a card.",
          disabled: !hasPencil,
          disabledReason: "You need the Golden Pencil.",
          tags: ["✏️ Supply", "⬆️ Upgrade"],
        },
        {
          id: "ultimate_offering",
          label: "Make the ultimate offering",
          hint: "Lose all gold + Golden Pencil. Gain Golden Strike (Ultra Rare).",
          disabled: !hasGold || !hasPencil,
          disabledReason: !hasGold ? "You need gold." : "You need the Golden Pencil.",
          tags: ["💎 Ultra Rare", "🗡️ Card"],
        },
        {
          id: "leave",
          label: "Leave without offering",
          hint: "Take 15 damage.",
          disabled: false,
          disabledReason: "",
          tags: ["🚪 Leave", "⚠️ Damage"],
        },
      ];
    }

    if (ev?.id === "vending_machine_glitch") {
      return [
        {
          id: "buy",
          label: "Buy (50g)",
          hint: "Spend 50 gold → get a random consumable.",
          // Even if full, players can discard to make room via the reward popup.
          disabled: (props.gold ?? 0) < 50,
          disabledReason: "You need 50 gold.",
          tags: consumablesFull ? ["🪙 Cost", "🎒 Consumable", "⚠️ Inventory Full"] : ["🪙 Cost", "🎒 Consumable"],
        },
        {
          id: "shake",
          label: "Shake it",
          hint: "50%: get 2 consumables • 50%: take 10 damage.",
          disabled: false,
          disabledReason: "",
          tags: ["🎲 50/50", "⚠️ Risk"],
        },
        {
          id: "leave",
          label: "Leave",
          hint: "Answer a question to slip out. Wrong: take 5 damage.",
          disabled: false,
          disabledReason: "",
          tags: ["🚪 Exit", "🧠 Question"],
        },
      ];
    }

    if (ev?.id === "library_study_session") {
      const upgradable = (props.deckCardIds ?? []).some((cid) => upgradeCardId(cid) !== cid);
      return [
        {
          id: "study",
          label: "Study",
          hint: "Upgrade a card.",
          disabled: !upgradable,
          disabledReason: "No upgradable cards in your deck.",
          tags: ["⬆️ Upgrade"],
        },
        {
          id: "steal_notes",
          label: "Steal notes",
          hint: "Gain Cheat Sheet • Add Pop Quiz.",
          disabled: false,
          disabledReason: "",
          tags: ["🧾 Risk", "🧪 Curse"],
        },
        {
          id: "nap",
          label: "Nap",
          hint: "Heal 10 HP • Lose 30 gold.",
          disabled: (props.gold ?? 0) < 30,
          disabledReason: "You need 30 gold.",
          tags: ["❤️ Heal", "🪙 Cost"],
        },
        {
          id: "leave",
          label: "Leave",
          hint: "Answer a question to leave.",
          disabled: false,
          disabledReason: "",
          tags: ["🚪 Exit", "🧠 Question"],
        },
      ];
    }



    if (ev?.id === "detention_notice") {
      const upgradable = (props.deckCardIds ?? []).some((cid) => upgradeCardId(cid) !== cid);
      return [
        {
          id: "serve_detention",
          label: "Serve detention",
          hint: "Gain a Trash Bin consumable.",
          disabled: consumablesFull,
          disabledReason: consumablesFull ? "Your consumable slots are full." : "",
          tags: ["🎒 Consumable"],
        },
        {
          id: "bribe_staff",
          label: "Bribe staff (75g)",
          hint: "Pay 75 gold → upgrade a card.",
          disabled: (props.gold ?? 0) < 75 || !upgradable,
          disabledReason: (props.gold ?? 0) < 75 ? "You need 75 gold." : "No upgradable cards in your deck.",
          tags: ["🪙 Cost", "⬆️ Upgrade"],
        },
        {
          id: "skip_gain_curse",
          label: "Avoid detention",
          hint: "Avoid detention… but you'll take a Curse (confirm).",
          disabled: false,
          disabledReason: "",
          tags: ["🧪 Curse"],
        },
      ];
    }

    if (ev?.id === "substitute_teacher") {
      return [
        {
          id: "help_them",
          label: "Help them",
          hint: "Gain an Answer Key.",
          disabled: consumablesFull,
          disabledReason: consumablesFull ? "Your consumable slots are full." : "",
          tags: ["🎒 Consumable"],
        },
        {
          id: "cause_chaos",
          label: "Cause chaos",
          hint: "Gain 75 gold • Take a random negative card (confirm).",
          disabled: false,
          disabledReason: "",
          tags: ["🪙 Gold", "🧪 Curse"],
        },
        {
          id: "leave",
          label: "Leave",
          hint: "Answer a question to slip out (wrong: take 5 damage).",
          disabled: false,
          disabledReason: "",
          tags: ["🚪 Exit", "🧠 Question"],
        },
      ];
    }

    if (ev?.id === "chem_lab_spill") {
      const hasDeodorant = (props.supplyIds ?? []).includes("sup_apply_poison");
      const hasContagion = (props.supplyIds ?? []).includes("sup_poison_spreads");
      const hasToxic = (props.supplyIds ?? []).includes("sup_poison_double_damage");

      return [
        {
          id: "trade_deodorant",
          label: "Trade Deodorant for a full heal",
          hint: "Lose Deodorant → fully heal.",
          disabled: !hasDeodorant,
          disabledReason: hasDeodorant ? "" : "You don't have Deodorant.",
          tags: ["❤️ Full heal", "🔁 Trade"],
        },
        {
          id: "take_contagion",
          label: "Take Contagion",
          hint: "Gain Contagion • Add permanent Infestation.",
          disabled: hasContagion,
          disabledReason: hasContagion ? "You already have Contagion." : "",
          tags: ["🧪 Supply", "🃏 Negative"],
        },
        {
          id: "take_toxic_booster",
          label: "Take Toxic Booster",
          hint: "Gain Toxic Booster • Add permanent Radiation.",
          disabled: hasToxic,
          disabledReason: hasToxic ? "You already have Toxic Booster." : "",
          tags: ["🧪 Supply", "🃏 Negative"],
        },
        {
          id: "leave",
          label: "Leave",
          hint: "Take 5 damage.",
          disabled: false,
          disabledReason: "",
          tags: ["🚪 Leave", "⚠️ Damage"],
        },
      ];
    }

    if (ev?.id === "charging_station") {
      const hasBattery = (props.supplyIds ?? []).includes("sup_energy_carryover");
      return [
        {
          id: "pay_150",
          label: "Pay (150g) — Battery Pack",
          hint: "Pay 150 gold → gain Battery Pack.",
          disabled: (props.gold ?? 0) < 150 || hasBattery,
          disabledReason: hasBattery ? "You already have a Battery Pack." : "You need 150 gold.",
          tags: ["🪙 Cost", "🧪 Supply"],
        },
        {
          id: "rip_it_out",
          label: "Rip it out",
          hint: "Gain Battery Pack • Take 15 damage • Add permanent Radiation.",
          disabled: hasBattery,
          disabledReason: hasBattery ? "You already have a Battery Pack." : "",
          tags: ["⚠️ Risk", "🧪 Supply", "🃏 Negative"],
        },
        {
          id: "overclock_it",
          label: "Overclock it",
          hint: "Gain Overclock • Add permanent Radiation.",
          disabled: false,
          disabledReason: "",
          tags: ["⚡ Card", "🃏 Negative"],
        },
        {
          id: "leave",
          label: "Leave",
          hint: "Answer a question to leave.",
          disabled: false,
          disabledReason: "",
          tags: ["🚪 Leave", "❓ Question"],
        },
      ];
    }

    
    if (ev?.id === "after_school_practice") {
      const hasExtraSwing = (props.supplyIds ?? []).includes("sup_multi_attack_plus");
      return [
        {
          id: "extra_reps",
          label: "Extra reps",
          hint: "Gain Extra Swing • Take 10 damage.",
          disabled: hasExtraSwing,
          disabledReason: hasExtraSwing ? "You already have Extra Swing." : "",
          tags: ["🏋️ Practice", "⚔️ Supply", "⚠️ Damage"],
        },
        {
          id: "defensive_strategy",
          label: "Defensive Strategy",
          hint: "Lose 30 gold • Gain Dig In.",
          disabled: false,
          disabledReason: "",
          tags: ["🛡️ Card", "💰 Gold"],
        },
        {
          id: "skip",
          label: "Skip practice",
          hint: "Gain 50 gold • Add a permanent Curse.",
          disabled: false,
          disabledReason: "",
          tags: ["💰 Gold", "🧟 Negative"],
        },
        {
          id: "leave",
          label: "Leave",
          hint: "Answer a question to slip out.",
          disabled: false,
          disabledReason: "",
          tags: ["🚪 Exit", "🧠 Question"],
        },
      ];
    }

    if (ev?.id === "weight_room") {
      const beltId = "sup_strength_to_block";
      const cost = 75;
      const hasBelt = (props.supplyIds ?? []).includes(beltId);
      return [
        {
          id: "belt_up",
          label: "Belt Up (75g)",
          hint: "Pay 75 gold → gain Weight Belt.",
          disabled: (props.gold ?? 0) < cost || hasBelt,
          disabledReason: (props.gold ?? 0) < cost ? "Not enough gold." : hasBelt ? "You already have Weight Belt." : "",
          tags: ["🏋️ Supply", "💰 Cost"],
        },
        {
          id: "sparring_partner",
          label: "Sparring Partner",
          hint: "Take 20 damage → gain Shield Conversion.",
          disabled: false,
          disabledReason: "",
          tags: ["🥊 Fight", "⚔️ Card", "⚠️ Damage"],
        },
        {
          id: "punching_bag",
          label: "Punching Bag",
          hint: "Take 20 damage → gain Unload.",
          disabled: false,
          disabledReason: "",
          tags: ["🥊 Training", "⚔️ Card", "⚠️ Damage"],
        },
        {
          id: "leave",
          label: "Leave",
          hint: "Answer a question to leave.",
          disabled: false,
          disabledReason: "",
          tags: ["🚪 Exit", "🧠 Question"],
        },
      ];
    }



    if (ev?.id === "poison_extraction") {
      const hasRedPen = (props.supplyIds ?? []).includes("sup_negative_draw_burst");
      return [
        {
          id: "extract_antidote",
          label: "Extract Antidote",
          hint: "Gain Detox Extract • Take 12 damage.",
          disabled: false,
          disabledReason: "",
          tags: ["🧪 Card", "⚠️ Damage"],
        },
        {
          id: "extract_poison",
          label: "Extract Poison",
          hint: "Gain Red Pen.",
          disabled: hasRedPen,
          disabledReason: hasRedPen ? "You already have Red Pen." : "",
          tags: ["🧿 Supply", "🧪 Event"],
        },
        {
          id: "leave",
          label: "Leave",
          hint: "Answer a question to get the door open.",
          disabled: false,
          disabledReason: "",
          tags: ["🚪 Exit", "🧠 Question"],
        },
      ];
    }

    if (ev?.id === "attendance_office") {
      const hasPerfect = (props.supplyIds ?? []).includes("sup_no_negative_cards");
      return [
        {
          id: "absence_note",
          label: "Absence Note (60g)",
          hint: "Pay 60 gold → gain Absence Note.",
          disabled: (props.gold ?? 0) < 60 || consumablesFull,
          disabledReason: consumablesFull ? "Your consumable slots are full." : "You need 60 gold.",
          tags: ["📝 Consumable", "🪙 Cost"],
        },
        {
          id: "apologize",
          label: "Apologize",
          hint: "Heal 15 HP • Lose 30 gold.",
          disabled: false,
          disabledReason: "",
          tags: ["❤️ Heal", "🪙 Cost"],
        },
        {
          id: "forge_signature",
          label: "Forge Signature",
          hint: hasPerfect ? "Gain 100 gold (Perfect Record blocks negatives)." : "Gain 100 gold • Add 2 permanent negatives.",
          disabled: false,
          disabledReason: "",
          tags: ["💰 Gold", "🃏 Negative"],
        },
        {
          id: "leave",
          label: "Leave",
          hint: "Take 5 damage.",
          disabled: false,
          disabledReason: "",
          tags: ["🚪 Leave", "⚠️ Damage"],
        },
      ];
    }


    if (ev?.id === "pop_up_vendor") {
      const gold0 = Number(props.gold ?? 0);
      const gold = Number.isFinite(gold0) ? Math.max(0, Math.floor(gold0)) : 0;
      const alreadyBought = !!(node as any).vendorMysteryUsed;
      return [
        {
          id: "browse_wares",
          label: "Browse Wares",
          hint: "Open an Event Shop: 2 supplies • 2 consumables • 4 cards (all event-only).",
          disabled: false,
          disabledReason: "",
          tags: ["🛒 Shop", "🎲 Event-only"],
        },
        {
          id: "mystery_bag",
          label: "Mystery Bag (30g)",
          hint: "Pay 30 gold → get 1 random base-game consumable.",
          disabled: alreadyBought || gold < 30 || consumablesFull,
          disabledReason: alreadyBought ? "Already purchased." : consumablesFull ? "Your consumable slots are full." : "You need 30 gold.",
          tags: ["🎁 Mystery", "🪙 Cost"],
        },
        {
          id: "leave",
          label: "Leave",
          hint: "No question gate.",
          disabled: false,
          disabledReason: "",
          tags: ["🚪 Exit"],
        },
      ];
    }

    if (ev?.id === "exam_week_ladder") {
      return [
        {
          id: "start",
          label: "Climb the Ladder",
          hint:
            "Answer up to 5 exam questions in a row. One wrong answer ends the ladder — you only get ONE reward based on the highest rung you reach.",
          disabled: false,
          disabledReason: "",
          tags: ["🧠 Questions", "🪜 Ladder"],
        },
        {
          id: "leave",
          label: "Leave",
          hint: "Back away before the proctor notices.",
          disabled: false,
          disabledReason: "",
          tags: ["🚪 Exit"],
        },
      ];
    }

return (ev?.choices ?? []).map((c) => ({
      id: c.id,
      label: c.label,
      hint: c.hint,
      disabled: false,
      disabledReason: "",
      tags: [],
    }));
  })();

  const hoverTargetsForChoice = (
    choiceId: string
  ): { gold?: boolean; hp?: "heal" | "damage"; supplyIds?: string[] } | null => {
    if (ev?.id === "vault") {
      switch (choiceId) {
        case "offer_all_gold":
          // You lose gold here; only highlight the positive outcome.
          return { hp: "heal" };
        case "trade_golden_pencil":
          // You give up the pencil here; don't highlight "give up" items.
          return null;
        case "ultimate_offering":
          // You give up gold + pencil here; don't highlight "give up" items.
          return null;
        case "leave":
          return { hp: "damage" };
      }
    }

	  // Note: Detailed hover previews (cards/consumables/supplies/note) are handled by previewForChoice.
	  // hoverTargetsForChoice is intentionally kept to simple highlight targets (gold/hp/supply badges).

    if (ev?.id === "vending_machine_glitch") {
      switch (choiceId) {
        case "buy":
          // Buying costs gold; don't highlight "give up" items.
          return null;
        case "shake":
          return { hp: "damage" };
      }
    }

    if (ev?.id === "library_study_session") {
      switch (choiceId) {
        case "nap":
          // Napping costs gold; only highlight the healing.
          return { hp: "heal" };
      }
    }

    if (ev?.id === "detention_notice") {
      switch (choiceId) {
        case "bribe_staff":
          // Bribing costs gold; don't highlight "give up" items.
          return null;
      }
    }

    if (ev?.id === "substitute_teacher") {
      switch (choiceId) {
        case "cause_chaos":
          return { gold: true };
        case "leave":
          return { hp: "damage" };
      }
    }

    if (ev?.id === "chem_lab_spill") {
      switch (choiceId) {
        case "trade_deodorant":
          return { hp: "heal" };
        case "take_contagion":
          return { supplyIds: ["sup_poison_spreads"] };
        case "take_toxic_booster":
          return { supplyIds: ["sup_poison_double_damage"] };
        case "leave":
          return { hp: "damage" };
      }
    }

    if (ev?.id === "charging_station") {
      switch (choiceId) {
        case "pay_150":
          // Paying costs gold; don't highlight "give up" items.
          return null;
        case "rip_it_out":
          return { hp: "damage", supplyIds: ["sup_energy_carryover"] };
        case "overclock_it":
          return null;
        case "leave":
          return { hp: "damage" };
      }
    }

    if (ev?.id === "after_school_practice") {
      switch (choiceId) {
        case "extra_reps":
          return { hp: "damage" };
        case "defensive_strategy":
          // Costs gold; don't highlight "give up" items.
          return null;
        case "skip":
          return { gold: true };
        case "leave":
          return { hp: "damage" };
      }
    }

    if (ev?.id === "weight_room") {
      switch (choiceId) {
        case "belt_up":
          // Costs gold; don't highlight "give up" items.
          return null;
        case "sparring_partner":
          return { hp: "damage" };
        case "punching_bag":
          return { hp: "damage" };
        case "leave":
          return { hp: "damage" };
      }
    }

    if (ev?.id === "poison_extraction") {
      switch (choiceId) {
        case "extract_antidote":
          return { hp: "damage" };
        case "extract_poison":
          return { supplyIds: ["sup_negative_draw_burst"] };
        case "leave":
          return { hp: "damage" };
      }
    }

    if (ev?.id === "attendance_office") {
      switch (choiceId) {
        case "absence_note":
          // This costs gold; don't highlight "give up" items.
          return null;
        case "apologize":
          // Apologizing may cost gold; only highlight the healing.
          return { hp: "heal" };
        case "forge_signature":
          return { gold: true };
        case "leave":
          return { hp: "damage" };
      }
    }

    if (ev?.id === "pop_up_vendor") {
      switch (choiceId) {
        case "browse_wares":
          // Browsing doesn't grant resources immediately.
          return null;
        case "mystery_bag":
          // Paying gold is a cost; don't highlight "give up" items.
          return null;
      }
    }

    return null;
  };

  const previewForChoice = (choiceId: string): (null | { note?: string; cards?: string[]; consumables?: string[]; supplies?: string[] }) => {
    if (ev?.id === "vending_machine_glitch") {
      const eventOnlyIds = CONSUMABLES_10.filter((c: any) => !!c.eventOnly).map((c: any) => c.id);
      const poolIds = eventOnlyIds.length ? eventOnlyIds : CONSUMABLES_10.map((c: any) => c.id);
      switch (choiceId) {
        case "buy":
          return { consumables: poolIds, note: "Gain 1 random consumable (event-only pool)." };
        case "shake":
          return { consumables: poolIds, note: "50%: gain 2 consumables (event-only pool)\n50%: take 10 damage" };
        case "leave":
          return { note: "Exit gate: wrong answer — take 5 damage." };
      }
    }

    if (ev?.id === "library_study_session") {
      switch (choiceId) {
        case "study":
          return { note: "Upgrade a card from your deck." };
        case "steal_notes":
          return { consumables: ["con_cheat_sheet"], cards: ["neg_pop_quiz"], note: "Gain Cheat Sheet and add Pop Quiz." };
        case "nap":
	          // Don't show the gold cost in the hover preview; the button itself is disabled when unaffordable.
	          return { note: "Heal 10 HP." };
        case "leave":
          return { note: "Exit gate: wrong answer — take 5 damage." };
      }
    }

    if (ev?.id === "vault") {
      switch (choiceId) {
        case "offer_all_gold":
	          return { note: "Heal 15 HP." };
        case "trade_golden_pencil":
	          return { note: "Upgrade a card." };
        case "ultimate_offering":
	          return { cards: ["atk_golden_strike"], note: "Gain Golden Strike (Ultra Rare)." };
        case "leave":
          return { note: "Take 15 damage." };
      }
    }

    if (ev?.id === "detention_notice") {
      switch (choiceId) {
        case "serve_detention":
          return { consumables: ["con_trash_bin"] };
        case "bribe_staff":
	          // Cost is reflected by disabling the option when unaffordable; keep the preview focused on the reward.
	          return { note: "Upgrade a card from your deck." };
        case "skip_gain_curse":
          return { cards: ["neg_curse"], note: "You'll have to confirm by selecting the Curse." };
        case "leave":
          return { note: "Exit gate: wrong answer — take 5 damage." };
      }
    }

    if (ev?.id === "substitute_teacher") {
      switch (choiceId) {
        case "help_them":
          return { consumables: ["con_answer_key"] };
        case "cause_chaos":
          return {
            cards: ["neg_curse", "neg_infestation_perm", "neg_radiation_perm", "neg_pop_quiz"],
            note: "You'll gain 75 gold, then take 1 random negative card (confirm).",
          };
        case "leave":
          return { note: "Exit gate: wrong answer — take 5 damage." };
      }
    }

    if (ev?.id === "chem_lab_spill") {
      switch (choiceId) {
        case "trade_deodorant":
          return { note: "Full heal." };
        case "take_contagion":
          return { supplies: ["sup_poison_spreads"], cards: ["neg_infestation_perm"], note: "Gain Contagion and add permanent Infestation." };
        case "take_toxic_booster":
          return { supplies: ["sup_poison_double_damage"], cards: ["neg_radiation_perm"], note: "Gain Toxic Booster and add permanent Radiation." };
        case "leave":
          return { note: "Take 5 damage." };
      }
    }

    if (ev?.id === "charging_station") {
      switch (choiceId) {
        case "pay_150":
          // Cost is enforced by disabling the option; keep the preview focused on what you get.
          return { supplies: ["sup_energy_carryover"] };
        case "rip_it_out":
          return { supplies: ["sup_energy_carryover"], cards: ["neg_radiation_perm"], note: "Take 15 damage." };
        case "overclock_it":
          return { cards: ["skl_overclock", "neg_radiation_perm"], note: "Gain Overclock and add permanent Radiation." };
        case "leave":
          return { note: "Exit gate: wrong answer — take 5 damage." };
      }
    }

    if (ev?.id === "after_school_practice") {
      switch (choiceId) {
        case "extra_reps":
          return { supplies: ["sup_multi_attack_plus"], note: "Gain Extra Swing.\nTake 10 damage." };
        case "defensive_strategy":
          // Costs gold; keep the hover preview focused on what you gain.
          return { cards: ["blk_dig_in"], note: "Gain Dig In." };
        case "skip":
          return { cards: ["neg_curse"], note: "Gain 50 gold.\nAdd Curse (permanent)." };
        case "leave":
          return { note: "Exit gate: wrong answer — take 5 damage." };
      }
    }

    if (ev?.id === "weight_room") {
      switch (choiceId) {
        case "belt_up":
          // Costs gold; keep the hover preview focused on what you gain.
          return { supplies: ["sup_strength_to_block"], note: "Gain Weight Belt." };
        case "sparring_partner":
          return { cards: ["atk_shield_conversion"], note: "Gain Shield Conversion.\nTake 20 damage." };
        case "punching_bag":
          return { cards: ["atk_unload"], note: "Gain Unload.\nTake 20 damage." };
        case "leave":
          return { note: "Exit gate: wrong answer — take 5 damage." };
      }
    }

    if (ev?.id === "poison_extraction") {
      switch (choiceId) {
        case "extract_antidote":
          return { cards: ["skl_detox_extract"], note: "Gain Detox Extract.\nTake 12 damage." };
        case "extract_poison":
          return { supplies: ["sup_negative_draw_burst"], note: "Gain Red Pen." };
        case "leave":
          return { note: "Exit gate: wrong answer — take 5 damage." };
      }
    }

    if (ev?.id === "attendance_office") {
      const supplyIdsNow = props.supplyIds ?? [];
      const hasPerfect = supplyIdsNow.includes("sup_no_negative_cards");
      switch (choiceId) {
        case "absence_note":
          return { consumables: ["con_absence_note"], note: "Gain Absence Note." };
        case "apologize":
          return { note: "Heal 15 HP." };
        case "forge_signature":
          return hasPerfect
            ? { note: "Gain 100 gold.\nPerfect Record blocks the consequences." }
            : {
                cards: ["neg_curse", "neg_infestation_perm", "neg_radiation_perm", "neg_pop_quiz"],
                note: "Gain 100 gold.\nAdd 2 random permanent negatives (confirm).",
              };
        case "leave":
          return { note: "Take 5 damage." };
      }
    }

    if (ev?.id === "pop_up_vendor") {
      const eventOnlySupplyIds = SUPPLIES_POOL_10
        .filter((s: any) => !!(s as any)?.eventOnly)
        .map((s: any) => String((s as any).id))
        .slice(0, 6);
      const eventOnlyConsumableIds = CONSUMABLES_10
        .filter((c: any) => !!(c as any)?.eventOnly)
        .map((c: any) => String((c as any).id))
        .slice(0, 6);
      const eventOnlyCardIds = BASE_CARDS
        .filter((c: any) => !!(c as any)?.eventOnly)
        .map((c: any) => String((c as any).id))
        .slice(0, 6);

      switch (choiceId) {
        case "browse_wares":
          return {
            supplies: eventOnlySupplyIds,
            consumables: eventOnlyConsumableIds,
            cards: eventOnlyCardIds,
            note: "Open an Event Shop with event-only wares. The exact selection is random.",
          };
        case "mystery_bag": {
          const baseConsumableIds = CONSUMABLES_10
            .filter((c: any) => !(c as any)?.eventOnly)
            .map((c: any) => String((c as any).id));
          return { consumables: baseConsumableIds, note: "Gain 1 random base-game consumable." };
        }
        case "leave":
          return { note: "Leave without a question gate." };
      }
    }

    if (ev?.id === "exam_week_ladder") {
      const eventOnlySupplyIds = SUPPLIES_POOL_10
        .filter((s: any) => !!(s as any)?.eventOnly)
        .map((s: any) => String((s as any).id))
        .slice(0, 6);
      const eventOnlyConsumableIds = CONSUMABLES_10
        .filter((c: any) => !!(c as any)?.eventOnly)
        .map((c: any) => String((c as any).id))
        .slice(0, 6);
      const eventOnlyCardIds = BASE_CARDS
        .filter((c: any) => !!(c as any)?.eventOnly)
        .map((c: any) => String((c as any).id))
        .slice(0, 6);

      switch (choiceId) {
        case "start":
          return {
            note:
	              "Rung 1: +30 gold\nRung 2: +60 gold\nRung 3: choose 1 of 2 event-only consumables\nRung 4: choose 1 of 3 event-only cards\nRung 5: 🧾 Perfect Record (supply)",
            consumables: eventOnlyConsumableIds,
            cards: eventOnlyCardIds,
	            // Rung 5 reward is fixed.
	            supplies: ["sup_no_negative_cards"],
          };
        case "leave":
          return { note: "Back away before the proctor notices." };
      }
    }


    return null;
  };

  const deckUpgradable = (props.deckCardIds ?? []).filter((cid) => upgradeCardId(cid) !== cid);
  const canConfirmUpgrade = node.step === "UPGRADE_PICK" && !!pickedBaseId && upgradeCardId(pickedBaseId) !== pickedBaseId;

  const pickedUpgradedId = pickedBaseId ? upgradeCardId(pickedBaseId) : null;
  const baseDef = pickedBaseId ? maps.cardById.get(pickedBaseId) : null;
  const upDef = pickedUpgradedId ? maps.cardById.get(pickedUpgradedId) : null;

  const renderDeckCardTile = (cid: string, key: string) => {
    const def: any = maps.cardById.get(cid);
    const rarity = String(def?.rarity ?? "Common").toLowerCase();
    const title = `${def?.name ?? cid}\n${cardDescForUi(def as any)}${(def as any)?.exhaust ? `\n${EXHAUST_TOOLTIP}` : ""}\nRarity: ${String(def?.rarity ?? "Common")}`;
    const isNeg = String(cid ?? "").startsWith("neg_");

    return (
      <button
        key={key}
        type="button"
        className={
          "handCard panel soft cardTile shopCardTile " +
          `rarity-${rarity}` +
          (isNeg ? " negativeCard" : "") +
          (pickedBaseId === cid ? " selected" : "")
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
        }}
        title={title}
        onMouseEnter={() => {
          try {
            sfx.cardHover();
          } catch {}
        }}
        onClick={() => {
          try {
            sfx.click();
          } catch {}
          setPickedBaseId(cid);
        }}
      >
        <div>
          <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {def?.name ?? cid}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis" }}>
            {cardDescForUi(def as any)}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span className="badge" title={String(def?.rarity ?? "Common")}
            style={{ fontSize: 12, padding: "4px 8px" }}
          >
            {String(def?.rarity ?? "Common")}
          </span>
          <span className="muted" style={{ fontSize: 12 }}>
            ⚡ {Number(def?.cost ?? 0)}
          </span>
        </div>
      </button>
    );
  };

  const UpgradeModal = node.step !== "UPGRADE_PICK" || !upgradeModalOpen ? null : (
    <div
      onClick={() => {
        try {
          sfx.click();
        } catch {}
        setUpgradeModalOpen(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        // Must sit above the draggable Run Loadout panel (zIndex ~9999) and other modals.
        zIndex: 200000,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
      }}
    >
      <div
        className="panel"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(980px, 100%)", maxHeight: "86vh", overflow: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Upgrade a card</div>
          <button
            className="btn"
            onMouseEnter={() => {
              try {
                sfx.cardHover();
              } catch {}
            }}
            onClick={() => {
              try {
                sfx.click();
              } catch {}
              setUpgradeModalOpen(false);
            }}
          >
            Close
          </button>
        </div>

        <div className="muted" style={{ marginTop: 6, fontSize: 12, whiteSpace: "pre-wrap" }}>
          {(node as any).pendingUpgradeText ?? "Select a card, then confirm."}
        </div>

        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "1fr 84px 1fr",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div className="panel" style={{ minHeight: 170, display: "grid", placeItems: "center", background: "rgba(0,0,0,0.18)" }}>
            {pickedBaseId ? renderDeckCardTile(pickedBaseId, `picked:${pickedBaseId}`) : <div className="muted" style={{ fontSize: 12 }}>Pick a card</div>}
          </div>
          <div style={{ display: "grid", placeItems: "center" }} aria-hidden>
            <div style={{ fontSize: 44, opacity: 0.9 }}>➡️</div>
          </div>
          <div className="panel" style={{ minHeight: 170, display: "grid", placeItems: "center", background: "rgba(0,0,0,0.18)" }}>
            {pickedUpgradedId && upDef ? (
              <div style={{ transform: "scale(1)", pointerEvents: "none", opacity: 0.95 }}>
                {renderDeckCardTile(pickedUpgradedId, `up:${pickedUpgradedId}`)}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 12 }}>Upgraded preview</div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
          <button
            className="btn"
            disabled={!pickedBaseId}
            onMouseEnter={() => {
              try {
                sfx.cardHover();
              } catch {}
            }}
            onClick={() => {
              try {
                sfx.click();
              } catch {}
              setPickedBaseId(null);
            }}
          >
            Clear
          </button>
          <button
            className="btn primary"
            disabled={!canConfirmUpgrade}
            title={!canConfirmUpgrade ? "Pick an upgradable card" : ""}
            onMouseEnter={() => {
              try {
                sfx.cardHover();
              } catch {}
            }}
            onClick={() => {
              if (!pickedBaseId) return;
              try {
                sfx.hammer();
              } catch {}
              props.onPickUpgrade(pickedBaseId);
              setUpgradeModalOpen(false);
            }}
          >
            Confirm Upgrade
          </button>
        </div>

        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
          }}
        >
          {deckUpgradable.length === 0 ? (
            <div className="muted" style={{ fontSize: 12 }}>
              No upgradable cards in your deck.
            </div>
          ) : (
            deckUpgradable.map((cid, idx) => renderDeckCardTile(cid, `deck:${cid}:${idx}`))
          )}
        </div>
      </div>
    </div>
  );

  const Title = ev?.title ?? "Event";
  const Intro = ev?.intro ?? ["..."];

  return (
    <div className="container">
      <div className="header">
        <div />
        <span className="badge" title="Events offer unique outcomes">
          ❓ <strong>Encounter</strong>
        </span>
      </div>

      <div className="eventLayout">
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 18, lineHeight: 1.15 }}>{Title}</div>
            </div>
          </div>

          <div className="eventArt" aria-hidden>
            {artUrl ? (
              <img
                src={artUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 12 }}
              />
            ) : (
              "❓"
            )}
          </div>

          <div className="panel soft" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Story</div>
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
              {Intro.map((p, idx) => (
                <p key={idx} style={{ margin: idx === 0 ? 0 : "10px 0 0" } }>{p}</p>
              ))}
            </div>
          </div>

          
          {node.step === "QUESTION_GATE" && (
            <div className="panel soft" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Question Gate</div>
              <div className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
                <p style={{ margin: 0 }}>{String((node as any).gate?.promptText ?? "Answer the question to proceed.")}</p>
                <div style={{ marginTop: 10 }} className="badge" title="Solve to leave">
                  🧮 <strong>{String((node as any).gate?.question?.prompt ?? "")}</strong>
                </div>
              </div>
            </div>
          )}

          {node.step === "HALLWAY" && node.eventId === "hallway_shortcut" && (() => {
            const lockers: any[] = (node as any).hallwayLockers ?? [];
            const pending: any = (node as any).hallwayPending ?? null;
            const quiz: any = (node as any).hallwayQuiz ?? null;
            const tally: any = (node as any).hallwayTally ?? { goldGained: 0, goldLost: 0, healed: 0, damageTaken: 0, supplyIds: [] };
            const lastText = String((node as any).hallwayLastText ?? "");
            const allOpened = lockers.length > 0 && lockers.every((l) => !!l?.opened);

            const lockerDoorUrl = eventImg("locker_door.webp");
            const openLockerUrl = eventImg("open_locker.webp") || "";

            const labelFor = (k: string) => {
              switch (k) {
                case "gold": return "💰 +40 gold";
                case "heal": return "🩹 Heal 15";
                case "event_supply": return "🎒 Event-only supply";
                case "lose_gold": return "💸 -40 gold";
                case "damage": return "🩸 Take 15 damage";
                case "ambush": return "⚠️ Ambush";
                default: return "???";
              }
            };

            const iconFor = (k: string) => {
              switch (k) {
                case "gold": return "💰";
                case "heal": return "🩹";
                case "event_supply": return "🎒";
                case "lose_gold": return "💸";
                case "damage": return "🩸";
                case "ambush": return "⚠️";
                default: return "❓";
              }
            };

            const supplyNameForId = (sid: string) => {
              const s = SUPPLIES_POOL_10.find((x) => x.id === sid);
              return s ? s.name : sid;
            };

            // Fullscreen locker modal (no scrolling). The lockers are small on purpose;
            // the selected locker reveals in a large center panel.
            const rightGap = "clamp(12px, 26vw, 360px)";
            const modalInset = { top: "2vh", bottom: "2vh", left: "2vw", right: rightGap } as const;

            const showImg = (isOpen: boolean) => (isOpen && openLockerUrl ? openLockerUrl : lockerDoorUrl);

            const lockerBgForKind = (k: string) => {
              if (k === "gold" || k === "heal" || k === "event_supply") return "rgba(16, 185, 129, 0.18)";
              if (k === "ambush") return "rgba(239, 68, 68, 0.18)";
              if (k === "lose_gold" || k === "damage") return "rgba(245, 158, 11, 0.18)";
              return "rgba(255,255,255,0.08)";
            };

            const shortFor = (k: string) => {
              switch (k) {
                case "gold": return "+40";
                case "heal": return "+15";
                case "event_supply": return "SUPPLY";
                case "lose_gold": return "-40";
                case "damage": return "-15";
                case "ambush": return "AMBUSH";
                default: return "";
              }
            };

            const selectedKind = pending ? String((pending as any)?.kind ?? "") : "";
            const selectedId = pending ? String((pending as any)?.id ?? "") : "";
            const revealLabel = pending ? labelFor(String((pending as any)?.kind ?? "")) : "";

            const showQuiz =
              pending &&
              (selectedKind === "damage" || selectedKind === "lose_gold") &&
              quiz &&
              quiz.pendingIndex === pending.index;

            const canInteractWithLockers = !quiz && !pending;
            const ambushUnresolved = lockers.some((l: any) => l?.kind === "ambush" && !!l?.opened && !l?.collected);

            const modal = (
              // NOTE: This overlay must stay *below* the draggable Run Loadout panel
              // (zIndex: 9999) so players can still inspect/use it during this mini-event.
              <div style={{ position: "fixed", inset: 0, zIndex: 9000 }}>
                {/* Dim only the main play area; keep the Run Loadout side-gap clearer. */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    right: modalInset.right,
                    background: "rgba(0,0,0,0.78)",
                  }}
                />

                <div
                  className="panel soft"
                  style={{
                    position: "absolute",
                    top: modalInset.top,
                    bottom: modalInset.bottom,
                    left: modalInset.left,
                    right: modalInset.right,
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 18 }}>Hallway Shortcut</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                        Open lockers to find rewards — but some are traps.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn"
                      disabled={!!quiz || ambushUnresolved}
                      style={(!!quiz || ambushUnresolved) ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
                      onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
                      onClick={() => {
                        if (quiz || ambushUnresolved) return;
                        try { sfx.click(); } catch {}
                        props.onChoose("exit");
                      }}
                    >
                      Leave Shortcut
                    </button>
                  </div>

                  {/* Lockers row (always visible). */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                      gap: 12,
                      alignItems: "stretch",
                      justifyItems: "stretch",
                      flex: "0 0 auto",
                    }}
                  >
                    {Array.from({ length: 6 }).map((_, i) => {
                      const l = lockers[i];
                      const isOpen = !!l?.opened;
                      const isCollected = !!l?.collected;
                      const isNegated = !!(l as any)?.negated;
                      const isSelected = pending && pending.index === i;
                      const pendingLockerCollected = pending ? !!lockers[pending.index]?.collected : false;
                      const kind = String(l?.kind ?? "");
                      const imgUrl = showImg(isOpen);

                      // Lockers are clickable when the quiz isn't active. If a locker is currently
                      // pending but was already collected, don't block interaction with other lockers.
                      const canClick = !quiz && (!pending || pendingLockerCollected || pending.index === i);

                      const disabled = isCollected ? true : !canClick;
                      const title = isCollected ? (isNegated ? "Negated" : "Collected") : isOpen ? "Select" : "Open";

                      return (
                        <button
                          key={i}
                          className="btn"
                          disabled={disabled}
                          title={title}
                          style={{
                            width: "100%",
                            aspectRatio: "2 / 3",
                            padding: 8,
                            borderRadius: 14,
                            position: "relative",
                            overflow: "hidden",
                            opacity: isCollected ? 0.5 : isOpen ? 0.9 : 1,
                            outline: isSelected ? "2px solid rgba(250, 204, 21, 0.9)" : "none",
                          }}
                          onMouseEnter={() => {
                            try { sfx.cardHover(); } catch {}
                          }}
                          onClick={() => {
                            if (disabled) return;
                            if (quiz && (!pending || pending.index != i)) return;
                            if (pending && !pendingLockerCollected && pending.index !== i) return;
                            try { sfx.confirm(); } catch {}
                            props.onChoose(`locker_${i}`);
                          }}
                        >
                          {imgUrl ? (
                            <img
                              src={imgUrl}
                              alt=""
                              style={{
                                position: "absolute",
                                inset: 0,
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                opacity: 0.95,
                              }}
                            />
                          ) : null}

                          {/* tint for readability */}
                          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.18)" }} />

                          {/* Content marker inside open locker */}
                          {isOpen ? (
                            <div
                              style={{
                                position: "absolute",
                                inset: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <div
                                style={{
                                  textAlign: "center",
                                  background: lockerBgForKind(kind),
                                  border: "1px solid rgba(255,255,255,0.14)",
                                  boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                                  borderRadius: 14,
                                  padding: "10px 12px",
                                  minWidth: 84,
                                }}
                              >
                                <div style={{ fontSize: 28, lineHeight: 1 }}>{iconFor(kind)}</div>
                                <div style={{ fontWeight: 900, fontSize: 12, marginTop: 6 }}>{shortFor(kind)}</div>
                                <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                                  {isCollected ? (isNegated ? "Negated" : "Collected") : "Revealed"}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div
                              style={{
                                position: "absolute",
                                left: 10,
                                right: 10,
                                bottom: 10,
                                display: "flex",
                                justifyContent: "center",
                              }}
                            >
                              <div
                                className="muted"
                                style={{
                                  fontSize: 11,
                                  background: "rgba(0,0,0,0.35)",
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  padding: "4px 8px",
                                  borderRadius: 999,
                                }}
                              >
                                Click to open
                              </div>
                            </div>
                          )}

                          {/* locker index */}
                          <div
                            style={{
                              position: "absolute",
                              top: 8,
                              left: 8,
                              fontWeight: 900,
                              fontSize: 12,
                              background: "rgba(0,0,0,0.35)",
                              border: "1px solid rgba(255,255,255,0.12)",
                              padding: "3px 6px",
                              borderRadius: 10,
                            }}
                          >
                            {i + 1}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Reveal panel (big, centered) */}
                  <div
                    className="panel soft"
                    style={{
                      flex: "1 1 auto",
                      minHeight: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 14,
                      overflow: "hidden",
                    }}
                  >
                    {!pending ? (
                      <div className="muted" style={{ fontSize: 13, textAlign: "center", maxWidth: 520 }}>
                        Pick a locker. After you open it, you’ll see what’s inside here and can choose to collect it.
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 18,
                          width: "100%",
                          height: "100%",
                        }}
                      >
                        <div
                          style={{
                            position: "relative",
                            height: "min(56vh, 520px)",
                            aspectRatio: "2 / 3",
                            borderRadius: 16,
                            overflow: "hidden",
                            border: "1px solid rgba(255,255,255,0.12)",
                            boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
                            background: "rgba(0,0,0,0.2)",
                          }}
                        >
                          {openLockerUrl ? (
                            <img
                              src={openLockerUrl}
                              alt=""
                              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : null}
                          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.18)" }} />

                          <button
                            type="button"
                            className="btn"
                            style={{
                              position: "absolute",
                              left: "50%",
                              top: "54%",
                              transform: "translate(-50%, -50%)",
                              minWidth: 220,
                              padding: "10px 12px",
                              borderRadius: 16,
                              background: lockerBgForKind(selectedKind),
                              border: "1px solid rgba(255,255,255,0.14)",
                            }}
                            onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
                            onClick={() => {
                              // Clicking the item itself performs the same action as the main button.
                              if (showQuiz) return;
                              try {
                                const k = String((pending as any)?.kind ?? "");
                                if (k === "ambush") sfx.hurt();
                                else sfx.confirm();
                              } catch {}
                            props.onChoose("hallway_collect");
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                              <div style={{ fontSize: 28, lineHeight: 1 }}>{iconFor(selectedKind)}</div>
                              <div style={{ textAlign: "left" }}>
                                <div style={{ fontWeight: 900 }}>{revealLabel}</div>
                                {selectedKind === "event_supply" && selectedId ? (
                                  <div className="muted" style={{ fontSize: 12 }}>{supplyNameForId(selectedId)}</div>
                                ) : null}
                                {(selectedKind === "damage" || selectedKind === "lose_gold") ? (
                                  <div className="muted" style={{ fontSize: 12 }}>Click to attempt a question to negate</div>
                                ) : selectedKind === "ambush" ? (
                                  <div className="muted" style={{ fontSize: 12 }}>Click to fight</div>
                                ) : (
                                  <div className="muted" style={{ fontSize: 12 }}>Click to collect</div>
                                )}
                              </div>
                            </div>
                          </button>
                        </div>

                        <div style={{ flex: "1 1 auto", minWidth: 280, maxWidth: 520 }}>
                          <div style={{ fontWeight: 900, fontSize: 16 }}>Locker {Number(pending.index ?? 0) + 1}</div>
                          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                            {lastText ? lastText : ""}
                          </div>

                          <div style={{ marginTop: 12 }}>
                            {showQuiz ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                <div style={{ fontWeight: 900 }}>Answer to negate the penalty</div>
                                <div style={{ fontSize: 18 }}>{String(quiz.question?.prompt ?? "Solve:")}</div>
                                {quiz.question?.hint ? (
                                  <div className="muted" style={{ fontSize: 12 }}>Hint: {String(quiz.question.hint)}</div>
                                ) : null}
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <input
                                    value={hallwayAnswer}
                                    inputMode="numeric"
                                    className="input"
                                    style={{ width: 160 }}
                                    placeholder="Answer"
                                    onChange={(e) => setHallwayAnswer(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        const raw = String(hallwayAnswer ?? '').trim();
                                      const n0 = Number(raw);
                                      const n = Number.isFinite(n0) ? n0 : NaN;
                                        try {
                                          const expected = Number(quiz?.question?.answer);
                                          const ok = Number.isFinite(expected) && n === expected;
                                          if (!ok && selectedKind === "damage") sfx.hurt();
                                          else sfx.confirm();
                                        } catch {}
                                        props.onHallwayAnswer(n);
                                      setHallwayAnswer('');
                                      }
                                    }}
                                  />
                                  <button
                                    className="btn primary"
                                    onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
                                    onClick={() => {
                                      const raw = String(hallwayAnswer ?? '').trim();
                                        const n0 = Number(raw);
                                        const n = Number.isFinite(n0) ? n0 : NaN;
                                      try {
                                        const expected = Number(quiz?.question?.answer);
                                        const ok = Number.isFinite(expected) && n === expected;
                                        if (!ok && selectedKind === "damage") sfx.hurt();
                                        else sfx.confirm();
                                      } catch {}
                                      props.onHallwayAnswer(n);
                                      setHallwayAnswer('');
                                    }}
                                  >
                                    Submit
                                  </button>
                                </div>
                                <div className="muted" style={{ fontSize: 12 }}>
                                  Correct answer: no penalty. Wrong answer: penalty applies.
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="btn primary"
                                onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
                                onClick={() => {
                                  try {
                                    if (selectedKind === "ambush") sfx.hurt();
                                    else sfx.confirm();
                                  } catch {}
                                  props.onChoose("hallway_collect");
                                }}
                              >
                                {selectedKind === "ambush" ? "Fight!" : (selectedKind === "damage" || selectedKind === "lose_gold") ? "Attempt to Negate" : "Collect"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );

            // IMPORTANT: Render the hallway overlay at document.body level so it is not
            // constrained by any transformed/overflowing parent containers.
            return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
          })()}

          {node.step === "CONSUMABLE_CLAIM" && (() => {
            const pendingIds = Array.isArray((node as any).pendingConsumableIds) ? (node as any).pendingConsumableIds : [];
            const inv = Array.isArray(props.consumables) ? props.consumables : [];
            const full = inv.length >= 3;
            const rewardText = String((node as any).pendingRewardText ?? "");

            const modal = (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.65)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 16,
                  zIndex: 60,
                }}
              >
                <div className="panel" style={{ width: "min(860px, 92vw)", maxHeight: "86vh", overflow: "auto" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontWeight: 900, fontSize: 18 }}>Rewards</div>
                    <button
                      type="button"
                      className="btn"
                      onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
                      onClick={() => {
                        try { sfx.confirm(); } catch {}
                        props.onHoverTargetsChange?.(null);
                        props.onComplete();
                      }}
                    >
                      Close
                    </button>
                  </div>

                  {rewardText ? (
                    <div className="muted" style={{ marginTop: 10, lineHeight: 1.55 }}>
                      {renderMultilineWithDamage(rewardText)}
                    </div>
                  ) : null}

                  <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                    You can take rewards now, or close this node and come back (before choosing your next node) to claim later.
                  </div>

                  <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                    {pendingIds.map((cid: string) => {
                      const def: any = props.maps.consumableById.get(cid);
                      return (
                        <div key={cid} className="panel soft">
                          <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900 }}>
                            <span style={{ fontSize: 18 }}>{consumableIcon(cid)}</span>
                            <span>{String(def?.name ?? cid)}</span>
                          </div>
                          <div className="muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
                            {String(def?.desc ?? "")}
                          </div>
                          <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              className="btn primary"
                              disabled={full}
                              onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
                              onClick={() => {
                                if (full) return;
                                try { sfx.confirm(); } catch {}
                                props.onPickConsumable?.(cid);
                              }}
                            >
                              {full ? "Inventory Full" : "Take"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Your consumables</div>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                      Max 3. If you’re full, discard one to make room, then take a reward.
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                      {inv.length ? (
                        inv.map((cid: string) => {
                          const def: any = props.maps.consumableById.get(cid);
                          return (
                            <div key={cid} className="panel soft">
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900 }}>
                                <span style={{ fontSize: 18 }}>{consumableIcon(cid)}</span>
                                <span>{String(def?.name ?? cid)}</span>
                              </div>
                                <button
                                  type="button"
                                  className="btn"
                                  onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
                                  onClick={() => {
                                    if (!props.onDiscardConsumable) return;
                                    try { sfx.bad(); } catch {}
                                    props.onDiscardConsumable(cid);
                                  }}
                                >
                                  Discard
                                </button>
                              </div>
                              <div className="muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
                                {String(def?.desc ?? "")}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="muted" style={{ fontSize: 12 }}>You have no consumables.</div>
                      )}
                    </div>
                  </div>

                  {full ? (
                    <div className="muted" style={{ fontSize: 12, marginTop: 14 }}>
                      ⚠️ Inventory is full — discard one consumable above to enable taking rewards.
                    </div>
                  ) : null}
                </div>
              </div>
            );

            return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
          })()}

          {node.step === "RESULT" && (
            <div className="panel soft" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Result</div>
              <div className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
                {renderMultilineWithDamage(String((node as any).resultText ?? ""))}
              </div>
            </div>
          )}

          {node.step === "EXAM_LADDER_FEEDBACK" && (
            <div className="panel soft" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Exam Ladder</div>
              <div className="muted" style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {String((node as any).resultText ?? "")}
              </div>
            </div>
          )}

          {((node.step === "CONSUMABLE_PICK" || node.step === "SUPPLY_PICK" || node.step === "CARD_PICK") &&
            ((node as any).pendingRewardText || (node as any).pendingCardResultText)) ? (
            <div className="panel soft" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Reward</div>
              <div className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
                {renderMultilineWithDamage(String((node as any).pendingRewardText ?? (node as any).pendingCardResultText ?? ""))}
              </div>
            </div>
          ) : null}

          
          {node.step === "UPGRADE_PICK" && (
            <div className="panel soft" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Choose a card to upgrade</div>
              <div className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
                {(node as any).pendingUpgradeText ?? "Select a card, then confirm."}
              </div>
            </div>
          )}

          <hr className="sep" />

          {node.step === "RESULT" && (
                              <button
                                type="button"
              className="btn primary"
              onMouseEnter={() => {
                try {
                  sfx.cardHover();
                } catch {}
              }}
              onClick={() => {
                try {
                  sfx.confirm();
                } catch {}
                props.onComplete();
              }}
            >
              Continue
            </button>
          )}
        </div>

        <div className="panel">
          {node.step === "INTRO" && (
            <React.Fragment>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Choices</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {ev?.id === "vault" ? "Pick an offering." : "Make a choice."}
              </div>

              <div>
                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  {choices.map((c) => (
                    <button
                      key={c.id}
                      className="btn eventChoiceBtn"
                      disabled={c.disabled}
                      title={c.disabled ? c.disabledReason : ""}
                      style={c.disabled ? { opacity: 0.7, cursor: "not-allowed" } : undefined}
                      onMouseEnter={() => {
                        // Avoid rapid enter/leave loops that can lock up the UI in some browsers.
                        if (lastHoverChoiceIdRef.current === c.id) return;
                        lastHoverChoiceIdRef.current = c.id;
                        try {
                          sfx.cardHover();
                        } catch {}
                        props.onHoverTargetsChange?.(hoverTargetsForChoice(c.id));
                        setHoverPreview(previewForChoice(c.id));
                      }}
                      onClick={() => {
                        if (c.disabled) return;

                        const dmg = guaranteedDamageForChoice(ev?.id, c.id);
                        if (dmg && Number(props.hp ?? 0) - dmg <= 0) {
                          try { sfx.bad(); } catch {}
                          setLethalConfirm({ choiceId: c.id, damage: dmg });
                          return;
                        }

                        commitChoice(c.id);
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900 }}>{c.label}</div>
                        <div className="eventChoiceHint">{c.hint}</div>
                      </span>
                      <span className="meta">
                        {c.tags.map((t) => (
                          <span key={t} className="badge">
                            <strong>{t}</strong>
                          </span>
                        ))}
                      </span>
                    </button>
                  ))}
                </div>
	              </div>

              {lethalConfirm ? (() => {
                const modal = (
                  <div
                    style={{
                      position: "fixed",
                      inset: 0,
                      background: "rgba(0,0,0,0.72)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 16,
                      zIndex: 80,
                    }}
                  >
                    <div className="panel" style={{ width: "min(640px, 92vw)" }}>
                      <div style={{ fontWeight: 900, fontSize: 18 }}>This will defeat you</div>
                      <div className="muted" style={{ marginTop: 8, lineHeight: 1.55 }}>
                        This option will deal <span className="damageText" style={{ fontWeight: 900 }}>{lethalConfirm.damage} damage</span> and reduce you to 0 HP.
                        <br />
                        Are you sure you want to continue?
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
                        <button
                          type="button"
                          className="btn"
                          onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
                          onClick={() => {
                            try { sfx.confirm(); } catch {}
                            setLethalConfirm(null);
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn primary"
                          onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
                          onClick={() => {
                            const id = lethalConfirm.choiceId;
                            setLethalConfirm(null);
                            commitChoice(id);
                          }}
                        >
                          Yes, proceed
                        </button>
                      </div>
                    </div>
                  </div>
                );

                return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
              })() : null}

              {/*
                IMPORTANT:
                Keep the preview area mounted with a stable height so that hovering an option
                doesn't cause layout reflow that can trigger rapid enter/leave loops (which looks
                like the whole UI disappearing).
              */}
              <div
                className="panel soft"
                style={{
                  marginTop: 12,
                  height: 260,
                  // Always reserve a scrollbar so the panel width doesn't change on hover
                  // (prevents hover enter/leave flicker loops in some browsers).
                  overflowY: "scroll",
                  overflowX: "hidden",
                  // Keep layout stable even when scrollbars appear/disappear in different browsers.
                  scrollbarGutter: "stable",
                } as any}
              >
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Preview</div>

                {!hoverPreview ? (
                  <div className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
                    Hover an option to preview rewards.
                  </div>
                ) : (
                  <React.Fragment>
                    {hoverPreview.note ? (
                      <div className="muted" style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                        {renderMultilineWithDamage(hoverPreview.note)}
                      </div>
                    ) : null}

                    {hoverPreview.consumables?.length ? (
                      <div style={{ marginTop: hoverPreview.note ? 10 : 0 }}>
                        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                          Consumable{hoverPreview.consumables.length > 1 ? "s" : ""}
                        </div>
                        <div style={{ display: "grid", gap: 8 }}>
                          {hoverPreview.consumables.map((id) => {
                            const def: any = maps.consumableById.get(id);
                            return (
                              <div key={id} className="panel soft cardTile" style={{ padding: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900 }}>
                                  <span style={{ fontSize: 18 }}>{consumableIcon(id)}</span>
                                  <span>{def?.name ?? id}</span>
                                </div>
                                <div className="muted" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>
                                  {String(def?.desc ?? def?.description ?? "")}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {hoverPreview.supplies?.length ? (
                      <div style={{ marginTop: 10 }}>
                        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                          {hoverPreview.supplies.length > 1 ? "Supplies" : "Supply"}
                        </div>
                        <div style={{ display: "grid", gap: 8 }}>
                          {hoverPreview.supplies.map((id) => {
                            const def: any = maps.supplyById.get(id);
                            return (
                              <div key={id} className="panel soft cardTile" style={{ padding: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900 }}>
                                  <span style={{ fontSize: 18 }}>{def?.emoji ?? "🎒"}</span>
                                  <span>{def?.name ?? id}</span>
                                </div>
                                <div className="muted" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>
                                  {String(def?.desc ?? def?.description ?? "")}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {hoverPreview.cards?.length ? (
                      <div style={{ marginTop: 10 }}>
                        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                          Card{hoverPreview.cards.length > 1 ? "s" : ""}
                        </div>
                        <div style={{ display: "grid", gap: 8 }}>
                          {hoverPreview.cards.map((id) => {
                            const def: any = maps.cardById.get(id);
                            const isNeg = String(id ?? "").startsWith("neg_");
                            const rarityClass = def?.rarity ? ` rarity-${String(def.rarity).toLowerCase()}` : "";
                            return (
                              <div
                                key={id}
                                className={"panel soft cardTile" + rarityClass + (isNeg ? " negativeCard" : "")}
                                style={{ padding: 10 }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900 }}>
                                  <span style={{ fontSize: 18 }}>🃏</span>
                                  <span>{def?.name ?? id}</span>
                                </div>
                                <div className="muted" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>
                                  {def ? cardDescForUi(def as any) : ""}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </React.Fragment>
                )}
              </div>
            </React.Fragment>
          )}

          

          {node.step === "QUESTION_GATE" && (() => {
            const gate: any = (node as any).gate ?? null;
            const q = gate?.question;
            const parsed = gateAnswer.trim() === "" ? null : Number(gateAnswer);
            const canSubmit = parsed !== null && Number.isFinite(parsed);

            if (!gate || !q) {
              return (
                <>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>Question Gate</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    Something went wrong: no question found.
                  </div>
                </>
              );
            }

            return (
              <>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Question Gate</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Type your answer to leave.
                </div>

                {Number(gate?.wrongDamage ?? 0) > 0 ? (
                  <div className="damageText" style={{ fontSize: 12, marginTop: 6 }}>
                    Wrong answer: take {String(gate.wrongDamage)} damage.
                  </div>
                ) : null}

                <div className="panel soft" style={{ marginTop: 12 }}>
                  <div className="muted" style={{ fontSize: 12 }}>Question</div>
                  <div style={{ fontWeight: 900, marginTop: 4 }}>{String(q.prompt ?? "")}</div>

                  <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      className="input"
                      type="number"
                      placeholder="Answer"
                      value={gateAnswer}
                      onChange={(e) => setGateAnswer(e.target.value)}
                      style={{ maxWidth: 160 }}
                    />
                    <button
                      className="btn primary"
                      disabled={!canSubmit}
                      title={!canSubmit ? "Enter an answer" : "Submit"}
                      onMouseEnter={() => {
                        try {
                          sfx.cardHover();
                        } catch {}
                      }}
                      onClick={() => {
                        if (!canSubmit) return;
                        try {
                          sfx.click();
                        } catch {}
                        props.onGateAnswer(Number(gateAnswer));
                        setGateAnswer("");
                      }}
                    >
                      Submit
                    </button>
                  </div>

                  {!(typeof gate.wrongDamage === "number" && gate.wrongDamage > 0) ? (
                    <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                      Wrong answers may have consequences.
                    </div>
                  ) : null}
                </div>
              </>
            );
          })()}
          {node.step === "UPGRADE_PICK" && (
            <>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Upgrade</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Open the popup to choose a card to upgrade.
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                      <button
                        type="button"
                  className="btn primary"
                  onMouseEnter={() => {
                    try {
                      sfx.cardHover();
                    } catch {}
                  }}
                  onClick={() => {
                    try {
                      sfx.click();
                    } catch {}
                    setUpgradeModalOpen(true);
                  }}
                >
                  Choose Card
                </button>
                {pickedBaseId ? (
                  <button
                    className="btn"
                    onMouseEnter={() => {
                      try {
                        sfx.cardHover();
                      } catch {}
                    }}
                    onClick={() => {
                      try {
                        sfx.click();
                      } catch {}
                      setPickedBaseId(null);
                    }}
                  >
                    Clear Selection
                  </button>
                ) : null}
              </div>

              {pickedBaseId && baseDef ? (
                <div className="panel soft" style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Selected</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {baseDef?.name ?? pickedBaseId}
                  </div>
                </div>
              ) : null}
            </>
          )}



                    {node.step === "EXAM_LADDER_FEEDBACK" && (() => {
                      const correctSoFar = Math.max(0, Math.floor(Number((node as any).examLadder?.correct ?? 0)));
                      let cashOutShort = "—";
                      let cashOutLong = "No reward yet.";
                      if (correctSoFar === 1) {
                        cashOutShort = "30g";
                        cashOutLong = "💰 30 gold";
                      } else if (correctSoFar === 2) {
                        cashOutShort = "60g";
                        cashOutLong = "💰 60 gold";
                      } else if (correctSoFar === 3) {
                        cashOutShort = "Consumable";
                        cashOutLong = "🎁 Choose 1 of 2 event consumables (or convert to gold if inventory is full)";
                      } else if (correctSoFar === 4) {
                        cashOutShort = "Card";
                        cashOutLong = "🃏 Choose 1 event card";
                      } else if (correctSoFar >= 5) {
                        cashOutShort = "Perfect Record";
                        cashOutLong = "🏆 Perfect Record";
                      }

                      return (
                        <>
                          <div style={{ fontWeight: 900, fontSize: 16 }}>Next Rung</div>
                          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                            Read the update on the left, then continue — or cash out to lock in your current reward.
                          </div>
                          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                            Cash out reward: <span style={{ fontWeight: 900 }}>{cashOutLong}</span>
                          </div>
                          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                            <button
                              className="btn primary"
                              onMouseEnter={() => {
                                try {
                                  sfx.cardHover();
                                } catch {}
                              }}
                              onClick={() => {
                                try {
                                  sfx.click();
                                } catch {}
                                props.onHoverTargetsChange?.(null);
                                props.onChoose("ladder_continue");
                              }}
                            >
                              Continue
                            </button>
                            <button
                              className="btn danger"
                              onMouseEnter={() => {
                                try {
                                  sfx.cardHover();
                                } catch {}
                              }}
                              onClick={() => {
                                try {
                                  sfx.click();
                                } catch {}
                                props.onHoverTargetsChange?.(null);
                                props.onChoose("ladder_cashout");
                              }}
                            >
                              Cash Out ({cashOutShort})
                            </button>
                          </div>
                        </>
                      );
                    })()}



          {node.step === "CONSUMABLE_PICK" && (() => {
            const ids: string[] = Array.isArray((node as any).pendingConsumableIds) ? (node as any).pendingConsumableIds : [];
            const selectedId = pickedRewardConsumableId;

            if (!ids.length) {
              return (
                <>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>Reward</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    No consumables offered.
                  </div>
                </>
              );
            }

            return (
              <>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Choose a Consumable</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Click one, then claim it. You can also skip for now and come back before choosing your next node.
                </div>

                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "stretch" }}>
                  {ids.map((id) => {
                    const def: any = maps.consumableById.get(id);
                    const name = def?.name ?? id;
                    const selected = selectedId === id;
                    const title = `${name}\n\n${String(def?.desc ?? "")}`;
                    return (
                      <button
                        key={id}
                        type="button"
                        className={"panel soft rewardTile " + (selected ? "selected" : "")}
                        style={{ width: 280, textAlign: "left", cursor: "pointer" }}
                        title={title}
                        onMouseEnter={() => {
                          try { sfx.cardHover(); } catch {}
                        }}
                        onClick={() => {
                          try { sfx.selectOn(); } catch {}
                          setPickedRewardConsumableId(id);
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900 }}>
                              <span style={{ fontSize: 18 }}>{consumableIcon(id)}</span>
                              <span>{name}</span>
                            </div>
                            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                              Consumable
                            </div>
                          </div>
                          <div style={{ fontSize: 18 }}>{selected ? "✅" : "➕"}</div>
                        </div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                          {String(def?.desc ?? "")}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                  <button
                    className="btn primary"
                    disabled={!selectedId || consumablesFull}
                    title={
                      !selectedId
                        ? "Click a consumable first"
                        : consumablesFull
                          ? "Inventory full — close and discard a consumable first"
                          : "Claim the selected consumable"
                    }
                    onMouseEnter={() => {
                      try { sfx.cardHover(); } catch {}
                    }}
                    onClick={() => {
                      if (!selectedId || consumablesFull) return;
                      try { sfx.confirm(); } catch {}
                      props.onHoverTargetsChange?.(null);
                      props.onPickConsumable?.(selectedId);
                    }}
                  >
                    {consumablesFull ? "Inventory Full" : "Claim"}
                  </button>
                  <button
                    className="btn"
                    onMouseEnter={() => { try { sfx.cardHover(); } catch {} }}
                    onClick={() => {
                      try { sfx.confirm(); } catch {}
                      props.onHoverTargetsChange?.(null);
                      props.onComplete();
                    }}
                  >
                    Skip for now
                  </button>
                </div>

                {consumablesFull ? (
                  <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                    ⚠️ Your consumable inventory is full. Close this node, discard a consumable in your Run Loadout, then come back to claim.
                  </div>
                ) : null}
              </>
            );
          })()}

          {node.step === "SUPPLY_PICK" && (() => {
            const ids: string[] = Array.isArray((node as any).pendingSupplyIds) ? (node as any).pendingSupplyIds : [];
            const selectedId = pickedRewardSupplyId;

            if (!ids.length) {
              return (
                <>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>Reward</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    No supplies offered.
                  </div>
                </>
              );
            }

            return (
              <>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Choose a Supply</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Click one to preview (your run stats will highlight), then claim it.
                </div>

                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "stretch" }}>
                  {ids.map((id) => {
                    const def: any = maps.supplyById.get(id);
                    const name = def?.name ?? id;
                    const selected = selectedId === id;
                    const title = `${name}\n\n${String(def?.desc ?? "")}`;
                    return (
                      <button
                        key={id}
                        type="button"
                        className={"panel soft rewardTile " + (selected ? "selected" : "")}
                        style={{ width: 280, textAlign: "left", cursor: "pointer" }}
                        title={title}
                        onMouseEnter={() => {
                          try { sfx.cardHover(); } catch {}
                          props.onHoverTargetsChange?.({ supplyIds: [id] });
                        }}
                        onMouseLeave={() => {
                          props.onHoverTargetsChange?.(null);
                        }}
                        onClick={() => {
                          try { sfx.selectOn(); } catch {}
                          setPickedRewardSupplyId(id);
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div>
                            <div style={{ fontWeight: 900 }}>{(def?.emoji ? def.emoji + " " : "") + name}</div>
                            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                              Supply
                            </div>
                          </div>
                          <div style={{ fontSize: 18 }}>{selected ? "✅" : "➕"}</div>
                        </div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                          {String(def?.desc ?? "")}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  className="btn primary"
                  style={{ marginTop: 12 }}
                  disabled={!selectedId}
                  title={!selectedId ? "Click a supply first" : "Claim the selected supply"}
                  onMouseEnter={() => {
                    try { sfx.cardHover(); } catch {}
                  }}
                  onClick={() => {
                    if (!selectedId) return;
                    try { sfx.confirm(); } catch {}
                    props.onHoverTargetsChange?.(null);
                    props.onPickSupply?.(selectedId);
                  }}
                >
                  Claim
                </button>
              </>
            );
          })()}

          {node.step === "CARD_PICK" && (() => {
            const ids: string[] = Array.isArray((node as any).pendingCardIds) && (node as any).pendingCardIds.length
              ? (node as any).pendingCardIds
              : ((node as any).pendingCardId ? [(node as any).pendingCardId] : []);

            if (!ids.length) {
              return (
                <>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>Card Offer</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    Something went wrong: no card offer found.
                  </div>
                </>
              );
            }

            const selectedId = pickedRewardCardId && ids.includes(pickedRewardCardId) ? pickedRewardCardId : null;

            return (
              <>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Card Offer</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Click a card, then add it to your deck.
                </div>

                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "stretch" }}>
                  {ids.map((pendingId) => {
                    const def: any = maps.cardById.get(pendingId);
                    if (!def) return null;
                    const rarity = String(def?.rarity ?? "Common").toLowerCase();
                    const isNeg = String(pendingId ?? "").startsWith("neg_");
                    const selected = selectedId === pendingId;
                    const title = `${def.name} (${def.type})\n${cardDescForUi(def as any)}${(def as any)?.exhaust ? `\n${EXHAUST_TOOLTIP}` : ""}\nRarity: ${String(def?.rarity ?? "Common")}`;

                    return (
                      <button
                        key={pendingId}
                        type="button"
                        className={
                          "panel soft cardTile rewardTile " +
                          `rarity-${rarity}` +
                          (isNeg ? " negativeCard" : "") +
                          (selected ? " selected" : "")
                        }
                        style={{ width: 280, textAlign: "left", cursor: "pointer" }}
                        title={title}
                        onMouseEnter={() => {
                          try { sfx.cardHover(); } catch {}
                        }}
                        onClick={() => {
                          try { sfx.selectOn(); } catch {}
                          setPickedRewardCardId(pendingId);
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div>
                            <div style={{ fontWeight: 900 }}>{def.name}</div>
                            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{def.type}</div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                            <div className="badge" title="Energy cost">⚡ <strong>{Number(def.cost ?? 0)}</strong></div>
                            <div style={{ fontSize: 18 }}>{selected ? "✅" : "➕"}</div>
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

                <button
                  className="btn primary"
                  style={{ marginTop: 12 }}
                  disabled={!selectedId}
                  title={!selectedId ? "Click a card first" : "Add the selected card to your deck"}
                  onMouseEnter={() => {
                    try { sfx.cardHover(); } catch {}
                  }}
                  onClick={() => {
                    if (!selectedId) return;
                    try { sfx.confirm(); } catch {}
                    props.onHoverTargetsChange?.(null);
                    props.onPickCard(selectedId);
                  }}
                >
                  Add to Deck
                </button>
              </>
            );
          })()}

          {node.step === "RESULT" && (
            <>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Done</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Read the result on the left, then continue.
              </div>
            </>
          )}
        </div>
      </div>

      {UpgradeModal}
    </div>
  );
}

function ShopNodeScreen(props: {
  node: Extract<NonNullable<GameState["nodeScreen"]>, { type: "SHOP" }>;
  gold: number;
  deckCardIds: string[];
  supplyIds: string[];
  consumables: string[];
  onBuy: (kind: ShopItemKind, id: string) => void;
  onShopRefresh?: () => void;
  onRemoveCard?: (cardId: string) => void;
  onComplete: () => void;
  maps: {
    supplyById: Map<string, any>;
    consumableById: Map<string, any>;
    cardById: Map<string, any>;
  };
}) {
  const { node, maps } = props;
  const title = String((node as any).title ?? "Shop");
  const subTitle = String((node as any).subTitle ?? "");
  const flavorText = String((node as any).flavorText ?? "");
  const isEventShop = !!(node as any).eventShop;

  const { supplyById, consumableById, cardById } = maps;

  const boughtSet = new Set((node.bought ?? []).map((b) => `${b.kind}:${b.id}`));

  const consumablesFull = (props.consumables ?? []).length >= 3;

  const refreshesUsed = Math.max(0, Math.floor(Number((node as any).refreshesUsed ?? 0)));
  const refreshCost = 75 + 25 * refreshesUsed;

  const removalsUsed = (node as any).removalsUsed ?? 0;
  const removalBase = 50 + 25 * Math.max(0, removalsUsed);
  const hasDiscount = (props.supplyIds ?? []).includes("sup_shop_discount");
  const removalCost = Math.max(1, Math.floor(removalBase * (hasDiscount ? 0.5 : 1)));

  const canOpenRemove =
    !!props.onRemoveCard && (props.deckCardIds ?? []).length > 1 && (props.gold ?? 0) >= removalCost;

  const [removeOpen, setRemoveOpen] = useState(false);
  const [removePick, setRemovePick] = useState<string | null>(null);
  const [removePickId, setRemovePickId] = useState<string | null>(null);

  const [pendingBuy, setPendingBuy] = useState<
    null | { kind: ShopItemKind; id: string; price: number; title: string; desc: string }
  >(null);

  // Floating tooltip for shop (uses a portal so it's never clipped/stacked under shop panels)
  const [floatingTip, setFloatingTip] = useState<null | { text: string; x: number; y: number }>(null);
  const tipNode = floatingTip
    ? (() => {
        const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
        const vh = typeof window !== "undefined" ? window.innerHeight : 800;

        const maxW = 340;
        const pad = 12;

        let left = floatingTip.x + 14;
        let top = floatingTip.y + 14;

        if (left + maxW + pad > vw) left = Math.max(pad, vw - maxW - pad);
        if (top + 140 + pad > vh) top = Math.max(pad, vh - 140 - pad);

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

  const BuyConfirmModal = !pendingBuy ? null : (
    <div
      onClick={() => setPendingBuy(null)}
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
      <div className="panel" onClick={(e) => e.stopPropagation()} style={{ width: "min(520px, 100%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Confirm Purchase</div>
          <button className="btn" onClick={() => setPendingBuy(null)}>
            Cancel
          </button>
        </div>

        <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
          Buy <strong>{pendingBuy.title}</strong> for 🪙 <strong>{pendingBuy.price}</strong>?
        </div>

        {pendingBuy.desc ? <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>{pendingBuy.desc}</div> : null}

        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            className="btn primary"
            disabled={(props.gold ?? 0) < pendingBuy.price}
            onMouseEnter={() => {
              try {
                sfx.cardHover();
              } catch {}
            }}
            onClick={() => {
              if ((props.gold ?? 0) < pendingBuy.price) {
                try {
                  sfx.bad();
                } catch {}
                return;
              }
              try {
                sfx.confirm();
              } catch {}
              props.onBuy(pendingBuy.kind, pendingBuy.id);
              setPendingBuy(null);
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );

  const cardTileSize: React.CSSProperties = {
    width: 205,
    minWidth: 205,
    height: 132,
    minHeight: 132,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  };

  const rarityClassForCardId = (id: string) => {
    const def: any = cardById.get(id);
    return `rarity-${String(def?.rarity ?? "Common").toLowerCase()}`;
  };

  const renderCardOffer = (offer: ShopOfferItem) => {
    const def: any = cardById.get(offer.id);
    const key = `card:${offer.id}`;
    const bought = boughtSet.has(`card:${offer.id}`);
    const afford = (props.gold ?? 0) >= offer.price;
    const isNeg = String(offer.id ?? "").startsWith("neg_");

    return (
      <button
        key={key}
        className={
          "handCard panel soft cardTile shopCardTile " +
          rarityClassForCardId(offer.id) +
          (isNeg ? " negativeCard" : "") +
          (bought ? " cardDisabled" : afford ? "" : " cardDisabled")
        }
        style={{
          ...cardTileSize,
          cursor: bought ? "default" : "pointer",
          opacity: bought ? 0.55 : afford ? 1 : 0.75,
          textAlign: "left",
        }}
        disabled={bought}
        onMouseEnter={() => {
          try {
            sfx.cardHover();
          } catch {}
        }}
        onClick={() => {
          if (bought) return;
          if (!afford) {
            try {
              sfx.bad();
            } catch {}
            return;
          }
          try {
            sfx.click();
          } catch {}
          setPendingBuy({
            kind: "card",
            id: offer.id,
            price: offer.price,
            title: def?.name ?? offer.id,
            desc: `${cardDescForUi(def as any)}${(def as any)?.exhaust ? `\n${EXHAUST_TOOLTIP}` : ""}`,
          });
        }}
        title={`${def?.name ?? offer.id}\n${cardDescForUi(def as any)}${(def as any)?.exhaust ? `\n${EXHAUST_TOOLTIP}` : ""}\nRarity: ${String(def?.rarity ?? "Common")}\nCost: ${offer.price}`}
      >
        <div>
          <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {def?.name ?? offer.id}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis" }}>
            {cardDescForUi(def as any)}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div className="badge" title="Energy cost">
            ⚡ <strong>{def?.cost ?? 0}</strong>
          </div>
          <div className="badge" title={bought ? "Purchased" : afford ? "Cost" : "Not enough gold"}>
            {bought ? (
              <span style={{ color: "rgba(34,197,94,0.95)" }} aria-hidden>
                ✓
              </span>
            ) : (
              <>
                <span aria-hidden>🪙</span> <strong>{offer.price}</strong>
              </>
            )}
          </div>
        </div>
      </button>
    );
  };

  const consumableIcon = (id: string) => {
    switch (id) {
      case "con_apple":
        return "🍎";
      case "con_sandwich":
        return "🥪";
      case "con_rain_coat":
        return "🧥";
      case "con_cookie":
        return "🍪";
      case "con_shake":
        return "🥤";
      case "con_trailmix":
        return "🥜";
      case "con_water":
        return "💧";
      case "con_eraser":
        return "🧽";
      case "con_chips":
        return "🍟";
      case "con_answer_key":
        return "🔑";
      case "con_moldy_food":
        return "🤢";
      case "con_absence_note":
        return "📝";
      case "con_cheat_sheet":
        return "📄";
      case "con_trash_bin":
        return "🗑️";
      default:
        return "🎒";
    }
  };

  const RemoveModal = !removeOpen ? null : (
    <div
      onClick={() => {
        setRemoveOpen(false);
        setRemovePick(null);
        setRemovePickId(null);
      }}
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
          <div style={{ fontSize: 18, fontWeight: 800 }}>Remove a Card</div>
          <button
            className="btn"
            onClick={() => {
              setRemoveOpen(false);
              setRemovePick(null);
              setRemovePickId(null);
            }}
          >
            Cancel
          </button>
        </div>

        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          Select a card to remove permanently. Cost: 🪙 <strong>{removalCost}</strong>
        </div>

        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
          }}
        >
          {(props.deckCardIds ?? []).map((cid, idx) => {
            const def: any = cardById.get(cid);
            const rarity = String(def?.rarity ?? "Common").toLowerCase();
            const pickKey = `${cid}:${idx}`;
            const selected = removePick === pickKey;
            const title = `${def?.name ?? cid}\n${cardDescForUi(def as any)}${(def as any)?.exhaust ? `\n${EXHAUST_TOOLTIP}` : ""}\nRarity: ${String(def?.rarity ?? "Common")}`;

            return (
              <button
                key={`${cid}:${idx}`}
                className={
                  "handCard panel soft cardTile shopCardTile " + `rarity-${rarity}` + (selected ? " selected" : "")
                }
                style={{
                  ...cardTileSize,
                  textAlign: "left",
                  cursor: "pointer",
                  outline: selected ? "4px solid rgba(255,255,255,0.85)" : "none",
                  outlineOffset: 2,
                }}
                onMouseEnter={() => {
                  try {
                    sfx.cardHover();
                  } catch {}
                }}
                onClick={() => {
                  try {
                    sfx.click();
                  } catch {}
                  setRemovePick(pickKey);
                  setRemovePickId(cid);
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
                  <div
                    style={{
                      fontWeight: 900,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
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
                  <div className="badge" title="Rarity">
                    {String(def?.rarity ?? "Common")}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
          <button
            className="btn danger"
            disabled={!removePickId || (props.gold ?? 0) < removalCost}
            onMouseEnter={() => {
              try {
                sfx.cardHover();
              } catch {}
            }}
            onClick={() => {
              if (!removePickId) return;
              if ((props.gold ?? 0) < removalCost) {
                try {
                  sfx.bad();
                } catch {}
                return;
              }
              try {
                sfx.confirm();
              } catch {}
              props.onRemoveCard?.(removePickId);
              setRemoveOpen(false);
              setRemovePick(null);
              setRemovePickId(null);
            }}
          >
            Confirm Remove
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="container">
      <div className="header">
        <div>
          <h2 className="h2">{title}</h2>
          <div className="sub">
            {subTitle ? (
              subTitle
            ) : (
              <>
                Depth <strong>{node.depth}</strong>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        {flavorText ? (
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.35 }}>
            {flavorText}
          </div>
        ) : null}

        <div className="muted" style={{ fontSize: 12, marginTop: flavorText ? 10 : 0 }}>
          {isEventShop
            ? "Event wares are unique. Supplies you already own aren’t offered."
            : "Items are unique per shop. Supplies you already own aren’t offered."}
        </div>

        <hr className="sep" />

        <div>
          {RemoveModal}
          {BuyConfirmModal}

          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <button
              className={"panel soft cardTile shopCardTile " + (!canOpenRemove ? "cardDisabled" : "")}
              style={{
                ...cardTileSize,
                textAlign: "left",
                cursor: canOpenRemove ? "pointer" : "not-allowed",
                border: "5px solid rgba(239, 68, 68, 0.40)",
                background: "linear-gradient(135deg, rgba(239,68,68,0.10), rgba(0,0,0,0.22))",
                boxShadow: canOpenRemove
                  ? "0 0 0 2px rgba(239,68,68,0.18), 0 10px 26px rgba(0,0,0,0.35)"
                  : undefined,
              }}
              disabled={!canOpenRemove}
              onMouseEnter={() => {
                try {
                  sfx.cardHover();
                } catch {}
              }}
              onClick={() => {
                if (!canOpenRemove) {
                  try {
                    sfx.bad();
                  } catch {}
                  return;
                }
                setRemoveOpen(true);
                setRemovePick(null);
              }}
              title={
                !props.onRemoveCard
                  ? "Card removal not available"
                  : (props.deckCardIds ?? []).length <= 1
                    ? "Can't remove your last card."
                    : (props.gold ?? 0) < removalCost
                      ? "Not enough gold"
                      : "Remove a card from your deck"
              }
            >
              <div>
                <div style={{ fontWeight: 900 }}>Remove Card</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Open your deck and choose a card.
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 18 }}>🗑️</div>
                <div className="badge">
                  <span aria-hidden>🪙</span> <strong>{removalCost}</strong>
                </div>
              </div>
            </button>

            <div
              className="panel soft"
              style={{
                ...cardTileSize,
                border: "5px solid rgba(255, 255, 255, 0.16)",
                borderRadius: 14,
              }}
            >
              <div style={{ fontWeight: 900 }}>Consumables</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                {(node.consumableOffers ?? []).map((o) => {
                  const def: any = consumableById.get(o.id);
                  const bought = boughtSet.has(`consumable:${o.id}`);
                  const afford = (props.gold ?? 0) >= o.price;
                  const canBuyThis = !bought && afford && !consumablesFull;
                  const tip = consumablesFull
                    ? `Inventory full (max 3). Discard a consumable to buy more.`
                    : `${def?.name ?? o.id} — ${def?.desc ?? ""} (🪙 ${o.price})`;

                  return (
                    <button
                      type="button"
                      key={o.id}
                      className={"badge" + (bought ? "" : "")}
                      title={tip}
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
                      onClick={() => {
                        if (bought) return;
                        if (consumablesFull) {
                          try {
                            sfx.bad();
                          } catch {}
                          return;
                        }
                        if (!afford) {
                          try {
                            sfx.bad();
                          } catch {}
                          return;
                        }
                        try {
                          sfx.click();
                        } catch {}
                        setPendingBuy({
                          kind: "consumable",
                          id: o.id,
                          price: o.price,
                          title: def?.name ?? o.id,
                          desc: def?.desc ?? "",
                        });
                      }}
                      style={{
                        cursor: bought ? "default" : "pointer",
                        opacity: bought ? 0.55 : canBuyThis ? 1 : 0.6,
                        display: "inline-flex",
                        gap: 6,
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        border: "none",
                      }}
                      disabled={bought || !canBuyThis}
                    >
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                        <span style={{ fontSize: 14 }}>{consumableIcon(o.id)}</span>
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {def?.name ?? o.id}
                        </span>
                      </span>
                      <span style={{ opacity: 0.95 }}>
                        {bought ? (
                          <span style={{ color: "rgba(34,197,94,0.95)" }} aria-hidden>
                            ✓
                          </span>
                        ) : (
                          <>
                            🪙 <strong>{o.price}</strong>
                          </>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              className="panel soft"
              style={{
                ...cardTileSize,
                border: "5px solid rgba(255, 255, 255, 0.16)",
                borderRadius: 14,
              }}
            >
              <div style={{ fontWeight: 900 }}>Supplies</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                {(node.supplyOffers ?? []).map((o) => {
                  const def: any = supplyById.get(o.id);
                  const bought = boughtSet.has(`supply:${o.id}`);
                  const afford = (props.gold ?? 0) >= o.price;
                  const tip = `${def?.name ?? o.id} — ${def?.desc ?? ""} (🪙 ${o.price})`;

                  const isBathroomMirror = o.id === "sup_reflect_block";

                  return (
                    <button
                      type="button"
                      key={o.id}
                      className="badge"
                      title={tip}
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
                      onClick={() => {
                        if (bought) return;
                        if (!afford) {
                          try {
                            sfx.bad();
                          } catch {}
                          return;
                        }
                        try {
                          sfx.click();
                        } catch {}
                        setPendingBuy({
                          kind: "supply",
                          id: o.id,
                          price: o.price,
                          title: def?.name ?? o.id,
                          desc: def?.desc ?? "",
                        });
                      }}
                      style={{
                        cursor: bought ? "default" : "pointer",
                        opacity: bought ? 0.55 : afford ? 1 : 0.7,
                        display: "inline-flex",
                        gap: 6,
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        border: "none",
                      }}
                    >
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                        <span style={{ fontSize: 14 }}>{def?.emoji ?? "📎"}</span>
                        {isBathroomMirror ? (
                          <span style={{ display: "inline-block", lineHeight: 1.05 }}>
                            Bathroom<br />Mirror
                          </span>
                        ) : (
                          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {def?.name ?? o.id}
                          </span>
                        )}
                      </span>
                      <span style={{ opacity: 0.95 }}>
                        {bought ? (
                          <span style={{ color: "rgba(34,197,94,0.95)" }} aria-hidden>
                            ✓
                          </span>
                        ) : (
                          <>
                            🪙 <strong>{o.price}</strong>
                          </>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              className={
                "panel soft cardTile shopCardTile " +
                (!props.onShopRefresh || (props.gold ?? 0) < refreshCost ? "cardDisabled" : "")
              }
              style={{
                ...cardTileSize,
                textAlign: "left",
                cursor:
                  props.onShopRefresh && (props.gold ?? 0) >= refreshCost ? "pointer" : "not-allowed",
                border: "2px solid rgba(99,102,241,0.40)",
                background: "linear-gradient(135deg, rgba(239,68,68,0.14), rgba(59,130,246,0.14))",
              }}
              disabled={!props.onShopRefresh || (props.gold ?? 0) < refreshCost}
              onMouseEnter={() => {
                try {
                  sfx.cardHover();
                } catch {}
              }}
              onClick={() => {
                if (!props.onShopRefresh) return;
                if ((props.gold ?? 0) < refreshCost) {
                  try {
                    sfx.bad();
                  } catch {}
                  return;
                }
                try {
                  sfx.confirm();
                } catch {}
                props.onShopRefresh();
              }}
              title={
                !props.onShopRefresh
                  ? "Refresh not available"
                  : (props.gold ?? 0) < refreshCost
                    ? "Not enough gold"
                    : "Reroll this shop's offers"
              }
            >
              <div>
                <div style={{ fontWeight: 900 }}>Refresh Shop</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Reroll the card, consumable, and supply offers.
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 18 }} aria-hidden>
                  🔄
                </div>
                <div className="badge">
                  <span aria-hidden>🪙</span> <strong>{refreshCost}</strong>
                </div>
              </div>
            </button>
          </div>

          <div className="panel soft" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Cards</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
              {(node.cardOffers ?? []).map((o) => renderCardOffer(o))}
            </div>
          </div>
        </div>

        <hr className="sep" />

        <button
          className="btn primary"
          onMouseEnter={() => {
            try {
              sfx.cardHover();
            } catch {}
          }}
          onClick={() => {
            try {
              sfx.confirm();
            } catch {}
            props.onComplete();
          }}
        >
          Leave Shop
        </button>

        {tipNode}
      </div>
    </div>
  );
}

function RestNodeScreen(props: {
  node: Extract<NonNullable<GameState["nodeScreen"]>, { type: "REST" }>;
  deckCardIds: string[];
  supplyIds: string[];
  consumables: string[];
  onRestHeal: () => void;
  onRestUpgrade: (cardId: string) => void;
  onComplete: () => void;
  maps: {
    cardById: Map<string, any>;
  };
}) {
  const { node, maps } = props;
  const { cardById } = maps;

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeDropId, setUpgradeDropId] = useState<string | null>(null);
  const [upgradeDragOver, setUpgradeDragOver] = useState(false);
  const [upgradeFlash, setUpgradeFlash] = useState(false);

  // REST
  const hasPillow = (props.supplyIds ?? []).includes("sup_upgrade_rest");
  const canUpgrade = !node.didUpgrade && (!node.didHeal || hasPillow);
  const healDisabled = node.didHeal || (node.didUpgrade && !hasPillow);

  const renderDeckCardTile = (cid: string, key: string, opts?: { draggable?: boolean }) => {
    const def: any = cardById.get(cid);
    const rarity = String(def?.rarity ?? "Common").toLowerCase();
    const title = `${def?.name ?? cid}\n${cardDescForUi(def as any)}${(def as any)?.exhaust ? `\n${EXHAUST_TOOLTIP}` : ""}\nRarity: ${String(def?.rarity ?? "Common")}`;
    const isNeg = String(cid ?? "").startsWith("neg_");

    return (
      <button
        key={key}
        type="button"
        className={"handCard panel soft cardTile shopCardTile " + `rarity-${rarity}` + (isNeg ? " negativeCard" : "")}
        style={{
          width: 205,
          minWidth: 205,
          height: 132,
          minHeight: 132,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          textAlign: "left",
          cursor: opts?.draggable ? "grab" : "default",
          opacity: opts?.draggable === false ? 0.6 : 1,
        }}
        title={title}
        draggable={!!opts?.draggable}
        onDragStart={(e) => {
          if (!opts?.draggable) return;
          try {
            sfx.click();
          } catch {}
          e.dataTransfer.setData("text/plain", cid);
          e.dataTransfer.effectAllowed = "move";
        }}
        onMouseEnter={() => {
          try {
            sfx.cardHover();
          } catch {}
        }}
        onClick={() => {
          if (!canUpgrade) return;
          try {
            sfx.click();
          } catch {}
          setUpgradeDropId(cid);
        }}
      >
        <div>
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
          <div className="badge" title="Rarity">
            {String(def?.rarity ?? "Common")}
          </div>
        </div>
      </button>
    );
  };

  const pickedBaseId = upgradeDropId;
  const pickedUpgradedId = pickedBaseId ? upgradeCardId(pickedBaseId) : null;

  return (
    <div className="container">
      <div className="header">
        <div>
          <h2 className="h2">Rest</h2>
          <div className="sub">
            Depth <strong>{node.depth}</strong>
          </div>
        </div>
      </div>

      <div className="panel">
        <div style={{ display: "grid", gap: 12 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            {hasPillow
              ? "Comfy Pillow: you can Rest and Upgrade at this site (in any order)."
              : "Choose one: Rest OR Upgrade."}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <button
              type="button"
              className={"panel soft" + (healDisabled ? " cardDisabled" : "")}
              disabled={healDisabled}
              onMouseEnter={() => {
                try {
                  sfx.cardHover();
                } catch {}
              }}
              onClick={() => {
                if (healDisabled) return;
                try {
                  sfx.confirm();
                } catch {}
                props.onRestHeal();
              }}
              title={healDisabled ? "Already rested" : "Heal 30% of max HP"}
              style={{
                padding: 16,
                cursor: healDisabled ? "default" : "pointer",
                border: "2px solid rgba(34,197,94,0.35)",
                background: "linear-gradient(180deg, rgba(34,197,94,0.10), rgba(0,0,0,0.18))",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
                minHeight: 120,
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 44, lineHeight: 1 }} aria-hidden>
                  🔥
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>{healDisabled ? "Rested" : "Rest"}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Heal 30% of max HP
                  </div>
                </div>
              </div>
              <div className="badge" style={{ borderColor: "rgba(34,197,94,0.35)" }}>
                {healDisabled ? "Done" : "Pick"}
              </div>
            </button>

            <button
              type="button"
              className={"panel soft" + (!canUpgrade ? " cardDisabled" : "")}
              disabled={!canUpgrade}
              onMouseEnter={() => {
                try {
                  sfx.cardHover();
                } catch {}
              }}
              onClick={() => {
                if (!canUpgrade) return;
                try {
                  sfx.click();
                } catch {}
                setUpgradeOpen(true);
              }}
              title={
                canUpgrade
                  ? "Upgrade a card"
                  : node.didUpgrade
                    ? "Already upgraded at this rest site"
                    : node.didHeal && !hasPillow
                      ? "To upgrade after resting, you need Comfy Pillow"
                      : ""
              }
              style={{
                padding: 16,
                cursor: canUpgrade ? "pointer" : "default",
                border: "2px solid rgba(245,158,11,0.35)",
                background: "linear-gradient(180deg, rgba(245,158,11,0.10), rgba(0,0,0,0.18))",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
                minHeight: 120,
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 44, lineHeight: 1 }} aria-hidden>
                  ➕
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>Upgrade</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Replace a card with its upgraded version
                  </div>
                </div>
              </div>
              <div className="badge" style={{ borderColor: "rgba(245,158,11,0.35)" }}>
                {node.didUpgrade ? "Done" : "Pick"}
              </div>
            </button>
          </div>

          {upgradeOpen ? (
            <div className="panel soft" style={{ padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Upgrade a card</div>
                <button
                  className="btn"
                  onMouseEnter={() => {
                    try {
                      sfx.cardHover();
                    } catch {}
                  }}
                  onClick={() => {
                    try {
                      sfx.click();
                    } catch {}
                    setUpgradeOpen(false);
                    setUpgradeDropId(null);
                    setUpgradeDragOver(false);
                    setUpgradeFlash(false);
                  }}
                >
                  Close
                </button>
              </div>

              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Drag a card into the slot below, or click a card to place it.
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 84px 1fr",
                  gap: 12,
                  alignItems: "center",
                  marginTop: 12,
                }}
              >
                <div
                  className="panel"
                  onDragOver={(e) => {
                    if (!canUpgrade) return;
                    e.preventDefault();
                    setUpgradeDragOver(true);
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDragLeave={() => setUpgradeDragOver(false)}
                  onDrop={(e) => {
                    if (!canUpgrade) return;
                    e.preventDefault();
                    const cid = e.dataTransfer.getData("text/plain");
                    if (!cid) return;
                    try {
                      sfx.click();
                    } catch {}
                    setUpgradeDropId(cid);
                    setUpgradeDragOver(false);
                  }}
                  style={{
                    minHeight: 170,
                    border: upgradeDragOver
                      ? "2px solid rgba(255,255,255,0.55)"
                      : "2px dashed rgba(255,255,255,0.22)",
                    background: "rgba(0,0,0,0.18)",
                    display: "grid",
                    placeItems: "center",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "grid",
                      placeItems: "center",
                      opacity: pickedBaseId ? 0.08 : 0.14,
                      fontSize: 64,
                    }}
                    aria-hidden
                  >
                    ➕
                  </div>
                  {pickedBaseId ? (
                    <div style={{ position: "relative", zIndex: 1 }}>
                      {renderDeckCardTile(pickedBaseId, `picked:${pickedBaseId}`, { draggable: false })}
                    </div>
                  ) : (
                    <div className="muted" style={{ fontSize: 12, position: "relative", zIndex: 1 }}>
                      Drop card here
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", placeItems: "center" }} aria-hidden>
                  <div style={{ fontSize: 44, opacity: 0.9 }}>➡️</div>
                </div>

                <div className="panel" style={{ minHeight: 170, display: "grid", placeItems: "center", background: "rgba(0,0,0,0.18)" }}>
                  {pickedUpgradedId ? (
                    <div
                      style={{
                        transform: upgradeFlash ? "scale(1.03)" : "scale(1)",
                        transition: "transform 120ms ease",
                        boxShadow: upgradeFlash ? "0 0 0 4px rgba(245,158,11,0.65)" : "none",
                        borderRadius: 16,
                      }}
                    >
                      {renderDeckCardTile(pickedUpgradedId, `up:${pickedUpgradedId}`, { draggable: false })}
                    </div>
                  ) : (
                    <div className="muted" style={{ fontSize: 12 }}>Upgraded card preview</div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
                <button
                  className="btn"
                  onMouseEnter={() => {
                    try {
                      sfx.cardHover();
                    } catch {}
                  }}
                  onClick={() => {
                    try {
                      sfx.click();
                    } catch {}
                    setUpgradeDropId(null);
                  }}
                  disabled={!pickedBaseId}
                >
                  Clear
                </button>
                <button
                  className="btn primary"
                  disabled={!canUpgrade || !pickedBaseId}
                  onMouseEnter={() => {
                    try {
                      sfx.cardHover();
                    } catch {}
                  }}
                  onClick={() => {
                    if (!canUpgrade || !pickedBaseId) return;
                    try {
                      sfx.hammer();
                    } catch {}
                    setUpgradeFlash(true);
                    window.setTimeout(() => {
                      setUpgradeFlash(false);
                      props.onRestUpgrade(pickedBaseId);
                      setUpgradeOpen(false);
                      setUpgradeDropId(null);
                    }, 260);
                  }}
                >
                  Confirm Upgrade
                </button>
              </div>

              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div className="muted" style={{ fontSize: 12 }}>
                  {canUpgrade
                    ? node.didHeal && hasPillow
                      ? "Comfy Pillow lets you upgrade even after resting."
                      : "You can upgrade once at this rest site."
                    : node.didUpgrade
                      ? "Already upgraded at this rest site."
                      : node.didHeal && !hasPillow
                        ? "To upgrade after resting, you need Comfy Pillow."
                        : ""}
                </div>
                <div className="badge" title="Drag from deck">
                  Drag & Drop
                </div>
              </div>

              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                {(props.deckCardIds ?? []).map((cid, idx) =>
                  renderDeckCardTile(cid, `deck:${cid}:${idx}`, { draggable: canUpgrade })
                )}
              </div>
            </div>
          ) : null}
        </div>

        <hr className="sep" />

        <button
          className="btn primary"
          onMouseEnter={() => {
            try {
              sfx.cardHover();
            } catch {}
          }}
          onClick={() => {
            try {
              sfx.confirm();
            } catch {}
            props.onComplete();
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

export function NodeScreen(props: NodeScreenProps) {
  const node = props.node;

  // Shared lookup maps
  const supplyById = useMemo(() => new Map(SUPPLIES_POOL_10.map((s) => [s.id, s])), []);
  const consumableById = useMemo(() => new Map(CONSUMABLES_10.map((c) => [c.id, c])), []);
  const cardById = useMemo(() => new Map(ALL_CARDS_40ish.map((c) => [c.id, c])), []);

  if ((node as any).type === "SHOP") {
    return (
      <ShopNodeScreen
        node={node as any}
        gold={props.gold}
        deckCardIds={props.deckCardIds}
        supplyIds={props.supplyIds}
        consumables={props.consumables}
        onBuy={props.onBuy}
        onShopRefresh={(node as any).eventShop ? undefined : props.onShopRefresh}
        onRemoveCard={props.onRemoveCard}
        onComplete={props.onComplete}
        maps={{ supplyById, consumableById, cardById }}
      />
    );
  }

  if ((node as any).type === "REST") {
    return (
      <RestNodeScreen
        node={node as any}
        deckCardIds={props.deckCardIds}
        supplyIds={props.supplyIds}
        consumables={props.consumables}
        onRestHeal={props.onRestHeal}
        onRestUpgrade={props.onRestUpgrade}
        onComplete={props.onComplete}
        maps={{ cardById }}
      />
    );
  }

  if ((node as any).type === "EVENT") {
    return (
      <EventNodeScreen
        node={node as any}
        gold={props.gold}
        hp={props.hp}
        maxHp={props.maxHp}
        deckCardIds={props.deckCardIds}
        supplyIds={props.supplyIds}
        consumables={props.consumables}
        onChoose={props.onEventChoose}
        onPickUpgrade={props.onEventPickUpgrade}
        onPickCard={props.onEventPickCard}
        onPickConsumable={props.onEventPickConsumable}
        onPickSupply={props.onEventPickSupply}
        onHallwayAnswer={props.onEventHallwayAnswer}
        onGateAnswer={props.onEventGateAnswer}
        onDiscardConsumable={props.onDiscardConsumable}
        onHoverTargetsChange={props.onInventoryHoverChange}
        onComplete={props.onComplete}
        maps={{ cardById, consumableById, supplyById }}
      />
    );
  }

  // Other node types (START, etc.)
  const t = String((node as any).type ?? "NODE");
  const title = t === "EVENT" ? "Event" : t;
  return (
    <ComingSoonNodeScreen
      title={title}
      nodeType={t}
      depth={Number((node as any).depth ?? 0)}
      onComplete={props.onComplete}
    />
  );
}
