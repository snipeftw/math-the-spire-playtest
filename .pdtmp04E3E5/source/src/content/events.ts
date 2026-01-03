// src/content/events.ts

// Minimal event content system.
// Add new events here; game state picks an eventId for each EVENT node.

export type EventChoiceId = string;

export type EventDef = {
  id: string;
  title: string;
  artFile: string; // in src/assets/events/
  intro: string[]; // paragraphs
  choices: Array<{
    id: EventChoiceId;
    label: string;
    hint?: string;
  }>;
};

export const EVENTS: EventDef[] = [
  {
    id: "hallway_shortcut",
    title: "Hallway Shortcut",
    artFile: "hallway_shortcut.webp",
    intro: [
      "You spot a side hallway that looks like a shortcut.",
      "Six identical lockers line the corridor. It feels like a trap… but the rewards could be worth it.",
    ],
    choices: [
      {
        id: "enter",
        label: "Take the shortcut",
        hint: "A press-your-luck mini-event.",
      },
      {
        id: "leave",
        label: "Stay on the main path",
        hint: "Leave. Nothing happens.",
      },
    ],
  },
  {
    id: "vending_machine_glitch",
    title: "Vending Machine Glitch",
    artFile: "vending_machine.webp",
    intro: [
      "A vending machine sits in a lonely alcove, its screen flickering between prices that don’t make sense.",
      "The keypad stutters—some buttons register twice, others not at all. A can inside rattles like it’s trying to escape.",
      "Something about the whole thing feels… hacked. Or haunted.",
    ],
    choices: [
      {
        id: "buy",
        label: "Buy (50g)",
        hint: "Spend 50 gold → get a random consumable.",
      },
      {
        id: "shake",
        label: "Shake it",
        hint: "50%: get 2 consumables • 50%: take 10 damage.",
      },
      {
        id: "leave",
        label: "Leave",
        hint: "A hall monitor blocks the way. Answer a question to slip out.",
      },
    ],
  },
  {
    id: "library_study_session",
    title: "Library Study Session",
    artFile: "library.webp",
    intro: [
      "You push into the library and the noise of the halls collapses into a soft hush.",
      "A desk lamp glows beside a stack of notes someone “forgot” to put away. A comfortable chair in the corner looks dangerously inviting.",
      "The librarian’s eyes don’t leave you—like they’re waiting to see what kind of student you really are.",
    ],
    choices: [
      {
        id: "study",
        label: "Study",
        hint: "Upgrade a card.",
      },
      {
        id: "steal_notes",
        label: "Steal notes",
        hint: "Gain Cheat Sheet • Add Pop Quiz.",
      },
      {
        id: "nap",
        label: "Nap",
        hint: "Heal 10 HP • Lose 30 gold.",
      },
      {
        id: "leave",
        label: "Leave",
        hint: "The librarian stops you. Answer a question to leave.",
      },
    ],
  },
  {
    id: "detention_notice",
    title: "Detention Notice",
    artFile: "detention.webp",
    intro: [
      "A folded slip of paper is wedged into your locker.",
      "The ink is still fresh. Someone saw something. Someone reported it. The bottom is stamped with a room number and a time that feels way too soon.",
      "You can do the right thing… or you can do what students have always done: improvise.",
    ],
    choices: [
      {
        id: "serve_detention",
        label: "Serve detention",
        hint: "Gain a Trash Bin consumable.",
      },
      {
        id: "bribe_staff",
        label: "Bribe staff (75g)",
        hint: "Pay 75 gold → upgrade a card.",
      },
      {
        id: "skip_gain_curse",
        label: "Avoid detention",
        hint: "You dodge the room… but you'll take a Curse.",
      },
    ],
  },
  {
    id: "substitute_teacher",
    title: "Substitute Teacher",
    artFile: "substitute_teacher.webp",
    intro: [
      "A stranger stands at the front of the room with a stack of worksheets and the expression of someone who was *not* given the lesson plan.",
      "They glance at the class list, then at you, then back at the list—like you’re their only lifeline.",
      "The room is restless. You can help… or you can weaponize the chaos.",
    ],
    choices: [
      {
        id: "help_them",
        label: "Help them",
        hint: "Gain an Answer Key.",
      },
      {
        id: "cause_chaos",
        label: "Cause chaos",
        hint: "Gain 75 gold • Add a random negative card.",
      },
      {
        id: "leave",
        label: "Leave",
        hint: "Slip out quietly… if you can answer a question.",
      },
    ],
  },

  {
    id: "hidden_encounter",
    title: "Hidden Encounter",
    artFile: "hidden_encounter.webp",
    intro: [
      "The hallway is quiet… too quiet.",
      "Somewhere nearby, you hear a faint scrape and a low growl—like something is trying to stay hidden.",
    ],
    choices: [
      {
        id: "investigate",
        label: "Investigate the noise",
        hint: "Face whatever is hiding here.",
      },
      {
        id: "walk_away",
        label: "Keep walking",
        hint: "Leave quietly. Nothing happens.",
      },
    ],
  },

  {
    id: "chem_lab_spill",
    title: "Chem Lab Spill",
    artFile: "chem_lab.webp",
    intro: [
      "A chemical stink hits you before you even reach the door.",
      "Inside the lab, a beaker has shattered—green sludge crawls across the counter, eating through a stack of worksheets like it’s hungry.",
      "A teacher’s voice echoes from the hall: ‘Nobody touch anything!’ (Too late.)",
    ],
    choices: [
      {
        id: "trade_deodorant",
        label: "Trade Deodorant for a full heal",
        hint: "Lose Deodorant → fully heal.",
      },
      {
        id: "take_contagion",
        label: "Take Contagion",
        hint: "Gain Contagion • Add Infestation.",
      },
      {
        id: "take_toxic_booster",
        label: "Take Toxic Booster",
        hint: "Gain Toxic Booster • Add Radiation.",
      },
      {
        id: "leave",
        label: "Leave",
        hint: "The fumes sting your eyes. Take 5 damage as you escape.",
      },
    ],
  },
  {
    id: "charging_station",
    title: "Charging Station",
    artFile: "charging_station.webp",
    intro: [
      "You find a row of wall chargers bolted into a metal cabinet—an official ‘Charging Station.’",
      "Every port is labeled, every cable neatly tied… except one outlet that’s humming like it’s alive.",
      "Your device (and your brain) could use the boost. The question is: how reckless are you feeling?",
    ],
    choices: [
      {
        id: "pay_150",
        label: "Pay (150g) — Battery Pack",
        hint: "Pay 150 gold → gain Battery Pack.",
      },
      {
        id: "rip_it_out",
        label: "Rip it out",
        hint: "Gain Battery Pack • Take 15 damage • Add Radiation.",
      },
      {
        id: "overclock_it",
        label: "Overclock it",
        hint: "Gain Overclock • Add Radiation.",
      },
      {
        id: "leave",
        label: "Leave",
        hint: "The station flashes a prompt. Answer a question to leave.",
      },
    ],
  },
  
  {
    id: "after_school_practice",
    title: "After School Practice",
    artFile: "after_school_practice.webp",
    intro: [
      "The gym lights hum and flicker like they’re tired too. Whistles echo. Shoes squeak. The air smells like rubber, sweat, and fluorescent despair.",
      "Coach’s smile is a little too wide. The drills are a little too intense. Everyone looks one mistake away from collapsing.",
      "You can push harder… play it smart… or pretend you were never here.",
    ],
    choices: [
      {
        id: "extra_reps",
        label: "Extra reps",
        hint: "Gain Extra Swing • Take 10 damage.",
      },
      {
        id: "defensive_strategy",
        label: "Defensive Strategy",
        hint: "Lose 30 gold • Gain Dig In.",
      },
      {
        id: "skip",
        label: "Skip practice",
        hint: "Gain 50 gold • Add a Curse.",
      },
      {
        id: "leave",
        label: "Leave",
        hint: "Coach calls your name. Answer a question to slip out.",
      },
    ],
  },
  {
    id: "weight_room",
    title: "Weight Room",
    artFile: "weight_room.webp",
    intro: [
      "The weight room is louder than it should be—metal clanging in rhythms that feel almost intentional.",
      "A couple students are sparring in the corner like it’s a sanctioned sport. A punching bag swings on its own, as if it’s practicing.",
      "A rack of gear sits unattended. It would be easy to walk away… but you can almost feel the power here.",
    ],
    choices: [
      {
        id: "belt_up",
        label: "Belt Up",
        hint: "Pay 75 gold • Gain Weight Belt.",
      },
      {
        id: "sparring_partner",
        label: "Sparring Partner",
        hint: "Take 20 damage • Gain Shield Conversion.",
      },
      {
        id: "punching_bag",
        label: "Punching Bag",
        hint: "Take 20 damage • Gain Unload.",
      },
      {
        id: "leave",
        label: "Leave",
        hint: "Answer a question to leave.",
      },
    ],
  },
  {
    id: "poison_extraction",
    title: "Poison Extraction",
    artFile: "poison_extraction.webp",
    intro: [
      "A back lab door hangs slightly open. Inside, the air is thick with antiseptic and something metallic.",
      "A centrifuge spins on its own—whirring, whirring—like it’s impatient. Two vials sit in a tray: one clear, one ink-dark.",
      "A handwritten sticky note reads: **ANTIDOTE = SAFE. POISON = POWER.** The ink bleeds through the paper.",
    ],
    choices: [
      {
        id: "extract_antidote",
        label: "Extract Antidote",
        hint: "Take 12 damage • Gain Detox Extract.",
      },
      {
        id: "extract_poison",
        label: "Extract Poison",
        hint: "Gain Red Pen (event-only supply).",
      },
      {
        id: "leave",
        label: "Leave",
        hint: "The door clicks behind you. Answer a question to get out.",
      },
    ],
  },
  {
    id: "attendance_office",
    title: "Attendance Office",
    artFile: "attendance_office.webp",
    intro: [
      "The Attendance Office looks *too* clean—like a showroom pretending to be a workplace. Every paper is perfectly aligned. Every chair is perfectly centered.",
      "Behind the counter, the attendant smiles without moving their eyes. A stamp sits beside a pen that looks older than the building.",
      "A sign on the wall reads: **ABSENCES MUST BE EXPLAINED.** The letters feel like they’re watching you.",
    ],
    choices: [
      {
        id: "absence_note",
        label: "Absence Note (60g)",
        hint: "Pay 60 gold → gain Absence Note.",
      },
      {
        id: "apologize",
        label: "Apologize",
        hint: "Heal 15 HP • Lose 30 gold.",
      },
      {
        id: "forge_signature",
        label: "Forge Signature",
        hint: "Gain 100 gold • Add 2 negatives.",
      },
      {
        id: "leave",
        label: "Leave",
        hint: "The hallway feels colder. Take 5 damage.",
      },
    ],
  },

  {
    id: "pop_up_vendor",
    title: "Pop-Up Vendor",
    artFile: "pop_up_vendor.webp",
    intro: [
      "A folding table has appeared in the hallway like it was always there.",
      "A hand-written sign reads: **POP-UP VENDOR — TODAY ONLY**.",
      "Behind the table, someone in a staff hoodie watches you without blinking. The prices are… suspiciously specific.",
    ],
    choices: [
      {
        id: "browse_wares",
        label: "Browse Wares",
        hint: "Open an Event Shop: 2 supplies • 2 consumables • 4 cards (all event-only).",
      },
      {
        id: "mystery_bag",
        label: "Mystery Bag (30g)",
        hint: "Pay 30 gold → get 1 random base-game consumable (one-time).",
      },
      {
        id: "leave",
        label: "Leave",
        hint: "No question gate.",
      },
    ],
  },

  {
    id: "exam_week_ladder",
    title: "Exam Week Ladder",
    artFile: "exam_ladder.webp",
    intro: [
      "Exam week turns the whole building into a pressure cooker. Somewhere between the lockers and the classrooms, you spot a laminated chart bolted to the wall: **THE EXAM WEEK LADDER**.",
      "Five rungs. Five questions. One reward—based on how far you climb before you slip.",
      "A proctor’s voice crackles from a hidden speaker: ‘No partial credit.’",
    ],
    choices: [
      {
        id: "start",
        label: "Climb the Ladder",
        hint: "Answer up to 5 questions. One wrong ends the climb. Earn ONE reward based on your best rung.",
      },
      {
        id: "leave",
        label: "Leave",
        hint: "Back away slowly. No question gate.",
      },
    ],
  },
{
    id: "vault",
    title: "Gold Vault",
    artFile: "vault.webp",
    intro: [
      "As you wander around the school, you come across what looks like a vault door—you decide to enter.",
      "You hear an ominous voice: \"An offering, or face consequences.\"",
    ],
    choices: [
      {
        id: "offer_all_gold",
        label: "Offer all your gold",
        hint: "Lose all gold → heal 15 HP.",
      },
      {
        id: "trade_golden_pencil",
        label: "Trade the Golden Pencil",
        hint: "Lose Golden Pencil → upgrade a card.",
      },
      {
        id: "ultimate_offering",
        label: "Make the ultimate offering",
        hint: "Lose all gold + Golden Pencil → gain an event-only Ultra Rare card.",
      },
      {
        id: "leave",
        label: "Leave without offering",
        hint: "Take 15 damage.",
      },
    ],
  },
];

export function getEventById(id: string): EventDef | undefined {
  return EVENTS.find((e) => e.id === id);
}
