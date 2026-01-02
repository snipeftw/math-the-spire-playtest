// src/content/consumables.ts
export type ConsumableRarity = "Common" | "Uncommon" | "Rare";

export type ConsumableDef = {
  id: string;
  name: string;
  desc: string;
  emoji?: string;
  rarity: ConsumableRarity;

  eventOnly?: boolean;
};

export const CONSUMABLES_10: ConsumableDef[] = [
  { id: "con_apple", name: "Apple", emoji: "🍎", desc: "Gain 5 Regen.", rarity: "Common" },
  { id: "con_sandwich", name: "Sandwich", emoji: "🥪", desc: "Heal 12 HP.", rarity: "Common" },
  { id: "con_rain_coat", name: "Rain Coat", emoji: "☔", desc: "Gain 8 Block.", rarity: "Common" },
  { id: "con_cookie", name: "Cookie", emoji: "🍪", desc: "Draw 3 cards.", rarity: "Common" },
  { id: "con_shake", name: "Protein Shake", emoji: "🥤", desc: "Gain 2 Strength.", rarity: "Uncommon" },

  // Note: you listed Trail Mix twice in an earlier list. This version does BOTH:
  // +2 Energy (temporary) AND apply 3 Vulnerable to the targeted enemy.
  { id: "con_trailmix", name: "Trail Mix", emoji: "🥜", desc: "Gain +2 Energy (this turn) and apply 3 Vulnerable to a target.", rarity: "Uncommon" },

  // NEW: Water now permanently increases max HP.
  { id: "con_water", name: "Water", emoji: "💧", desc: "Permanently increase your Max HP by 7.", rarity: "Uncommon" },

  // NEW: Eraser has Water's old effect.
  { id: "con_eraser", name: "Eraser", emoji: "🧽", desc: "Remove Poison, Weak, and Vulnerable from yourself.", rarity: "Common" },

  { id: "con_chips", name: "Chips", emoji: "🍟", desc: "Deal 10 damage to the targeted enemy.", rarity: "Common" },
  { id: "con_answer_key", name: "Answer Key", emoji: "🔑", desc: "If a question is open, auto-solve it (plays the card as correct).", rarity: "Rare", eventOnly: true },
  { id: "con_moldy_food", name: "Moldy Food", emoji: "🤢", desc: "Apply 5 Poison to the targeted enemy.", rarity: "Uncommon" },
  { id: "con_absence_note", name: "Absence Note", emoji: "📝", desc: "Skip this fight and collect no rewards.", rarity: "Rare", eventOnly: true },
  { id: "con_cheat_sheet", name: "Cheat Sheet", emoji: "📄", desc: "Upgrade all cards in your hand for the rest of this battle.", rarity: "Rare", eventOnly: true },

  { id: "con_trash_bin", name: "Trash Bin", emoji: "🗑️", desc: "Permanently remove a card from your deck.", rarity: "Rare", eventOnly: true },
];
