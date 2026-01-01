// src/content/supplies.ts
export type SupplyRarity = "Common" | "Uncommon" | "Rare" | "Ultra Rare";

export type SupplyDef = {
  id: string;
  name: string;
  desc: string;
  emoji?: string;
  rarity: SupplyRarity;

  eventOnly?: boolean;
};

// Supplies are PASSIVE run modifiers (relic-style).
// The player currently selects ONE supply during Setup.
export const SUPPLIES_POOL_10: SupplyDef[] = [
  {
    id: "sup_start_strength",
    name: "Protein Bar",
    emoji: "💪",
    desc: "Start every battle with Strength 2.",
    rarity: "Common",
  },
  {
    id: "sup_gold_boost",
    name: "Golden Pencil",
    emoji: "✏️",
    desc: "Gain +50% gold whenever you gain gold (rounded up).",
    rarity: "Common",
  },
  {
    id: "sup_double_offers",
    name: "Photocopier",
    emoji: "📠",
    desc: "After battles, card rewards offer 6 cards instead of 3.",
    rarity: "Common",
  },
  {
    id: "sup_post_battle_heal",
    name: "Ice Pack",
    emoji: "🧊",
    desc: "Heal 10 HP after every battle you win.",
    rarity: "Common",
  },
  {
    id: "sup_reflect_block",
    name: "Bathroom Mirror",
    emoji: "🪞",
    desc: "Whenever you block damage, deal 50% of the blocked amount back to an enemy (floored).",
    rarity: "Common",
  },
  {
    id: "sup_apply_poison",
    name: "Deodorant",
    emoji: "🧼",
    desc: "At the start of every turn, apply 2 Poison to all enemies.",
    rarity: "Common",
  },
  {
    id: "sup_no_debuffs",
    name: "Headphones",
    emoji: "🎧",
    desc: "Debuffs can no longer be applied to you.",
    rarity: "Uncommon",
  },
  {
    id: "sup_upgrade_rest",
    name: "Comfy Pillow",
    emoji: "🛏️",
    desc: "At rest sites you can both Upgrade a card and Rest.",
    rarity: "Uncommon",
  },
  {
    id: "sup_shop_discount",
    name: "Student Discount",
    emoji: "🏷️",
    desc: "Shop prices are 50% off.",
    rarity: "Rare",
  },
  {
    id: "sup_upgraded_rewards",
    name: "Note Taker",
    emoji: "📝",
    desc: "All card rewards are upgraded.",
    rarity: "Rare",
  },
  {
    id: "sup_bicycle",
    name: "Bicycle",
    emoji: "🚲",
    desc: "Gain 2 additional energy every turn.",
    rarity: "Rare",
  },
  {
    id: "sup_block_gain",
    name: "Winter Coat",
    emoji: "🧥",
    desc: "Gain 5 Block at the start of every turn.",
    rarity: "Uncommon",
  },
  {
    id: "sup_no_questions",
    name: "4+ Test",
    emoji: "✅",
    desc: "You no longer have to answer questions for ATTACK cards.",
    rarity: "Ultra Rare",
  },
  {
    id: "sup_increase_max_health",
    name: "Hefty Lunch",
    emoji: "🍱",
    desc: "Increase your maximum health by 20.",
    rarity: "Uncommon",
  },

  // -------------------------
  // Event-only supplies (relic-style)
  // -------------------------
  {
    id: "sup_block_persist",
    name: "Locker Door",
    emoji: "🚪",
    desc: "Your leftover Block does not reset at the start of your turn.",
    rarity: "Rare",
    eventOnly: true,
  },
  {
    id: "sup_energy_carryover",
    name: "Battery Pack",
    emoji: "🔋",
    desc: "Unspent Energy carries over to your next turn.",
    rarity: "Ultra Rare",
    eventOnly: true,
  },
  {
    id: "sup_poison_spreads",
    name: "Contagion",
    emoji: "🦠",
    desc: "Whenever you apply Poison to an enemy, apply it to ALL enemies.",
    rarity: "Rare",
    eventOnly: true,
  },
  {
    id: "sup_poison_double_damage",
    name: "Toxic Booster",
    emoji: "☣️",
    desc: "Poison deals damage twice each turn (enemies only).",
    rarity: "Ultra Rare",
    eventOnly: true,
  },
  {
    id: "sup_multi_attack_plus",
    name: "Extra Swing",
    emoji: "⚔️",
    desc: "Your Multi-Attack cards hit 1 additional time.",
    rarity: "Rare",
    eventOnly: true,
  },
  {
    id: "sup_no_negative_cards",
    name: "Perfect Record",
    emoji: "🧾",
    desc: "You can no longer gain negative cards.",
    rarity: "Ultra Rare",
    eventOnly: true,
  },

  {
    id: "sup_negative_draw_burst",
    name: "Red Pen",
    emoji: "🖊️",
    desc: "Whenever you draw a negative card, deal 5 damage to ALL enemies.",
    rarity: "Rare",
    eventOnly: true,
  },

  {
    id: "sup_strength_to_block",
    name: "Weight Belt",
    emoji: "🏋️",
    desc: "Whenever you gain Block from a BLOCK card, also gain Block equal to your Strength.",
    rarity: "Rare",
    eventOnly: true,
  },
];
