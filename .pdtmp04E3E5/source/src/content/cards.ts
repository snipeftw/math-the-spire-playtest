// src/content/cards.ts
export type CardType = "ATTACK" | "BLOCK" | "SKILL";
export type CardRarity = "Common" | "Uncommon" | "Rare" | "Ultra Rare";

export type CardEffect =
  | { kind: "damage"; amount: number }
  | { kind: "pierce_damage"; amount: number }
  | { kind: "damage_multi"; amount: number; hits: number }
  | { kind: "damage_all"; amount: number }
  | { kind: "damage_equal_gold" }
  | { kind: "damage_equal_block" }
  | { kind: "block"; amount: number }
  | { kind: "block_draw"; block: number; draw: number }
  | { kind: "block_damage"; block: number; damage: number }
  | { kind: "spend_all_energy_block"; blockPerEnergy: number; bonusEnergy?: number }
  | { kind: "spend_all_energy_damage"; damagePerHit: number; bonusHits?: number }
  | { kind: "heal"; amount: number }
  | { kind: "heal_half_poison" }
  | { kind: "draw"; amount: number }
  | { kind: "increase_max_energy"; amount: number }
  | { kind: "strength"; stacks: number }
  | { kind: "double_strength" }
  | { kind: "double_block" }
  | { kind: "double_next_attack" }
  | { kind: "cleanse_random_debuff" }
  | { kind: "apply_poison"; stacks: number }
  | { kind: "apply_vulnerable"; stacks: number }
  | { kind: "apply_weak"; stacks: number }
  | { kind: "double_poison_target" }
  | { kind: "mulligan" }
  | { kind: "curse" };

export type CardDef = {
  id: string;
  name: string;
  type: CardType;
  desc: string;
  cost: number;
  rarity: CardRarity;

  eventOnly?: boolean;

  // Some cards (ex: curses) are intentionally not playable.
  unplayable?: boolean;

  // If true, this card goes to the exhaust pile instead of discard after it is played/discarded.
  exhaust?: boolean;

  // If this is an upgraded card, points to its base id.
  upgradeOf?: string;

  // Effect data used by the battle engine
  effect: CardEffect;
};

export const EXHAUST_TOOLTIP = "Exhaust — When played or discarded, this card is removed for the rest of the battle.";

export function cardDescForUi(def: Pick<CardDef, "desc" | "exhaust"> | null | undefined): string {
  const base = String(def?.desc ?? "");
  if (!def?.exhaust) return base;
  const hasExhaust = /\bexhaust\b/i.test(base);
  if (hasExhaust) return base;
  return base ? `${base} Exhaust.` : "Exhaust.";
}

export function isUpgradedCardId(cardId: string): boolean {
  return cardId.endsWith("_u");
}

export function baseCardId(cardId: string): string {
  return isUpgradedCardId(cardId) ? cardId.slice(0, -2) : cardId;
}

export function upgradeCardId(cardId: string): string {
  const base = baseCardId(cardId);
  const upgraded = UPGRADE_BY_BASE[base];
  return upgraded ?? cardId;
}

// ===== Card List (Base + Upgrades) =====

export const BASE_CARDS: CardDef[] = [
  // Attacks
  { id: "atk_strike", name: "Strike", type: "ATTACK", cost: 1, rarity: "Common", desc: "Deal 6 damage.", effect: { kind: "damage", amount: 6 } },
  { id: "atk_heavy_hit", name: "Heavy Hit", type: "ATTACK", cost: 2, rarity: "Common", desc: "Deal 10 damage.", effect: { kind: "damage", amount: 10 } },
  { id: "atk_rapid_fire", name: "Rapid Fire", type: "ATTACK", cost: 1, rarity: "Common", desc: "Deal 4 damage twice.", effect: { kind: "damage_multi", amount: 4, hits: 2 } },
  { id: "atk_piercing_shot", name: "Piercing Shot", type: "ATTACK", cost: 1, rarity: "Common", desc: "Deal 5 damage (ignores Block when enemies have it).", effect: { kind: "pierce_damage", amount: 5 } },
  { id: "atk_rain_fall", name: "Rain Fall", type: "ATTACK", cost: 1, rarity: "Common", desc: "Deal 6 damage to ALL enemies.", effect: { kind: "damage_all", amount: 6 } },
  { id: "atk_acid_rain_fall", name: "Acid Rain Fall", type: "ATTACK", cost: 2, rarity: "Uncommon", desc: "Deal 12 damage to ALL enemies.", effect: { kind: "damage_all", amount: 12 } },
  { id: "atk_nothing_but_net", name: "Nothing But Net", type: "ATTACK", cost: 3, rarity: "Rare", desc: "Deal 21 damage to ALL enemies.", effect: { kind: "damage_all", amount: 21 } },

  // Event-only (Ultra Rare)
  {
    id: "atk_golden_strike",
    name: "Golden Strike",
    type: "ATTACK",
    cost: 3,
    rarity: "Ultra Rare",
    eventOnly: true,
    desc: "Deal damage equal to your current gold.",
    effect: { kind: "damage_equal_gold" },
  },

  // Event-only (Block/Poison/Energy build enablers)
  {
    id: "atk_shield_conversion",
    name: "Shield Conversion",
    type: "ATTACK",
    cost: 2,
    rarity: "Rare",
    eventOnly: true,
    desc: "Deal damage equal to your current Block.",
    effect: { kind: "damage_equal_block" },
  },
  {
    id: "atk_unload",
    name: "Unload",
    type: "ATTACK",
    cost: 0,
    rarity: "Rare",
    eventOnly: true,
    desc: "Spend all your Energy. Deal 6 damage per Energy spent.",
    effect: { kind: "spend_all_energy_damage", damagePerHit: 6 },
  },

  // Blocks
  { id: "blk_guard", name: "Guard", type: "BLOCK", cost: 1, rarity: "Common", desc: "Gain 6 Block.", effect: { kind: "block", amount: 6 } },
  { id: "blk_wall_up", name: "Wall Up", type: "BLOCK", cost: 2, rarity: "Common", desc: "Gain 10 Block.", effect: { kind: "block", amount: 10 } },
  { id: "blk_reflex", name: "Reflex", type: "BLOCK", cost: 1, rarity: "Common", desc: "Gain 5 Block. Draw 1.", effect: { kind: "block_draw", block: 5, draw: 1 } },
  { id: "blk_shield_bash", name: "Shield Bash", type: "BLOCK", cost: 1, rarity: "Common", desc: "Gain 4 Block. Deal 4 damage.", effect: { kind: "block_damage", block: 4, damage: 4 } },
  { id: "blk_fortitude", name: "Fortitude", type: "BLOCK", cost: 3, rarity: "Rare", exhaust: true, desc: "Gain 30 Block.", effect: { kind: "block", amount: 30 } },

  // Event-only
  {
    id: "blk_dig_in",
    name: "Dig In",
    type: "BLOCK",
    cost: 0,
    rarity: "Rare",
    eventOnly: true,
    desc: "Spend all your Energy. Gain 6 Block per Energy spent.",
    effect: { kind: "spend_all_energy_block", blockPerEnergy: 6 },
  },

  // Skills
  { id: "skl_focus", name: "Focus", type: "SKILL", cost: 1, rarity: "Common", desc: "Gain 1 Strength.", effect: { kind: "strength", stacks: 1 } },
  { id: "skl_workout", name: "Workout", type: "SKILL", cost: 2, rarity: "Rare", exhaust: true, desc: "Double your Strength.", effect: { kind: "double_strength" } },
  { id: "skl_quick_thinking", name: "Quick Thinking", type: "SKILL", cost: 1, rarity: "Common", desc: "Draw 2 cards.", effect: { kind: "draw", amount: 2 } },
  { id: "skl_mulligan", name: "Mulligan", type: "SKILL", cost: 1, rarity: "Common", desc: "Discard 1 random card. Draw 1.", effect: { kind: "mulligan" } },
  { id: "skl_confidence", name: "Confidence", type: "SKILL", cost: 2, rarity: "Rare", desc: "Your next attack this turn deals double damage.", effect: { kind: "double_next_attack" } },
  { id: "skl_clean_notes", name: "Clean Notes", type: "SKILL", cost: 1, rarity: "Uncommon", desc: "Remove a random debuff from yourself.", effect: { kind: "cleanse_random_debuff" } },
  { id: "skl_prank", name: "Prank", type: "SKILL", cost: 1, rarity: "Uncommon", desc: "Apply 5 Poison to a target.", effect: { kind: "apply_poison", stacks: 5 } },
  { id: "skl_science_lab", name: "Science Experiment", type: "SKILL", cost: 2, rarity: "Rare", desc: "Double a target's Poison.", effect: { kind: "double_poison_target" } },
  { id: "skl_elearning", name: "E-Learning", type: "SKILL", cost: 2, rarity: "Rare", desc: "Double your Block.", effect: { kind: "double_block" } },
  { id: "skl_disruptive", name: "Disruptive", type: "SKILL", cost: 1, rarity: "Uncommon", exhaust: true, desc: "Apply 3 Vulnerable to a target.", effect: { kind: "apply_vulnerable", stacks: 3 } },
  { id: "skl_calm_down", name: "Calm Down", type: "SKILL", cost: 1, rarity: "Uncommon", desc: "Apply 3 Weak to a target.", effect: { kind: "apply_weak", stacks: 3 } },
  { id: "skl_bandaid", name: "Bandaid", type: "SKILL", cost: 0, rarity: "Common", exhaust: true, desc: "Heal 4 HP.", effect: { kind: "heal", amount: 4 } },

  // Event-only
  {
    id: "skl_detox_extract",
    name: "Detox Extract",
    type: "SKILL",
    cost: 2,
    rarity: "Rare",
    eventOnly: true,
    desc: "Recover HP equal to half the Poison on the targeted enemy.",
    effect: { kind: "heal_half_poison" },
  },
  {
    id: "skl_overclock",
    name: "Overclock",
    type: "SKILL",
    cost: 3,
    rarity: "Ultra Rare",
    eventOnly: true,
    exhaust: true,
    desc: "Gain +1 Energy each turn.",
    effect: { kind: "increase_max_energy", amount: 1 },
  },
];

export const UPGRADED_CARDS: CardDef[] = [
  // Attacks+
  { id: "atk_strike_u", upgradeOf: "atk_strike", name: "Strike+", type: "ATTACK", cost: 1, rarity: "Common", desc: "Deal 9 damage.", effect: { kind: "damage", amount: 9 } },
  { id: "atk_heavy_hit_u", upgradeOf: "atk_heavy_hit", name: "Heavy Hit+", type: "ATTACK", cost: 2, rarity: "Common", desc: "Deal 14 damage.", effect: { kind: "damage", amount: 14 } },
  { id: "atk_rapid_fire_u", upgradeOf: "atk_rapid_fire", name: "Rapid Fire+", type: "ATTACK", cost: 1, rarity: "Common", desc: "Deal 8 damage twice.", effect: { kind: "damage_multi", amount: 8, hits: 2 } },
  { id: "atk_piercing_shot_u", upgradeOf: "atk_piercing_shot", name: "Piercing Shot+", type: "ATTACK", cost: 1, rarity: "Common", desc: "Deal 8 damage.", effect: { kind: "pierce_damage", amount: 8 } },
  { id: "atk_rain_fall_u", upgradeOf: "atk_rain_fall", name: "Rain Fall+", type: "ATTACK", cost: 1, rarity: "Common", desc: "Deal 9 damage to ALL enemies.", effect: { kind: "damage_all", amount: 9 } },
  { id: "atk_acid_rain_fall_u", upgradeOf: "atk_acid_rain_fall", name: "Acid Rain Fall+", type: "ATTACK", cost: 2, rarity: "Uncommon", desc: "Deal 19 damage to ALL enemies.", effect: { kind: "damage_all", amount: 19 } },
  { id: "atk_nothing_but_net_u", upgradeOf: "atk_nothing_but_net", name: "Nothing But Net+", type: "ATTACK", cost: 3, rarity: "Rare", desc: "Deal 28 damage to ALL enemies.", effect: { kind: "damage_all", amount: 28 } },

  // Event-only (Ultra Rare)+
  {
    id: "atk_golden_strike_u",
    upgradeOf: "atk_golden_strike",
    name: "Golden Strike+",
    type: "ATTACK",
    cost: 2,
    rarity: "Ultra Rare",
    eventOnly: true,
    desc: "Deal damage equal to your current gold.",
    effect: { kind: "damage_equal_gold" },
  },

  // Event-only (Block/Poison/Energy build enablers)+
  {
    id: "atk_shield_conversion_u",
    upgradeOf: "atk_shield_conversion",
    name: "Shield Conversion+",
    type: "ATTACK",
    cost: 1,
    rarity: "Rare",
    eventOnly: true,
    desc: "Deal damage equal to your current Block.",
    effect: { kind: "damage_equal_block" },
  },
  {
    id: "atk_unload_u",
    upgradeOf: "atk_unload",
    name: "Unload+",
    type: "ATTACK",
    cost: 0,
    rarity: "Rare",
    eventOnly: true,
    desc: "Spend all your Energy. Deal 6 damage per Energy spent, plus 1 additional hit.",
    effect: { kind: "spend_all_energy_damage", damagePerHit: 6, bonusHits: 1 },
  },

  // Blocks+
  { id: "blk_guard_u", upgradeOf: "blk_guard", name: "Guard+", type: "BLOCK", cost: 1, rarity: "Common", desc: "Gain 9 Block.", effect: { kind: "block", amount: 9 } },
  { id: "blk_wall_up_u", upgradeOf: "blk_wall_up", name: "Wall Up+", type: "BLOCK", cost: 2, rarity: "Common", desc: "Gain 14 Block.", effect: { kind: "block", amount: 14 } },
  { id: "blk_reflex_u", upgradeOf: "blk_reflex", name: "Reflex+", type: "BLOCK", cost: 1, rarity: "Common", desc: "Gain 7 Block. Draw 2.", effect: { kind: "block_draw", block: 7, draw: 2 } },
  { id: "blk_shield_bash_u", upgradeOf: "blk_shield_bash", name: "Shield Bash+", type: "BLOCK", cost: 1, rarity: "Common", desc: "Gain 7 Block. Deal 7 damage.", effect: { kind: "block_damage", block: 7, damage: 7 } },
  { id: "blk_fortitude_u", upgradeOf: "blk_fortitude", name: "Fortitude+", type: "BLOCK", cost: 2, rarity: "Rare", exhaust: true, desc: "Gain 40 Block.", effect: { kind: "block", amount: 40 } },

  // Event-only+
  {
    id: "blk_dig_in_u",
    upgradeOf: "blk_dig_in",
    name: "Dig In+",
    type: "BLOCK",
    cost: 0,
    rarity: "Rare",
    eventOnly: true,
    desc: "Spend all your Energy. Gain 6 Block per Energy spent, plus 1 additional stack.",
    effect: { kind: "spend_all_energy_block", blockPerEnergy: 6, bonusEnergy: 1 },
  },

  // Skills+
  { id: "skl_focus_u", upgradeOf: "skl_focus", name: "Focus+", type: "SKILL", cost: 1, rarity: "Common", desc: "Gain 3 Strength.", effect: { kind: "strength", stacks: 3 } },
  { id: "skl_workout_u", upgradeOf: "skl_workout", name: "Workout+", type: "SKILL", cost: 1, rarity: "Rare", exhaust: true, desc: "Double your Strength.", effect: { kind: "double_strength" } },
  { id: "skl_quick_thinking_u", upgradeOf: "skl_quick_thinking", name: "Quick Thinking+", type: "SKILL", cost: 1, rarity: "Common", desc: "Draw 3 cards.", effect: { kind: "draw", amount: 3 } },
  { id: "skl_mulligan_u", upgradeOf: "skl_mulligan", name: "Mulligan+", type: "SKILL", cost: 0, rarity: "Common", desc: "Discard 1 random card. Draw 1.", effect: { kind: "mulligan" } },
  { id: "skl_confidence_u", upgradeOf: "skl_confidence", name: "Confidence+", type: "SKILL", cost: 1, rarity: "Rare", desc: "Your next attack this turn deals double damage.", effect: { kind: "double_next_attack" } },
  { id: "skl_clean_notes_u", upgradeOf: "skl_clean_notes", name: "Clean Notes+", type: "SKILL", cost: 0, rarity: "Uncommon", desc: "Remove a random debuff from yourself.", effect: { kind: "cleanse_random_debuff" } },
  { id: "skl_prank_u", upgradeOf: "skl_prank", name: "Prank+", type: "SKILL", cost: 1, rarity: "Uncommon", desc: "Apply 8 Poison to a target.", effect: { kind: "apply_poison", stacks: 8 } },
  { id: "skl_science_lab_u", upgradeOf: "skl_science_lab", name: "Science Experiment+", type: "SKILL", cost: 1, rarity: "Rare", desc: "Double a target's Poison.", effect: { kind: "double_poison_target" } },
  { id: "skl_elearning_u", upgradeOf: "skl_elearning", name: "E-Learning+", type: "SKILL", cost: 1, rarity: "Rare", desc: "Double your Block.", effect: { kind: "double_block" } },
  { id: "skl_disruptive_u", upgradeOf: "skl_disruptive", name: "Disruptive+", type: "SKILL", cost: 0, rarity: "Uncommon", exhaust: true, desc: "Apply 3 Vulnerable to a target.", effect: { kind: "apply_vulnerable", stacks: 3 } },
  { id: "skl_calm_down_u", upgradeOf: "skl_calm_down", name: "Calm Down+", type: "SKILL", cost: 0, rarity: "Uncommon", desc: "Apply 3 Weak to a target.", effect: { kind: "apply_weak", stacks: 3 } },
  { id: "skl_bandaid_u", upgradeOf: "skl_bandaid", name: "Bandaid+", type: "SKILL", cost: 0, rarity: "Common", exhaust: true, desc: "Heal 7 HP.", effect: { kind: "heal", amount: 7 } },

  // Event-only+
  {
    id: "skl_detox_extract_u",
    upgradeOf: "skl_detox_extract",
    name: "Detox Extract+",
    type: "SKILL",
    cost: 1,
    rarity: "Rare",
    eventOnly: true,
    desc: "Recover HP equal to half the Poison on the targeted enemy.",
    effect: { kind: "heal_half_poison" },
  },
  {
    id: "skl_overclock_u",
    upgradeOf: "skl_overclock",
    name: "Overclock+",
    type: "SKILL",
    cost: 2,
    rarity: "Ultra Rare",
    eventOnly: true,
    exhaust: true,
    desc: "Gain +1 Energy each turn.",
    effect: { kind: "increase_max_energy", amount: 1 },
  },
];

// Negative cards are stored in a separate pool and should NOT appear in setup draft or card rewards.
export const NEGATIVE_CARDS: CardDef[] = [
  {
    id: "neg_curse",
    name: "Curse",
    type: "SKILL",
    cost: 0,
    rarity: "Common",
    unplayable: true,
    desc: "Unplayable.",
    effect: { kind: "curse" },
  },
  {
    id: "neg_temp_curse",
    name: "Curse",
    type: "SKILL",
    cost: 0,
    rarity: "Common",
    unplayable: true,
    desc: "Unplayable. Removed after battle.",
    effect: { kind: "curse" },
  },
  {
    id: "neg_infestation",
    name: "Infestation",
    type: "SKILL",
    cost: 0,
    rarity: "Common",
    unplayable: true,
    exhaust: true,
    desc: "Unplayable. When drawn, discard 1 random card. Exhaust. Removed after battle.",
    effect: { kind: "curse" },
  },
  {
    id: "neg_infestation_perm",
    name: "Infestation",
    type: "SKILL",
    cost: 0,
    rarity: "Common",
    unplayable: true,
    desc: "Unplayable. When drawn, discard 1 random card. Does not Exhaust.",
    effect: { kind: "curse" },
  },
  {
    id: "neg_radiation",
    name: "Radiation",
    type: "SKILL",
    cost: 0,
    rarity: "Common",
    unplayable: true,
    exhaust: true,
    desc: "Unplayable. When drawn, lose 1 Energy. Exhaust. Removed after battle.",
    effect: { kind: "curse" },
  },
  {
    id: "neg_radiation_perm",
    name: "Radiation",
    type: "SKILL",
    cost: 0,
    rarity: "Common",
    unplayable: true,
    desc: "Unplayable. When drawn, lose 1 Energy. Does not Exhaust.",
    effect: { kind: "curse" },
  },
  {
    id: "neg_pop_quiz",
    name: "Pop Quiz",
    type: "SKILL",
    cost: 0,
    rarity: "Common",
    exhaust: true,
    desc: "Must be played before any other cards. Exhaust.",
    effect: { kind: "curse" },
  },
];

export const ALL_CARDS_40ish: CardDef[] = [
  ...BASE_CARDS,
  ...UPGRADED_CARDS,
  ...NEGATIVE_CARDS,
];

export const BASE_CARD_IDS: string[] = BASE_CARDS.map((c) => c.id);

const UPGRADE_BY_BASE: Record<string, string> = Object.fromEntries(
  UPGRADED_CARDS.filter((c) => !!c.upgradeOf).map((c) => [c.upgradeOf as string, c.id])
);
