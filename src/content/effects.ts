// src/content/effects.ts
export type EffectDef = {
  id: string;
  icon: string;
  name: string;
  description: string;
  stacking?: "stack" | "refresh" | "none";
};

export const EFFECTS: EffectDef[] = [
  {
    id: "weak",
    icon: "🪶",
    name: "Weak",
    description: "Deals 25% less damage with attacks.",
    stacking: "stack",
  },
  {
    id: "vulnerable",
    icon: "🎯",
    name: "Vulnerable",
    description: "Takes 25% more damage from attacks.",
    stacking: "stack",
  },
  {
    id: "strength",
    icon: "💪",
    name: "Strength",
    description: "Attacks deal +1 damage per stack.",
    stacking: "stack",
  },
  {
    id: "auto_block",
    icon: "🛡️",
    name: "Fortify",
    description: "At the start of its turn, gain Block equal to stacks.",
    stacking: "stack",
  },
  {
    id: "auto_strength",
    icon: "📈",
    name: "Rage",
    description: "At the start of its turn, gain Strength +X.",
    stacking: "stack",
  },
  {
    id: "poison",
    icon: "☠️",
    name: "Poison",
    description: "Lose HP equal to stacks at end of turn, then reduce stacks by 1.",
    stacking: "stack",
  },
  {
    id: "regen",
    icon: "🩹",
    name: "Regen",
    description: "Heal HP equal to stacks at end of turn, then reduce stacks by 1.",
    stacking: "stack",
  },
  {
    id: "double_attack",
    icon: "👊",
    name: "Confidence",
    description: "Your next attack this turn deals double damage.",
    stacking: "stack",
  },
  {
    id: "trigger_clone_at_20",
    icon: "🧬",
    name: "Split",
    description: "When HP drops to 20 or less, clone itself at its current HP (once).",
    stacking: "none",
  },
  {
    id: "trigger_block_at_13",
    icon: "🛡️",
    name: "Last Stand",
    description: "When HP drops to 13 or less, gain 10 Block (once).",
    stacking: "none",
  },
  {
    id: "trigger_erase_buffs_at_5",
    icon: "🧽",
    name: "Wipe",
    description: "When HP drops to 5 or less, remove your buffs (once).",
    stacking: "none",
  },
  {
    id: "aura_strength_to_pencil",
    icon: "✏️",
    name: "Sharpen",
    description: "At the start of its turn, give +1 Strength to the Pencil while it lives.",
    stacking: "stack",
  },
  {
    id: "on_unblocked_add_temp_curse",
    icon: "🃏",
    name: "Hex Blades",
    description: "If it deals any unblocked damage, it shuffles a temporary Curse into your deck for this battle.",
    stacking: "none",
  },
  {
    id: "mrs_pain_pop_quiz",
    icon: "📝",
    name: "Pop Quiz",
    description: "Mrs Pain will add a Pop Quiz to your hand every turn.",
    stacking: "none",
  },
  {
    id: "gain_strength_when_hit",
    icon: "📚",
    name: "Strict",
    description: "When you damage it, it gains +1 Strength.",
    stacking: "none",
  },
  {
    id: "binder_summon_scaling",
    icon: "📝",
    name: "Escalate",
    description: "Each time it summons, it summons one more next time.",
    stacking: "stack",
  },
  {
    id: "desk_phone_shield",
    icon: "🪵",
    name: "Desk Shield",
    description: "This enemy tanks damage for Smart Phone ___. Attacks that hit all enemies are not affected.",
    stacking: "none",
  },
  {
    id: "desk_phone_defended",
    icon: "🛡️",
    name: "Defended",
    description: "This Smart Phone is currently protected by the Defensive Desk.",
    stacking: "none",
  },
  {
    id: "phone_last_alive",
    icon: "📱",
    name: "Last One Standing",
    description: "If this is the last Smart Phone alive, it performs its full 3-step combo each turn.",
    stacking: "none",
  },
  {
    id: "dies_with_summoner",
    icon: "⛓️",
    name: "Bound",
    description: "If its summoner dies, this minion collapses shortly after.",
    stacking: "none",
  },
  {
    id: "toxic_immunity",
    icon: "🧪",
    name: "Toxic Immunity",
    description: "Immune to Poison.",
    stacking: "none",
  },
  {
    id: "pending_hand_exhaust",
    icon: "🔥",
    name: "Burn Notice",
    description: "At the start of your next turn, a random card in your hand will be Exhausted.",
    stacking: "stack",
  },
];

export function getEffectDef(id: string | null | undefined) {
  if (!id) return undefined;
  return EFFECTS.find((e) => e.id === id);
}

