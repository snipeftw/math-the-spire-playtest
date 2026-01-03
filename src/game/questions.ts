// src/game/questions.ts
import type { RNG } from "./rng";
import { pick, randInt } from "./rng";

export type Difficulty = 1 | 2 | 3;

export type Question = {
  id: string;
  prompt: string;
  // for now: numeric answers only (keeps engine simple)
  answer: number;
  hint?: string;
  difficulty: Difficulty;
  tags: string[];
  // Stable signature used to avoid repeats within a run.
  // (Attached by getQuestion; generators don't need to set it.)
  sig?: string;
};

export type QuestionPack = {
  id: string;
  label: string;
  description?: string;
};

// Packs shown on the Setup screen.
// NOTE: "legacy" represents the existing mixed question set (Units 1–7, placeholder arithmetic, etc.).
export const QUESTION_PACKS: QuestionPack[] = [
  {
    id: "u8_1",
    label: "Unit 8.1 — Mean, Median, Mode & Range",
    description: "Data management basics with small data sets.",
  },
];

export type QuestionRequest = {
  rng: RNG;
  difficulty: Difficulty;
  // Selected question packs (from Setup screen). If omitted/empty, all packs are eligible.
  packIds?: string[];
  tags?: string[]; // reserved for future fine-grain filtering
  // Previously-seen question signatures to avoid repeating within a run.
  avoidSigs?: string[];
};

// How many recent questions to remember for dedupe. (Keeping this moderate avoids
// large save payloads while still preventing “same question again” complaints.)
export const QUESTION_DEDUPE_LIMIT = 80;

function normalizePrompt(s: string): string {
  return String(s ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function hash32(str: string): number {
  // simple deterministic 32-bit hash (FNV-1a style)
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function signatureFor(packId: string, q: Question): string {
  const tags = Array.isArray(q.tags) ? q.tags.slice().sort().join(",") : "";
  const base = `${packId}|${q.difficulty}|${normalizePrompt(q.prompt)}|${Number(q.answer)}|${tags}`;
  return `q:${packId}:${hash32(base).toString(36)}`;
}

function qid(prefix: string, n: number) {
  return `${prefix}-${n}-${Date.now()}`;
}

function mean(nums: number[]): number {
  if (!nums.length) return 0;
  let s = 0;
  for (const n of nums) s += n;
  return s / nums.length;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const a = nums.slice().sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  if (a.length % 2 === 1) return a[mid];
  return (a[mid - 1] + a[mid]) / 2;
}

function modeUnique(nums: number[]): number | null {
  if (!nums.length) return null;
  const counts = new Map<number, number>();
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
  let bestVal: number | null = null;
  let bestCount = 0;
  let ties = 0;
  for (const [val, c] of counts.entries()) {
    if (c > bestCount) {
      bestCount = c;
      bestVal = val;
      ties = 0;
    } else if (c === bestCount && c > 1) {
      ties++;
    }
  }
  // No repeats → no mode
  if (bestCount <= 1) return null;
  // Multiple modes (tie) → avoid for now
  if (ties > 0) return null;
  return bestVal;
}

function range(nums: number[]): number {
  if (!nums.length) return 0;
  let lo = nums[0];
  let hi = nums[0];
  for (const n of nums) {
    if (n < lo) lo = n;
    if (n > hi) hi = n;
  }
  return hi - lo;
}

function fmtData(nums: number[]): string {
  return nums.join(", ");
}

function choicesMeanMedianModeRange(): string {
  return "Enter the number.\n1) Mean\n2) Median\n3) Mode\n4) Range";
}

function choicePrompt(stem: string): string {
  return `${stem}\n\n${choicesMeanMedianModeRange()}`;
}

function to2(n: number): number {
  // Use toFixed to match student input expectations.
  return Number(n.toFixed(2));
}

// -------------------------
// Legacy pool (existing placeholder questions)
// -------------------------
function getLegacyQuestion(req: QuestionRequest): Question {
  const { rng, difficulty } = req;

  const pool = pick(rng, ["ARITH", "ONE_STEP", "TWO_STEP", "LINEAR_VALUE"] as const);

  // scale ranges by difficulty
  const scale = difficulty === 1 ? 10 : difficulty === 2 ? 20 : 50;

  if (pool === "ARITH") {
    const a = randInt(rng, 1, scale);
    const b = randInt(rng, 1, scale);
    const op = pick(rng, ["+", "-"] as const);
    const ans = op === "+" ? a + b : a - b;
    return {
      id: qid("arith", a),
      prompt: `${a} ${op} ${b} = ?`,
      answer: ans,
      hint: "Work carefully with signs.",
      difficulty,
      tags: ["legacy", "arithmetic"],
    };
  }

  if (pool === "ONE_STEP") {
    // x + b = c
    const x = randInt(rng, -10, 10);
    const b = randInt(rng, -10, 10);
    const c = x + b;
    return {
      id: qid("oneStep", x),
      prompt: `Solve for x:  x + (${b}) = ${c}`,
      answer: x,
      hint: "Undo the +b by subtracting b from both sides.",
      difficulty,
      tags: ["legacy", "equations", "one-step"],
    };
  }

  if (pool === "TWO_STEP") {
    // ax + b = c
    const a = pick(rng, [2, 3, 4, 5, -2, -3] as const);
    const x = randInt(rng, -6, 6);
    const b = randInt(rng, -12, 12);
    const c = a * x + b;
    return {
      id: qid("twoStep", x),
      prompt: `Solve for x:  ${a}x + (${b}) = ${c}`,
      answer: x,
      hint: "Undo +b first, then divide by a.",
      difficulty,
      tags: ["legacy", "equations", "two-step"],
    };
  }

  // LINEAR_VALUE
  const m = pick(rng, [-3, -2, -1, 1, 2, 3, 4] as const);
  const b = randInt(rng, -10, 10);
  const k = randInt(rng, -5, 5);
  const y = m * k + b;
  return {
    id: qid("linear", y),
    prompt: `Given y = ${m}x + ${b}, what is y when x = ${k}?`,
    answer: y,
    hint: "Substitute x, then multiply m·x and add b.",
    difficulty,
    tags: ["legacy", "linear-relations"],
  };
}

// -------------------------
// Unit 8.1 — Mean/Median/Mode/Range
// -------------------------
function makeU81Dataset(rng: RNG, difficulty: Difficulty): number[] {
  // Keep values realistic (test scores, heights, etc.) and avoid negatives.
  const n = difficulty === 1 ? randInt(rng, 7, 9) : difficulty === 2 ? randInt(rng, 9, 11) : randInt(rng, 11, 13);
  const baseLo = difficulty === 1 ? 0 : 0;
  const baseHi = difficulty === 1 ? 30 : difficulty === 2 ? 60 : 100;
  const a: number[] = [];
  for (let i = 0; i < n; i++) {
    a.push(randInt(rng, baseLo, baseHi));
  }

  // Encourage a unique mode sometimes.
  if (pick(rng, [true, false, false] as const)) {
    const idx = randInt(rng, 0, a.length - 1);
    const v = a[idx];
    // duplicate v 1–2 times
    const dupCount = difficulty === 1 ? 1 : pick(rng, [1, 2] as const);
    for (let k = 0; k < dupCount; k++) a.push(v);
  }

  return a;
}

function getU81Question(req: QuestionRequest): Question {
  const { rng, difficulty } = req;

  const kind =
    difficulty === 1
      ? pick(rng, [
          "MEDIAN",
          "MODE",
          "RANGE",
          "MEAN",
          "WHICH_MEASURE_TYPICAL_OUTLIER",
          "WHICH_MEASURE_MOST_COMMON",
          "WHICH_MEASURE_SPREAD",
        ] as const)
      : difficulty === 2
        ? pick(rng, [
            "MEAN",
            "MEDIAN",
            "MODE",
            "RANGE",
            "WHICH_MEASURE_TYPICAL_OUTLIER",
            "WHICH_MEASURE_MOST_COMMON",
            "WHICH_MEASURE_SPREAD",
            "WHICH_MEASURE_AFFECTED_BY_OUTLIER",
          ] as const)
        : pick(rng, [
            "MEAN",
            "MEAN_NO_OUTLIER",
            "MEDIAN",
            "RANGE",
            "MODE",
            "WHICH_MEASURE_TYPICAL_OUTLIER",
            "WHICH_MEASURE_MOST_COMMON",
            "WHICH_MEASURE_SPREAD",
            "WHICH_MEASURE_AFFECTED_BY_OUTLIER",
          ] as const);

  const CONTEXTS: { label: string; lead: string }[] = [
    {
      label: "quiz scores",
      lead: "A Grade 9 class wrote a short quiz. Here are the scores (out of 100):",
    },
    {
      label: "minutes of practice",
      lead: "A team tracked how many minutes each player practiced last week:",
    },
    {
      label: "steps",
      lead: "A student tracked their steps each day for a week:",
    },
    {
      label: "library books",
      lead: "A group recorded how many books they borrowed from the library:",
    },
    {
      label: "goals",
      lead: "A hockey team recorded how many goals they scored each game:",
    },
  ];

  // Occasionally use the exact worksheet sets so it matches class materials.
  const WORKSHEET_SETS: number[][] = [
    [20, 34, 20, 5, 3, 20, 6, 10, 13, 16, 10, 20, 6],
    [10, 18, 14, 29, 0, 56, 17, 21, 24, 23, 48, 2, 13, 19, 26, 13, 15],
    [88, 56, 71, 24, 84, 65, 65, 64, 71, 90, 71, 60, 76, 9],
  ];
  const useWorksheet = pick(rng, [true, false, false, false] as const);
  const data = useWorksheet ? pick(rng, WORKSHEET_SETS).slice() : makeU81Dataset(rng, difficulty);

  const ctx = pick(rng, CONTEXTS);
  const useWordProblem = pick(rng, [true, false, false] as const);
  const promptBase = useWordProblem
    ? `${ctx.lead}\n${fmtData(data)}`
    : `Data set: ${fmtData(data)}`;

  if (kind === "MEAN") {
    const ans = to2(mean(data));
    return {
      id: qid("u8_1_mean", ans),
      prompt: `${promptBase}\n\nWhat is the mean? (Round to 2 decimals)` ,
      answer: ans,
      hint: "Add all values, then divide by how many values there are.",
      difficulty,
      tags: ["u8_1", "mean"],
    };
  }

  if (kind === "WHICH_MEASURE_TYPICAL_OUTLIER") {
    // Build a data set with a clear outlier so “typical” should be median.
    const baseCount = difficulty === 1 ? 7 : difficulty === 2 ? 8 : 9;
    const baseLo = difficulty === 1 ? 6 : 10;
    const baseHi = difficulty === 1 ? 20 : 30;
    const base: number[] = [];
    for (let i = 0; i < baseCount; i++) base.push(randInt(rng, baseLo, baseHi));
    const outlier = difficulty === 1 ? randInt(rng, 45, 65) : difficulty === 2 ? randInt(rng, 70, 95) : randInt(rng, 120, 180);
    base.push(outlier);

    const stem =
      `${ctx.lead}\n${fmtData(base)}\n\n` +
      "One value is an outlier. You want a number that represents a *typical* value.";

    return {
      id: qid("u8_1_choose_typical", outlier),
      prompt: choicePrompt(stem),
      answer: 2,
      hint: "The median is resistant to outliers, so it best represents a typical value in skewed data.",
      difficulty,
      tags: ["u8_1", "concept", "median", "outlier"],
    };
  }

  if (kind === "WHICH_MEASURE_MOST_COMMON") {
    // Ensure there is a clear repeated value.
    let d = data.slice();
    let m = modeUnique(d);
    for (let tries = 0; tries < 6 && m == null; tries++) {
      d = makeU81Dataset(rng, difficulty);
      m = modeUnique(d);
    }
    if (m == null) {
      d = d.slice();
      d.push(d[0]);
      m = d[0];
    }
    const stem =
      "A student wants to know which value occurs the most often in this data set:\n" +
      fmtData(d);
    return {
      id: qid("u8_1_choose_mode", m),
      prompt: choicePrompt(stem),
      answer: 3,
      hint: "The mode is the value that appears most often.",
      difficulty,
      tags: ["u8_1", "concept", "mode"],
    };
  }

  if (kind === "WHICH_MEASURE_SPREAD") {
    const stem =
      "A student wants to describe how spread out the values are in this data set:\n" +
      fmtData(data);
    return {
      id: qid("u8_1_choose_range", data.length),
      prompt: choicePrompt(stem),
      answer: 4,
      hint: "Range measures spread: max − min.",
      difficulty,
      tags: ["u8_1", "concept", "range"],
    };
  }

  if (kind === "WHICH_MEASURE_AFFECTED_BY_OUTLIER") {
    const stem =
      "Which measure is usually affected the MOST by an extreme outlier?";
    return {
      id: qid("u8_1_choose_outlier_effect", difficulty),
      prompt: choicePrompt(stem),
      answer: 1,
      hint: "The mean uses every value in the calculation, so outliers can change it a lot.",
      difficulty,
      tags: ["u8_1", "concept", "mean", "outlier"],
    };
  }

  if (kind === "MEAN_NO_OUTLIER") {
    // Choose a clear outlier (min or max). Prefer smallest if it's much smaller.
    const sorted = data.slice().sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const mid = sorted[Math.floor(sorted.length / 2)];
    const remove = Math.abs(mid - min) > Math.abs(max - mid) ? min : max;
    const filtered = data.filter((x) => x !== remove);
    // If removal would drop multiple duplicates, keep only one removal by removing first occurrence.
    if (filtered.length !== data.length - 1) {
      const copy = data.slice();
      const idx = copy.indexOf(remove);
      if (idx >= 0) copy.splice(idx, 1);
      filtered.splice(0, filtered.length, ...copy);
    }
    const ans = to2(mean(filtered));
    return {
      id: qid("u8_1_mean_no_outlier", ans),
      prompt: `${promptBase}\n\nRemove the outlier value ${remove}. What is the new mean? (Round to 2 decimals)`,
      answer: ans,
      hint: "Remove the outlier, then compute the mean of the remaining values.",
      difficulty,
      tags: ["u8_1", "mean", "outlier"],
    };
  }

  if (kind === "MEDIAN") {
    const ans = median(data);
    return {
      id: qid("u8_1_median", ans),
      prompt: `${promptBase}\n\nWhat is the median?`,
      answer: ans,
      hint: "Order the values; the median is the middle value (or average of the two middle values).",
      difficulty,
      tags: ["u8_1", "median"],
    };
  }

  if (kind === "MODE") {
    // Ensure we have a unique mode; if not, force one.
    let d = data.slice();
    let m = modeUnique(d);
    for (let tries = 0; tries < 6 && m == null; tries++) {
      d = makeU81Dataset(rng, difficulty);
      m = modeUnique(d);
    }
    if (m == null) {
      // last resort: force mode by duplicating first value
      d = d.slice();
      d.push(d[0]);
      m = d[0];
    }
    const modeBase = useWordProblem
      ? `${ctx.lead}\n${fmtData(d)}`
      : `Data set: ${fmtData(d)}`;
    return {
      id: qid("u8_1_mode", m),
      prompt: `${modeBase}\n\nWhat is the mode?`,
      answer: m,
      hint: "The mode is the value that appears most often.",
      difficulty,
      tags: ["u8_1", "mode"],
    };
  }

  // RANGE
  const ans = range(data);
  return {
    id: qid("u8_1_range", ans),
    prompt: `${promptBase}\n\nWhat is the range?`,
    answer: ans,
    hint: "Range = max − min.",
    difficulty,
    tags: ["u8_1", "range"],
  };
}

const PACK_GENERATORS: Record<string, (req: QuestionRequest) => Question> = {
  u8_1: getU81Question,
};

export function getQuestion(req: QuestionRequest): Question {
  const { rng } = req;

  const requested = Array.isArray(req.packIds) ? req.packIds.filter((x) => typeof x === "string") : [];
  const eligible = (requested.length ? requested : QUESTION_PACKS.map((p) => p.id)).filter((id) => !!PACK_GENERATORS[id]);
  const fallbackPackId = QUESTION_PACKS[0]?.id ?? "u8_1";
  const pools = (eligible.length ? eligible : [fallbackPackId]).filter((id) => !!PACK_GENERATORS[id]);

  const avoid = new Set(Array.isArray(req.avoidSigs) ? req.avoidSigs.map(String) : []);

  let last: Question | null = null;
  let lastPack = fallbackPackId;

  // Try a handful of rerolls to avoid repeats. If we can't, we still return a valid question.
  const maxTries = 14;
  for (let t = 0; t < maxTries; t++) {
    const packId = (pools.length ? (pick(rng, pools as string[]) as string) : fallbackPackId) || fallbackPackId;
    const gen = PACK_GENERATORS[packId] ?? PACK_GENERATORS[fallbackPackId];
    const q0 = gen(req);
    const sig = signatureFor(packId, q0);
    const q: Question = { ...q0, sig };
    last = q;
    lastPack = packId;
    if (!avoid.has(sig)) return q;
  }

  // Fall back to the last generated question even if it repeats.
  if (last) return last;
  const q0 = (PACK_GENERATORS[fallbackPackId] ?? getU81Question)(req);
  return { ...q0, sig: signatureFor(lastPack, q0) };
}
