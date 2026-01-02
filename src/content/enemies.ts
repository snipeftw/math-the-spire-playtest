// src/content/enemies.ts
import type {
  SpriteRef,
  EnemyAI,
  EnemyAISimple,
  EnemySpawnDef,
  EnemyState,
  Status,
} from "../game/battle";
import { rollIntentFromAI } from "../game/battle";
import type { RNG } from "../game/rng";
import { pick } from "../game/rng";
import { enemyImg } from "./assetUrls";

export type EncounterDef = {
  id: string;
  name: string;
  enemies: Array<{
    id: string;
    name: string;
    hp: number;
    maxHP: number;
    block?: number;
    sprite: SpriteRef;
    ai: EnemyAI;
    statuses?: Status[];
  }>;
};

// --- AI helpers ---
const aiAttack = (dmg: number): EnemyAI => ({
  moves: [{ kind: "ATTACK", dmg, weight: 1 }],
});

const aiAttackWithDebuff = (dmg: number, statusId: string, stacks: number): EnemyAI => ({
  moves: [
    { kind: "ATTACK", dmg, weight: 3 },
    { kind: "DEBUFF", statusId, stacks, weight: 1 },
  ],
  noRepeatKind: true,
});

const aiBruiser = (dmg: number, bigDmg: number): EnemyAI => ({
  moves: [
    { kind: "ATTACK", dmg, weight: 3 },
    { kind: "ATTACK", dmg: bigDmg, weight: 1 },
  ],
  noRepeatKind: true,
});

const aiGuard = (dmg: number, block: number): EnemyAI => ({
  moves: [
    { kind: "BLOCK", block, weight: 2 },
    { kind: "ATTACK", dmg, weight: 2 },
  ],
  noRepeatKind: true,
});

const aiCaster = (dmg: number, statusId: string, stacks: number, block: number): EnemyAI => ({
  moves: [
    { kind: "DEBUFF", statusId, stacks, weight: 2 },
    { kind: "ATTACK", dmg, weight: 2 },
    { kind: "BLOCK", block, weight: 1 },
  ],
  noRepeatKind: true,
});

const aiMultiHit = (dmg: number, hits: number, block: number): EnemyAI => ({
  moves: [
    { kind: "ATTACK", dmg, hits, weight: 3 },
    { kind: "BLOCK", block, weight: 1 },
  ],
  noRepeatKind: true,
});

const aiSequence = (...moves: EnemyAI["moves"] extends (infer T)[] ? T[] : any[]): EnemyAI => ({
  sequence: moves as any,
});

const aiPhaseSequence = (base: any[], phase50: any[]): EnemyAI => ({
  sequence: base as any,
  phases: [{ id: "phase2", atOrBelowHpPct: 50, sequence: phase50 as any }],
});

// --- Helpers ---
function e(
  id: string,
  name: string,
  hp: number,
  sprite: SpriteRef,
  ai: EnemyAI,
  statuses: Status[] = [],
  block: number = 0
): EncounterDef["enemies"][number] {
  return { id, name, hp, maxHP: hp, block, sprite, ai, statuses };
}

// --- Summons ---
const NOTELET_AI: EnemyAISimple = {
  moves: [{ kind: "ATTACK", dmg: 4, weight: 1 }],
};

const NOTELET_SPAWN: EnemySpawnDef = {
  baseId: "notelet",
  name: "Cursed Notelet",
  hp: 18,
  sprite: { kind: "image", src: enemyImg("possessednotelet.webp"), alt: "Possessed Notelet" },
  ai: NOTELET_AI,
};

const TOXIC_GARBAGE_AI: EnemyAISimple = {
  sequence: [
    [
      { kind: "DEBUFF", statusId: "weak", stacks: 1 },
      { kind: "DEBUFF", statusId: "poison", stacks: 1 },
      { kind: "DEBUFF", statusId: "vulnerable", stacks: 1 },
      { kind: "ADD_NEGATIVE_CARD", cardId: "neg_infestation" },
    ],
  ],
};

const TOXIC_RECYCLING_AI: EnemyAISimple = {
  sequence: [
    [
      { kind: "DEBUFF", statusId: "weak", stacks: 1 },
      { kind: "DEBUFF", statusId: "poison", stacks: 1 },
      { kind: "DEBUFF", statusId: "vulnerable", stacks: 1 },
      { kind: "ADD_NEGATIVE_CARD", cardId: "neg_radiation" },
    ],
  ],
};

const TOXIC_GARBAGE_SPAWN: EnemySpawnDef = {
  baseId: "toxic_garbage",
  name: "Toxic Garbage",
  hp: 15,
  sprite: { kind: "image", src: enemyImg("toxicgarbage.webp"), alt: "Toxic Garbage" },
  ai: TOXIC_GARBAGE_AI,
  statuses: [{ id: "toxic_immunity", stacks: 1 }],
};

const TOXIC_RECYCLING_SPAWN: EnemySpawnDef = {
  baseId: "toxic_recycling",
  name: "Toxic Recycling",
  hp: 15,
  sprite: { kind: "image", src: enemyImg("toxicrecycling.webp"), alt: "Toxic Recycling" },
  ai: TOXIC_RECYCLING_AI,
  statuses: [{ id: "toxic_immunity", stacks: 1 }],
};

// --- Standard encounter pools ---
// Pool 1 (depth 1–3): easy encounters (5)
export const ENCOUNTER_POOL_EASY_5: EncounterDef[] = [
  {
    id: "easy_demented_blue_jay",
    name: "Demented Blue Jay",
    enemies: [
      e(
        "demented_blue_jay",
        "Demented Blue Jay",
        40,
        { kind: "image", src: enemyImg("dementedbluejay.webp"), alt: "Demented Blue Jay" },
        aiGuard(8, 6)
      ),
    ],
  },
  {
    id: "easy_locker_goblin",
    name: "Locker Goblin",
    enemies: [
      e(
        "locker_goblin",
        "Locker Goblin",
        40,
        { kind: "image", src: enemyImg("lockergoblin.webp"), alt: "Locker Goblin" },
        aiSequence(
          [{ kind: "DEBUFF", statusId: "weak", stacks: 1 }, { kind: "DEBUFF", statusId: "vulnerable", stacks: 1 }],
          { kind: "ATTACK", dmg: 6 }
        )
      ),
    ],
  },
  {
    id: "easy_demonic_dust_bunny",
    name: "Demonic Dust Bunny",
    enemies: [
      e(
        "demonic_dust_bunny",
        "Demonic Dust Bunny",
        40,
        { kind: "image", src: enemyImg("demonicdustbunny.webp"), alt: "Demonic Dust Bunny" },
        {
          moves: [
            { kind: "ATTACK", dmg: 5, weight: 1 },
            { kind: "BLOCK", block: 5, weight: 1 },
          ],
          noRepeatKind: true,
        },
        [{ id: "auto_block", stacks: 5 }, { id: "trigger_clone_at_20", stacks: 1 }]
      ),
    ],
  },
  {
    id: "easy_toxic_lab_spill",
    name: "Toxic Lab Spill",
    enemies: [
      e(
        "toxic_lab_spill",
        "Toxic Lab Spill",
        35,
        { kind: "image", src: enemyImg("toxiclabspill.webp"), alt: "Toxic Lab Spill" },
        aiAttackWithDebuff(5, "poison", 3),
        [{ id: "toxic_immunity", stacks: 1 }]
      ),
    ],
  },
  {
    id: "easy_possessed_trio",
    name: "Possessed Supplies",
    enemies: [
      e(
        "possessed_pencil",
        "Possessed Pencil",
        25,
        { kind: "image", src: enemyImg("possessedpencil.webp"), alt: "Possessed Pencil" },
        aiAttack(5),
        [{ id: "trigger_block_at_13", stacks: 1 }]
      ),
      e(
        "possessed_eraser",
        "Possessed Eraser",
        22,
        { kind: "image", src: enemyImg("possessederaser.webp"), alt: "Possessed Eraser" },
        aiSequence({ kind: "ATTACK", dmg: 4 }, { kind: "DEBUFF", statusId: "vulnerable", stacks: 2 }),
        [{ id: "trigger_erase_buffs_at_5", stacks: 1 }]
      ),
      e(
        "possessed_sharpener",
        "Possessed Pencil Sharpener",
        10,
        { kind: "image", src: enemyImg("possessedsharpener.webp"), alt: "Possessed Pencil Sharpener" },
        aiAttack(2),
        [{ id: "aura_strength_to_pencil", stacks: 1 }]
      ),
    ],
  },
];

// Pool 2 (depth 4–6): medium encounters (5)
export const ENCOUNTER_POOL_MED_5: EncounterDef[] = [
  {
    id: "med_zombie_athlete",
    name: "Zombie Athlete",
    enemies: [
      e(
        "zombie_athlete",
        "Zombie Athlete",
        55,
        { kind: "image", src: enemyImg("zombieathlete.webp"), alt: "Zombie Athlete" },
        aiGuard(8, 12)
      ),
    ],
  },
  {
    id: "med_possessed_scissors",
    name: "Possessed Scissors",
    enemies: [
      e(
        "possessed_scissors",
        "Possessed Scissors",
        56,
        { kind: "image", src: enemyImg("possessedscissors.webp"), alt: "Possessed Scissors" },
        aiMultiHit(7, 2, 8),
        [{ id: "on_unblocked_add_temp_curse", stacks: 1 }]
      ),
    ],
  },
  {
    id: "med_office_gremlins",
    name: "Office Gremlins",
    enemies: [
      e(
        "office_gremlin_a",
        "Gremlin A",
        40,
        { kind: "image", src: enemyImg("officegremlina.webp"), alt: "Office Gremlin A" },
        aiGuard(5, 6)
      ),
      e(
        "office_gremlin_b",
        "Gremlin B",
        44,
        { kind: "image", src: enemyImg("officegremlinb.webp"), alt: "Office Gremlin B" },
        aiAttackWithDebuff(7, "weak", 1)
      ),
    ],
  },
  {
    id: "med_substitute_teacher",
    name: "Substitute Teacher",
    enemies: [
      e(
        "substitute_teacher",
        "Substitute Teacher",
        58,
        { kind: "image", src: enemyImg("substitute.webp"), alt: "Substitute Teacher" },
        {
          sequence: [{ kind: "DEBUFF", statusId: "vulnerable", stacks: 2 }, [{ kind: "ATTACK", dmg: 3 }, { kind: "BLOCK", block: 6 }]],
          noRepeatKind: true,
        },
        [{ id: "gain_strength_when_hit", stacks: 1 }]
      ),
    ],
  },
  {
    id: "med_twin_chromebooks",
    name: "Twin Casters",
    enemies: [
      e(
        "sentient_chromebook_a",
        "Sentient Chromebook",
        44,
        { kind: "image", src: enemyImg("sentientchromebook.webp"), alt: "Sentient Chromebook" },
        {
          moves: [
            { kind: "ATTACK", dmg: 6, weight: 2 },
            { kind: "DEBUFF", statusId: "weak", stacks: 1, weight: 1 },
            { kind: "BLOCK", block: 5, weight: 1 },
          ],
          noRepeatKind: true,
          intentsPerTurn: 2,
        }
      ),
      e(
        "sentient_chromebook_b",
        "Sentient Chromebook",
        44,
        { kind: "image", src: enemyImg("sentientchromebook.webp"), alt: "Sentient Chromebook" },
        {
          moves: [
            { kind: "ATTACK", dmg: 6, weight: 2 },
            { kind: "DEBUFF", statusId: "weak", stacks: 1, weight: 1 },
            { kind: "BLOCK", block: 5, weight: 1 },
          ],
          noRepeatKind: true,
          intentsPerTurn: 2,
        }
      ),
    ],
  },
  {
    id: "med_possessed_binder",
    name: "Possessed Binder",
    enemies: [
      e(
        "possessed_binder",
        "Possessed Binder",
        44,
        { kind: "image", src: enemyImg("possessedbinder.webp"), alt: "Possessed Binder" },
        {
          sequence: [
            { kind: "SUMMON", spawn: NOTELET_SPAWN, count: 1 },
            { kind: "BLOCK", block: 8 },
            { kind: "ATTACK", dmg: 7 },
          ],
          noRepeatKind: true,
        },
        [{ id: "binder_summon_scaling", stacks: 1 }]
      ),
    ],
  },
];

// Pool 3 (depth 7+): hard encounters (5)
export const ENCOUNTER_POOL_HARD_5: EncounterDef[] = [
  {
    id: "hard_bathroom_bully",
    name: "Bathroom Bully",
    enemies: [
      e(
        "bathroom_bully",
        "Bathroom Bully",
        65,
        { kind: "image", src: enemyImg("bathroombully.webp"), alt: "Bathroom Bully" },
        aiAttackWithDebuff(12, "vulnerable", 1),
        [{ id: "auto_block", stacks: 6 }]
      ),
    ],
  },
  {
    id: "hard_toilet_dragon",
    name: "Toilet Dragon",
    enemies: [
      e(
        "toilet_dragon",
        "Toilet Dragon",
        50,
        { kind: "image", src: enemyImg("toiletdragon.webp"), alt: "Toilet Dragon" },
        {
          moves: [
            { kind: "ATTACK", dmg: 13, weight: 3 },
            { kind: "ATTACK", dmg: 1, hits: 6, weight: 2 },
            { kind: "ATTACK", dmg: 7, hits: 2, weight: 2 },
            { kind: "BUFF", statusId: "strength", stacks: 1, weight: 1 },
          ],
          noRepeatKind: true,
        }
      ),
    ],
  },
  {
    id: "hard_alien_scientist",
    name: "Alien Scientist",
    enemies: [
      e(
        "alien_scientist",
        "Alien Scientist",
        60,
        { kind: "image", src: enemyImg("alienscientist.webp"), alt: "Alien Scientist" },
        {
          moves: [
            { kind: "DEBUFF", statusId: "vulnerable", stacks: 3, weight: 2 },
            { kind: "DEBUFF", statusId: "poison", stacks: 2, weight: 2 },
            { kind: "ATTACK", dmg: 14, weight: 3 },
            { kind: "BLOCK", block: 8, weight: 1 },
            { kind: "HEAL", heal: 15, weight: 1 },
            { kind: "ADD_NEGATIVE_CARD", cardId: "neg_curse", weight: 1 },
          ],
          noRepeatKind: true,
        }
      ),
    ],
  },
  {
    id: "hard_defensive_desk_phones",
    name: "Defensive Desk & Smart Phones",
    enemies: [
      e(
        "defensive_desk",
        "Defensive Desk",
        90,
        { kind: "image", src: enemyImg("defensivedesk.webp"), alt: "Defensive Desk" },
        aiSequence({ kind: "BLOCK", block: 10 }),
        [{ id: "desk_phone_shield", stacks: 1 }]
      ),
      e(
        "smartphone_a",
        "Smart Phone A",
        13,
        { kind: "image", src: enemyImg("smartphonea.webp"), alt: "Smart Phone A" },
        aiSequence(
          { kind: "ATTACK", dmg: 2, hits: 3 },
          { kind: "DEBUFF", statusId: "vulnerable", stacks: 1 },
          { kind: "DEBUFF", statusId: "weak", stacks: 1 }
        )
      ),
      e(
        "smartphone_b",
        "Smart Phone B",
        14,
        { kind: "image", src: enemyImg("smartphoneb.webp"), alt: "Smart Phone B" },
        aiSequence(
          { kind: "DEBUFF", statusId: "weak", stacks: 1 },
          { kind: "ATTACK", dmg: 2, hits: 3 },
          { kind: "DEBUFF", statusId: "vulnerable", stacks: 1 }
        )
      ),
      e(
        "smartphone_c",
        "Smart Phone C",
        15,
        { kind: "image", src: enemyImg("smartphonec.webp"), alt: "Smart Phone C" },
        aiSequence(
          { kind: "DEBUFF", statusId: "vulnerable", stacks: 1 },
          { kind: "DEBUFF", statusId: "weak", stacks: 1 },
          { kind: "ATTACK", dmg: 2, hits: 3 }
        )
      ),
    ],
  },
  {
    id: "hard_animated_trophy",
    name: "Animated Trophy",
    enemies: [
      e(
        "animated_trophy",
        "Animated Trophy",
        64,
        { kind: "image", src: enemyImg("animatedtrophy.webp"), alt: "Animated Trophy" },
        aiPhaseSequence(
          [
            { kind: "BLOCK", block: 12 },
            { kind: "ATTACK", dmg: 10 },
            { kind: "BUFF", statusId: "strength", stacks: 1 },
          ],
          [
            { kind: "ATTACK", dmg: 12 },
            { kind: "ATTACK", dmg: 6, hits: 2 },
            { kind: "BUFF", statusId: "strength", stacks: 1 },
          ]
        ),
        [],
        12
      ),
    ],
  },

  // --- Final enemies ---
  {
    id: "hard_toxic_dumpster",
    name: "Toxic Dumpster",
    enemies: [
      e(
        "toxic_dumpster",
        "Toxic Dumpster",
        74,
        { kind: "image", src: enemyImg("toxicdumpster.webp"), alt: "Toxic Dumpster" },
        {
          moves: [
            { kind: "DEBUFF", statusId: "poison", stacks: 4, weight: 3 },
            { kind: "ATTACK", dmg: 13, weight: 3 },
            { kind: "ATTACK", dmg: 6, hits: 2, weight: 2 },
            { kind: "BLOCK", block: 14, weight: 1 },
            { kind: "ADD_NEGATIVE_CARD", cardId: "neg_curse", weight: 1 },
          ],
          noRepeatKind: true,
        },
        [{ id: "auto_block", stacks: 6 }, { id: "toxic_immunity", stacks: 1 }],
        6
      ),
    ],
  },
  {
    id: "hard_cursed_detention_slip",
    name: "Cursed Detention Slip",
    enemies: [
      e(
        "cursed_detention_slip",
        "Cursed Detention Slip",
        70,
        { kind: "image", src: enemyImg("cursedslip.webp"), alt: "Cursed Detention Slip" },
        aiSequence(
          { kind: "DEBUFF", statusId: "weak", stacks: 1 },
          { kind: "ATTACK", dmg: 11 },
          { kind: "DEBUFF", statusId: "vulnerable", stacks: 1 }
        ),
        // battle.ts will decrement this once per action; when it hits 0, it transforms.
        [{ id: "evolving", stacks: 3 }]
      ),
    ],
  },
];

// --- Challenge encounters ("elite" style) ---
export const ENCOUNTER_POOL_CHALLENGE_EASY: EncounterDef[] = [
  {
    id: "ch_toxic_dumpster",
    name: "Toxic Dumpster",
    enemies: [
      e(
        "toxic_dumpster",
        "Toxic Dumpster",
        50,
        { kind: "image", src: enemyImg("toxicdumpster.webp"), alt: "Toxic Dumpster" },
        {
          sequence: [
            [{ kind: "SUMMON", spawn: TOXIC_GARBAGE_SPAWN, count: 1 }, { kind: "SUMMON", spawn: TOXIC_RECYCLING_SPAWN, count: 1 }],
            { kind: "BUFF", statusId: "regen", stacks: 4 },
            { kind: "BLOCK", block: 10 },
            { kind: "ATTACK", dmg: 9 },
            { kind: "CONSUME_MINIONS_HEAL" },
          ],
        },
        [{ id: "toxic_immunity", stacks: 1 }]
      ),
    ],
  },
  {
    id: "ch_cursed_detention",
    name: "Cursed Detention Slip",
    enemies: [
      e(
        "cursed_detention_slip",
        "Cursed Detention Slip",
        42,
        { kind: "image", src: enemyImg("cursedslip.webp"), alt: "Cursed Detention Slip" },
        aiSequence({ kind: "BLOCK", block: 5 }, { kind: "BLOCK", block: 7 }, { kind: "BLOCK", block: 10 }),
        [{ id: "evolving", stacks: 3 }]
      ),
    ],
  },
];

export const ENCOUNTER_POOL_CHALLENGE_MED: EncounterDef[] = [
  {
    id: "ch_six_seven",
    name: "Six & Seven",
    enemies: [
      e(
        "six",
        "Six",
        67,
        { kind: "image", src: enemyImg("6.webp"), alt: "Six" },
        aiSequence({ kind: "ATTACK", dmg: 1, hits: 6 }, { kind: "DEBUFF", statusId: "vulnerable", stacks: 1 }),
        [{ id: "auto_strength", stacks: 1 }]
      ),
      e(
        "seven",
        "Seven",
        67,
        { kind: "image", src: enemyImg("7.webp"), alt: "Seven" },
        aiSequence({ kind: "DEBUFF", statusId: "weak", stacks: 1 }, { kind: "ATTACK", dmg: 1, hits: 7 }),
        [{ id: "auto_strength", stacks: 1 }]
      ),
    ],
  },
  {
    id: "ch_lab_accident",
    name: "Lab Accident (Charged)",
    enemies: [
      e(
        "lab_accident",
        "Lab Accident",
        55,
        { kind: "image", src: enemyImg("toxiclabspill.webp"), alt: "Lab Accident" },
        {
          sequence: [
            { kind: "DEBUFF", statusId: "poison", stacks: 4 },
            { kind: "ATTACK", dmg: 10, hits: 2 },
            { kind: "HEAL", heal: 8 },
          ],
        },
        [{ id: "auto_block", stacks: 6 }, { id: "toxic_immunity", stacks: 1 }]
      ),
    ],
  },
];

export const ENCOUNTER_POOL_CHALLENGE_HARD: EncounterDef[] = [
  {
    id: "ch_mecha_pencil",
    name: "Mecha Pencil",
    enemies: [
      e(
        "mecha_pencil",
        "Mecha Pencil",
        72,
        { kind: "image", src: enemyImg("Mecha Pencil.webp"), alt: "Mecha Pencil" },
        {
          sequence: [
            { kind: "ADD_NEGATIVE_CARD", cardId: "neg_temp_curse" },
            [{ kind: "ATTACK", dmg: 10 }, { kind: "BLOCK", block: 10 }],
            { kind: "ERASE_BUFFS" },
            [{ kind: "ATTACK", dmg: 10 }, { kind: "BLOCK", block: 10 }],
            { kind: "HEAL", heal: 8 },
          ],
        }
      ),
    ],
  },
  {
    id: "ch_six_seven_plus",
    name: "Six & Seven (Mean)",
    enemies: [
      e(
        "six",
        "Six",
        42,
        { kind: "image", src: enemyImg("6.webp"), alt: "Six" },
        aiSequence({ kind: "ATTACK", dmg: 1, hits: 6 }, { kind: "DEBUFF", statusId: "vulnerable", stacks: 2 })
      ),
      e(
        "seven",
        "Seven",
        44,
        { kind: "image", src: enemyImg("7.webp"), alt: "Seven" },
        aiSequence({ kind: "DEBUFF", statusId: "weak", stacks: 2 }, { kind: "ATTACK", dmg: 1, hits: 7 })
      ),
    ],
  },
];

export const BOSS_ENCOUNTER: EncounterDef = {
  id: "boss_mrs_pain",
  name: "Mrs. Pain",
  enemies: [
    e(
      "mrs_pain",
      "Mrs. Pain",
      200,
      { kind: "image", src: enemyImg("mrspain.webp"), alt: "Mrs. Pain" },
      {
        sequence: [
          { kind: "ATTACK", dmg: 12 },
          [{ kind: "DEBUFF", statusId: "weak", stacks: 9 }, { kind: "DEBUFF", statusId: "vulnerable", stacks: 9 }],
          { kind: "ATTACK", dmg: 7, hits: 2 },
          { kind: "DEBUFF", statusId: "poison", stacks: 4 },
          { kind: "EXHAUST_RANDOM_CARD" },
          [{ kind: "FORCE_QUESTION", dmgOnWrong: 50 }, { kind: "CLEANSE_SELF" }],
        ],
      },
      [{ id: "auto_block", stacks: 7 }, { id: "auto_strength", stacks: 1 }, { id: "mrs_pain_pop_quiz", stacks: 1 }]
    ),
  ],
};

export function pickEncounterForDepth(
  rng: RNG,
  depth: number,
  isBoss: boolean,
  isChallenge: boolean
): EncounterDef {
  if (isBoss) return BOSS_ENCOUNTER;

  if (isChallenge) {
    const pool = depth <= 4 ? ENCOUNTER_POOL_CHALLENGE_EASY : depth <= 9 ? ENCOUNTER_POOL_CHALLENGE_MED : ENCOUNTER_POOL_CHALLENGE_HARD;
    return pick(rng, pool);
  }

  // Standard fights: 1–4 easy, 5–9 medium, 10+ hard (adjusted for longer game)
  const pool = depth <= 4 ? ENCOUNTER_POOL_EASY_5 : depth <= 9 ? ENCOUNTER_POOL_MED_5 : ENCOUNTER_POOL_HARD_5;
  return pick(rng, pool);
}

export function encounterToEnemyStates(enc: EncounterDef, rng: RNG): EnemyState[] {
  return enc.enemies.map((x) => {
    const rolled = rollIntentFromAI(x.ai, rng, {
      lastKind: undefined,
      seqIndex: 0,
      seqKey: undefined,
      hp: x.hp,
      maxHP: x.maxHP,
    });

    const intents = rolled.intents && rolled.intents.length > 1 ? rolled.intents : undefined;

    return {
      id: x.id,
      name: x.name,
      hp: x.hp,
      maxHP: x.maxHP,
      block: Math.max(0, Math.floor(Number((x as any).block ?? 0))),
      intent: rolled.intent,
      intents,
      lastIntentKind: rolled.intent.kind,
      ai: x.ai,
      aiSeqIndex: rolled.seqIndex,
      aiSeqKey: rolled.seqKey,
      sprite: x.sprite,
      statuses: x.statuses ?? [],
    };
  });
}
