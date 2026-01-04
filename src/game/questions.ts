// src/game/questions.ts
import type { RNG } from "./rng";
import { pick, randInt } from "./rng";

export type Difficulty = 1 | 2 | 3;

// Optional visual shown above a question prompt.
// (Rendered by UI; used for Unit 8.2 box plots.)



export type QuestionViz =
  | {
      kind: "boxplot";
      title?: string;
      // five-number summary
      min: number;
      q1: number;
      median: number;
      q3: number;
      max: number;
      // axis
      axisMin?: number;
      axisMax?: number;
      tickStep?: number;
    }
  | {
      kind: "boxplot_compare";
      title?: string;
      plots: Array<{
        label: string;
        min: number;
        q1: number;
        median: number;
        q3: number;
        max: number;
      }>;
      axisMin?: number;
      axisMax?: number;
      tickStep?: number;
    }
  | {
      kind: "image";
      title?: string;
      src: string;
      alt?: string;
      caption?: string;
      maxHeight?: number;
    }
  | {
      kind: "image_pair";
      title?: string;
      layout?: "row" | "col";
      a: { src: string; alt?: string; caption?: string };
      b: { src: string; alt?: string; caption?: string };
      maxHeight?: number;
    }
  | {
      kind: "scatter";
      title?: string;
      xLabel?: string;
      yLabel?: string;
      xMin?: number;
      xMax?: number;
      yMin?: number;
      yMax?: number;
      xTickStep?: number;
      yTickStep?: number;
      points: Array<{ x: number; y: number; label?: string }>;
      // Optional line to display (e.g., line of best fit)
      line?: { m: number; b: number; label?: string };
      // Optional vertical guide
      guideX?: number;
    };


type BoxplotBuild = {
  kind: "boxplot";
  data: number[];
  expected: { min: number; q1: number; median: number; q3: number; max: number };
  axisMin: number;
  axisMax: number;
  tickStep: number;
};

type ScatterAxis = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xTickStep: number;
  yTickStep: number;
  xLabel?: string;
  yLabel?: string;
};

type ScatterPoint = { x: number; y: number; label?: string };

type ScatterLineFitBuild = {
  kind: "scatter_linefit";
  axis: ScatterAxis;
  points: ScatterPoint[];
  expected: { m: number; b: number };
  tolerance: number; // average vertical error tolerance
};

type ScatterPredictBuild = {
  kind: "scatter_predict";
  axis: ScatterAxis;
  points: ScatterPoint[];
  line: { m: number; b: number };
  targetX: number;
  expectedY: number;
  tolerance: number;
};

export type Question = {
  id: string;
  prompt: string;
  // for now: numeric answers only (keeps engine simple)
  answer: number;
  // Optional raw dataset used to generate the question.
  // Used by UI helpers (ex: letting students drag to sort values).
  dataset?: number[];
  // Optional: special interaction mode for answering.
  // (Default/undefined = normal numeric input.)
  kind?: "boxplot_build" | "scatter_linefit" | "scatter_predict";
  // Extra data needed for special interactive questions.
  // Currently used for Unit 8.2 build-your-own box plot questions.
  build?: BoxplotBuild | ScatterLineFitBuild | ScatterPredictBuild;
  viz?: QuestionViz;
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
  {
    id: "u8_2",
    label: "Unit 8.2 — Quartiles & Box Plots",
    description: "Five-number summaries and interpreting box-and-whisker plots.",
  },
  {
    id: "u8_3",
    label: "Unit 8.3 — Misuse of Data in the Media",
    description: "Spot misleading graphs, sampling issues, and shaky conclusions.",
  },

{
  id: "u8_4",
  label: "Unit 8.4 — Scatter Plots & Lines of Best Fit",
  description: "Scatter plots, correlation, outliers, and estimating/predicting with a line of best fit.",
},

];

export type QuestionRequest = {
  rng: RNG;
  difficulty: Difficulty;
  // Selected question packs (from Setup screen). If omitted/empty, all packs are eligible.
  packIds?: string[];
  tags?: string[]; // reserved for future fine-grain filtering
  // If provided, the returned question must include ALL of these tags (best-effort; falls back if none match).
  requireTags?: string[];
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

function stableStringify(v: any): string {
  if (v == null) return "";
  if (typeof v !== "object") return String(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const keys = Object.keys(v).sort();
  const parts: string[] = [];
  for (const k of keys) parts.push(`${k}:${stableStringify((v as any)[k])}`);
  return `{${parts.join(",")}}`;
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
  const viz = q.viz ? stableStringify(q.viz) : "";
  const build = (q as any).build ? stableStringify((q as any).build) : "";
  const base = `${packId}|${q.difficulty}|${normalizePrompt(q.prompt)}|${Number(q.answer)}|${tags}|${viz}|${build}`;
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

function fiveNumberSummary(nums: number[]): { min: number; q1: number; median: number; q3: number; max: number } {
  if (!nums.length) return { min: 0, q1: 0, median: 0, q3: 0, max: 0 };
  const a = nums.slice().sort((x, y) => x - y);
  const n = a.length;
  const med = median(a);
  let lower: number[];
  let upper: number[];
  if (n % 2 === 1) {
    lower = a.slice(0, Math.floor(n / 2));
    upper = a.slice(Math.floor(n / 2) + 1);
  } else {
    lower = a.slice(0, n / 2);
    upper = a.slice(n / 2);
  }
  const q1 = lower.length ? median(lower) : a[0];
  const q3 = upper.length ? median(upper) : a[n - 1];
  return { min: a[0], q1, median: med, q3, max: a[n - 1] };
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

function u81MaxLen(difficulty: Difficulty): number {
  // Keep early fights snappy; later fights can handle slightly longer lists.
  return difficulty === 1 ? 10 : difficulty === 2 ? 13 : 16;
}

function limitLenSeeded(rng: RNG, arr: number[], maxLen: number): number[] {
  if (arr.length <= maxLen) return arr;
  const a = arr.slice();
  // Remove random elements until we hit the cap.
  while (a.length > maxLen) {
    const idx = randInt(rng, 0, a.length - 1);
    a.splice(idx, 1);
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
  const raw = useWorksheet ? pick(rng, WORKSHEET_SETS).slice() : makeU81Dataset(rng, difficulty);
  const data = limitLenSeeded(rng, raw, u81MaxLen(difficulty));

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
      dataset: data.slice(),
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
      dataset: base.slice(),
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
      d = limitLenSeeded(rng, makeU81Dataset(rng, difficulty), u81MaxLen(difficulty));
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
      dataset: d.slice(),
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
      dataset: data.slice(),
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
      dataset: data.slice(),
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
      dataset: data.slice(),
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
      d = limitLenSeeded(rng, makeU81Dataset(rng, difficulty), u81MaxLen(difficulty));
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
      dataset: d.slice(),
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
    dataset: data.slice(),
    answer: ans,
    hint: "Range = max − min.",
    difficulty,
    tags: ["u8_1", "range"],
  };
}

// -------------------------
// Unit 8.2 — Quartiles & Box Plots
// -------------------------

function u82MaxLen(difficulty: Difficulty): number {
  // Quartiles are a bit more work than mean/median; keep early runs snappy.
  return difficulty === 1 ? 11 : difficulty === 2 ? 14 : 16;
}

function makeU82Dataset(rng: RNG, difficulty: Difficulty): number[] {
  const n = difficulty === 1 ? randInt(rng, 9, 11) : difficulty === 2 ? randInt(rng, 11, 13) : randInt(rng, 13, 15);
  const hi = difficulty === 1 ? 20 : difficulty === 2 ? 40 : 80;
  const lo = 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(randInt(rng, lo, hi));
  return out;
}

function niceTickStep(minV: number, maxV: number, hasHalf: boolean): number {
  const span = Math.max(1, maxV - minV);
  if (hasHalf) return 0.5;
  if (span <= 16) return 1;
  if (span <= 40) return 2;
  if (span <= 80) return 5;
  return 10;
}

function autoAxisForBoxplot(sum: { min: number; q1: number; median: number; q3: number; max: number }): {
  axisMin: number;
  axisMax: number;
  tickStep: number;
} {
  const hasHalf = [sum.min, sum.q1, sum.median, sum.q3, sum.max].some((x) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9 && Math.abs(x - Math.round(x)) > 1e-9);
  const step = niceTickStep(sum.min, sum.max, hasHalf);
  // Add a little margin so whiskers aren't pinned to the edges.
  const pad = step * 2;
  const axisMin = Math.floor((sum.min - pad) / step) * step;
  const axisMax = Math.ceil((sum.max + pad) / step) * step;
  return { axisMin, axisMax, tickStep: step };
}

function choicePromptGeneric(stem: string, options: string[]): string {
  const lines = ["Enter the number.", ...options.map((o, i) => `${i + 1}) ${o}`)];
  return `${stem}\n\n${lines.join("\n")}`;
}

function getU82Question(req: QuestionRequest): Question {
  const { rng, difficulty } = req;

  // Some question types require specific UI support (ex: interactive box-plot building).
  // We gate these by context via request tags so they don't appear in places like
  // simple "question gates" that only support numeric input.
  const tagSet = new Set((req.tags ?? []).map((t) => String(t ?? "")));
  const isBattleContext = tagSet.has("context:battle");

  // If a debug "requireTags" filter is active, help the generator pick a matching kind.
  const requireTagSet = new Set(
    (req.requireTags ?? [])
      .map((t) => String(t ?? "").trim().toLowerCase())
      .filter(Boolean)
  );
  const forceBuildBoxplot =
    isBattleContext &&
    (requireTagSet.has("build") ||
      requireTagSet.has("build_boxplot") ||
      requireTagSet.has("boxplot_build") ||
      requireTagSet.has("buildboxplot") ||
      requireTagSet.has("build-boxplot"));

  const KINDS =
    difficulty === 1
			? ([
					// difficulty 1: introduce the five-number summary needed to CREATE a box plot
					"DATASET_MIN",
					"DATASET_MAX",
					"DATASET_MEDIAN",
					// plus a few quick reads from a box plot (change of pace)
					"READ_MEDIAN",
					"READ_MIN",
					"READ_MAX",
				] as const)
      : difficulty === 2
        ? ([
            "READ_Q1",
            "READ_Q3",
            "READ_MEDIAN",
						"DATASET_MIN",
						"DATASET_MAX",
            "DATASET_Q1",
            "DATASET_MEDIAN",
            "DATASET_Q3",
          ] as const)
        : ([
            "READ_Q1",
            "READ_Q3",
            "READ_MEDIAN",
						"DATASET_MIN",
						"DATASET_MAX",
            "DATASET_Q1",
            "DATASET_MEDIAN",
            "DATASET_Q3",
            "COMPARE_MEDIAN",
          ] as const);

  let kind = pick(rng, (KINDS as readonly string[]).slice() as any) as string;

  // Force the interactive builder when explicitly requested (battle-only).
  if (forceBuildBoxplot) kind = "BUILD_BOXPLOT";

  // Occasionally ask students to BUILD a box plot on-screen (battle only).
  if (isBattleContext && difficulty >= 2) {
    const p = difficulty === 2 ? 0.18 : 0.25;
    if (rng() < p) kind = "BUILD_BOXPLOT";
  }

  // Worksheet-aligned data and boxplots (so students see familiar-looking questions).
  // (Values match your 8.2 materials.)
  const WORKSHEET_DATASETS: number[][] = [
    // Worksheet Q3 (page 2)
    [1, 3, 3, 4, 5, 8, 8, 9, 10, 12, 15],
    [78, 66, 51, 56, 60, 70, 74, 70, 76, 59, 57, 71, 65, 76],
    [23, 21, 20, 21, 26, 25, 21, 20, 23, 24, 21, 25, 23, 21],
  ];

  const FIXED_BOXPLOTS: Array<{ title: string; sum: { min: number; q1: number; median: number; q3: number; max: number }; axisMin: number; axisMax: number; tickStep: number }> = [
    // Worksheet Q1: Box-whisker plot 1 (min 2, Q1 3.5, median 5, Q3 7, max 9)
    { title: "Boxplot 1", sum: { min: 2, q1: 3.5, median: 5, q3: 7, max: 9 }, axisMin: 0, axisMax: 10, tickStep: 0.5 },
    // Worksheet Q1: Box-whisker plot 2 (min 17, Q1 21, median 22.5, Q3 24, max 29)
    { title: "Boxplot 2", sum: { min: 17, q1: 21, median: 22.5, q3: 24, max: 29 }, axisMin: 15, axisMax: 30, tickStep: 0.5 },
    // Worksheet Q2: Given five main points 1,3,6,7,13
    { title: "Boxplot", sum: { min: 1, q1: 3, median: 6, q3: 7, max: 13 }, axisMin: 0, axisMax: 16, tickStep: 1 },
    // Worksheet Q2: Given five main points 54,56,60,74,77
    { title: "Boxplot", sum: { min: 54, q1: 56, median: 60, q3: 74, max: 77 }, axisMin: 50, axisMax: 80, tickStep: 1 },
  ];

  // Word problem contexts (change of pace)
  const CONTEXTS: { label: string; lead: string; unit?: string }[] = [
    { label: "quiz", lead: "A class wrote a quiz (scores out of 20):", unit: "out of 20" },
    { label: "steps", lead: "A student recorded their steps each day:", unit: "steps" },
    { label: "shots", lead: "A hockey team recorded how many shots they got each game:", unit: "shots" },
    { label: "practice", lead: "Players recorded minutes of practice:", unit: "minutes" },
  ];

  const useWorksheet = pick(rng, [true, false, false, false] as const);
  const raw = useWorksheet ? pick(rng, WORKSHEET_DATASETS).slice() : makeU82Dataset(rng, difficulty);
  const data = limitLenSeeded(rng, raw, u82MaxLen(difficulty));
  const ctx = pick(rng, CONTEXTS);
  const useWordProblem = pick(rng, [true, false, false] as const);
  const dataPrompt = useWordProblem ? `${ctx.lead}\n${fmtData(data)}` : `Data set: ${fmtData(data)}`;

  // For visual questions, either use a fixed worksheet plot (diff 1/2 sometimes) or a generated plot.
  const useFixedPlot = pick(rng, [true, false, false] as const);
  const fixed = useFixedPlot ? pick(rng, FIXED_BOXPLOTS) : null;
  const sum = fixed ? fixed.sum : fiveNumberSummary(data);
  const axis = fixed ? { axisMin: fixed.axisMin, axisMax: fixed.axisMax, tickStep: fixed.tickStep } : autoAxisForBoxplot(sum);
  const viz: QuestionViz = {
    kind: "boxplot",
    title: fixed ? fixed.title : undefined,
    min: sum.min,
    q1: sum.q1,
    median: sum.median,
    q3: sum.q3,
    max: sum.max,
    ...axis,
  };

  if (kind === "READ_MIN") {
    return {
      id: qid("u8_2_read_min", Number(sum.min)),
      prompt: "Look at the box plot. What is the minimum value?",
      viz,
      answer: sum.min,
      hint: "The minimum is the left whisker end.",
      difficulty,
      tags: ["u8_2", "boxplot", "minimum"],
    };
  }

  if (kind === "READ_MAX") {
    return {
      id: qid("u8_2_read_max", Number(sum.max)),
      prompt: "Look at the box plot. What is the maximum value?",
      viz,
      answer: sum.max,
      hint: "The maximum is the right whisker end.",
      difficulty,
      tags: ["u8_2", "boxplot", "maximum"],
    };
  }

  if (kind === "READ_MEDIAN") {
    return {
      id: qid("u8_2_read_median", Number(sum.median)),
      prompt: "Look at the box plot. What is the median?",
      viz,
      answer: sum.median,
      hint: "The median is the vertical line inside the box (Q2).",
      difficulty,
      tags: ["u8_2", "boxplot", "median"],
    };
  }

  if (kind === "READ_Q1") {
    return {
      id: qid("u8_2_read_q1", Number(sum.q1)),
      prompt: "Look at the box plot. What is Quartile 1 (Q1)?",
      viz,
      answer: sum.q1,
      hint: "Q1 is the left edge of the box.",
      difficulty,
      tags: ["u8_2", "boxplot", "q1"],
    };
  }

  if (kind === "READ_Q3") {
    return {
      id: qid("u8_2_read_q3", Number(sum.q3)),
      prompt: "Look at the box plot. What is Quartile 3 (Q3)?",
      viz,
      answer: sum.q3,
      hint: "Q3 is the right edge of the box.",
      difficulty,
      tags: ["u8_2", "boxplot", "q3"],
    };
  }

	if (kind === "DATASET_MIN") {
		const s = fiveNumberSummary(data);
		return {
			id: qid("u8_2_dataset_min", Number(s.min)),
			dataset: data.slice(),
			prompt: `${dataPrompt}\n\nTo create a box plot, you need the five-number summary. What is the minimum value?`,
			answer: s.min,
			hint: "Sort the data. The minimum is the smallest value.",
			difficulty,
			tags: ["u8_2", "create_boxplot", "minimum"],
		};
	}

	if (kind === "DATASET_MAX") {
		const s = fiveNumberSummary(data);
		return {
			id: qid("u8_2_dataset_max", Number(s.max)),
			dataset: data.slice(),
			prompt: `${dataPrompt}\n\nTo create a box plot, you need the five-number summary. What is the maximum value?`,
			answer: s.max,
			hint: "Sort the data. The maximum is the largest value.",
			difficulty,
			tags: ["u8_2", "create_boxplot", "maximum"],
		};
	}

  if (kind === "DATASET_MEDIAN") {
    const s = fiveNumberSummary(data);
    return {
      id: qid("u8_2_dataset_median", Number(s.median)),
		dataset: data.slice(),
			prompt: `${dataPrompt}\n\nTo create a box plot, you need the five-number summary. What is the median (Q2)?`,
      answer: s.median,
      hint: "Sort the data. The median is the middle value (or average of the two middle values).",
      difficulty,
			tags: ["u8_2", "create_boxplot", "median"],
    };
  }

  if (kind === "DATASET_Q1") {
    const s = fiveNumberSummary(data);
    return {
      id: qid("u8_2_dataset_q1", Number(s.q1)),
		dataset: data.slice(),
			prompt: `${dataPrompt}\n\nTo create a box plot, you need the five-number summary. Find Quartile 1 (Q1).`,
      answer: s.q1,
      hint: "Sort the data. Split it into lower/upper halves (exclude the median if there is one), then take the median of the LOWER half.",
      difficulty,
			tags: ["u8_2", "create_boxplot", "q1"],
    };
  }

  if (kind === "DATASET_Q3") {
    const s = fiveNumberSummary(data);
    return {
      id: qid("u8_2_dataset_q3", Number(s.q3)),
		dataset: data.slice(),
			prompt: `${dataPrompt}\n\nTo create a box plot, you need the five-number summary. Find Quartile 3 (Q3).`,
      answer: s.q3,
      hint: "Sort the data. Split it into lower/upper halves (exclude the median if there is one), then take the median of the UPPER half.",
      difficulty,
			tags: ["u8_2", "create_boxplot", "q3"],
    };
  }

  // BUILD_BOXPLOT (interactive)
  if (kind === "BUILD_BOXPLOT") {
    const s = fiveNumberSummary(data);
    const axis = autoAxisForBoxplot(s);
    return {
      id: qid("u8_2_build_boxplot", hash32(`${fmtData(data)}|${s.min}|${s.q1}|${s.median}|${s.q3}|${s.max}`)),
      prompt: `${dataPrompt}\n\nCreate a box plot for this data set.`,
      // Answer is validated via the interactive build payload.
      answer: 0,
      kind: "boxplot_build",
      build: {
        kind: "boxplot",
        data: data.slice(),
        expected: { ...s },
        axisMin: axis.axisMin,
        axisMax: axis.axisMax,
        tickStep: axis.tickStep,
      },
      hint: "Build the five-number summary: min, Q1, median (Q2), Q3, max.",
      difficulty,
      tags: ["u8_2", "create_boxplot", "build"],
    };
  }

  // COMPARE_MEDIAN
  // Use the worksheet handout-style quiz comparison sometimes.
  const CLASS_A = [16, 8, 12, 13, 19, 15, 20, 17, 11, 18, 12];
  const CLASS_B = [20, 15, 16, 19, 2, 8, 13, 16, 18, 3, 17, 5, 19, 20];
  const useHandout = pick(rng, [true, false, false] as const);
  const aData = useHandout ? CLASS_A : limitLenSeeded(rng, makeU82Dataset(rng, difficulty), u82MaxLen(difficulty));
  const bData = useHandout ? CLASS_B : limitLenSeeded(rng, makeU82Dataset(rng, difficulty), u82MaxLen(difficulty));
  const aSum = fiveNumberSummary(aData);
  const bSum = fiveNumberSummary(bData);
  const axis2 = autoAxisForBoxplot({
    min: Math.min(aSum.min, bSum.min),
    q1: Math.min(aSum.q1, bSum.q1),
    median: Math.min(aSum.median, bSum.median),
    q3: Math.max(aSum.q3, bSum.q3),
    max: Math.max(aSum.max, bSum.max),
  });
  const viz2: QuestionViz = {
    kind: "boxplot_compare",
    title: "Compare", 
    axisMin: axis2.axisMin,
    axisMax: axis2.axisMax,
    tickStep: axis2.tickStep,
    plots: [
      { label: "Class A", ...aSum },
      { label: "Class B", ...bSum },
    ],
  };
  const ans = aSum.median === bSum.median ? 3 : aSum.median > bSum.median ? 1 : 2;
  return {
    id: qid("u8_2_compare_median", ans),
    prompt: choicePromptGeneric(
      "Two groups wrote the same quiz. Use the box plots to decide: Which group has the higher median?",
      ["Class A", "Class B", "Same median", "Can't tell"],
    ),
    viz: viz2,
    answer: ans,
    hint: "Compare the median lines (the vertical line inside each box).",
    difficulty,
    tags: ["u8_2", "boxplot", "compare", "median"],
  };
}


function getU83Question(req: QuestionRequest): Question {
  const { rng, difficulty } = req;

  const kind =
    difficulty === 1
      ? pick(rng, [
          "TRUNCATED_AXIS",
          "PICTOGRAPH_EXAGGERATION",
          "PERCENT_NO_BASE",
          "TWO_POINTS",
          "RAW_COUNTS_VS_RATES",
        ] as const)
      : difficulty === 2
        ? pick(rng, [
            "TRUNCATED_AXIS",
            "PICTOGRAPH_EXAGGERATION",
            "PERCENT_NO_BASE",
            "TWO_POINTS",
            "RAW_COUNTS_VS_RATES",
            "CORRELATION_CAUSATION",
            "SURVEY_CLAIM",
          ] as const)
        : pick(rng, [
            "TRUNCATED_AXIS",
            "PICTOGRAPH_EXAGGERATION",
            "PERCENT_NO_BASE",
            "TWO_POINTS",
            "RAW_COUNTS_VS_RATES",
            "CORRELATION_CAUSATION",
            "SURVEY_CLAIM",
            "BASE_RATE_TRAP",
            "MISSING_CONTEXT",
          ] as const);

  const mc = (
    stem: string,
    options: [string, string, string, string],
    correct: 1 | 2 | 3 | 4,
    hint: string,
    tags: string[],
    viz?: QuestionViz
  ): Question => {
    return {
      id: qid("u8_3", correct),
      prompt: choicePromptGeneric(stem, options),
      viz,
      answer: correct,
      hint,
      difficulty,
      tags: ["u8_3", ...tags],
    };
  };

  if (kind === "TRUNCATED_AXIS") {
    return mc(
      "Look at the graph above (same data, different y-axes). What is the main problem with the misleading version?",
      [
        "The y-axis is truncated, making a small change look dramatic",
        "The graph should always be a pie chart instead of a line graph",
        "Percentages can never be graphed",
        "The x-axis should be removed",
      ],
      1,
      "Check whether the vertical axis starts at 0 and whether the scale exaggerates differences.",
      ["misleading_graph", "axis", "truncate"],
      { kind: "image", title: "Graph", src: "/questions/u8_3/slide02_img01.png", alt: "Same data with different y-axes" }
    );
  }

  if (kind === "PICTOGRAPH_EXAGGERATION") {
    return mc(
      "Look at the pictograph above. How is it misleading?",
      [
        "The pictures are scaled in a way that exaggerates the size of the change",
        "Percentages cannot be compared across years",
        "The data must be fake because it uses pictures",
        "A line graph is illegal for percentages",
      ],
      1,
      "When images change in height/area/volume, the visual change can be much bigger than the real change.",
      ["misleading_graph", "pictograph", "exaggeration"],
      { kind: "image", title: "Infographic", src: "/questions/u8_3/slide06_img04.png", alt: "Graduation rate pictograph" }
    );
  }

  if (kind === "PERCENT_NO_BASE") {
    const a = randInt(rng, 1, 10);
    const b = a + randInt(rng, 1, 10);
    const pct = Math.round(((b - a) / a) * 100);
    return mc(
      `A headline says: “Club membership increased by ${pct}%!”\nThe club went from ${a} members to ${b} members.\n\nWhat’s the best interpretation?`,
      [
        "The percent is correct, but without the starting number it can sound more impressive than it is",
        "Any percent increase over 50% means the club is huge",
        "Percent increases are always dishonest",
        "This proves the club is the biggest in the school",
      ],
      1,
      "Percent change needs the starting amount to understand the real impact.",
      ["percent", "base_value", "context"]
    );
  }

  if (kind === "TWO_POINTS") {
    return mc(
      "Look at the graph above and the caption. What is the biggest issue with the conclusion?",
      [
        "Two data points aren’t enough to confidently claim a trend or cause",
        "The numbers are too round to be real",
        "Deaths can’t be compared year to year",
        "A bar graph should always start at 100",
      ],
      1,
      "With only two points, you can’t tell if it’s normal variation or caused by something else.",
      ["sample_size", "two_points", "trend"],
      { kind: "image", title: "Graph", src: "/questions/u8_3/slide15_img13.png", alt: "Traffic deaths shown with two points" }
    );
  }

  if (kind === "RAW_COUNTS_VS_RATES") {
    return mc(
      "Look at the chart above. Someone concludes: “20–24 year olds are the worst drivers.” What key information is missing?",
      [
        "How many people are in each age group / how much they drive (a rate, not just counts)",
        "The colour used for each bar",
        "Whether the chart was made in PowerPoint",
        "The brand of the cars",
      ],
      1,
      "Counts alone can be misleading if groups differ in size or exposure (e.g., miles driven).",
      ["denominator", "rates", "per_capita"],
      { kind: "image", title: "Chart", src: "/questions/u8_3/slide10_img08.png", alt: "Fatal crashes by age group (counts)" }
    );
  }

  if (kind === "CORRELATION_CAUSATION") {
    return mc(
      "A graph shows that when ice cream sales go up, drownings also go up.\n\nWhat is the best conclusion?",
      [
        "Ice cream causes drownings",
        "Drownings cause ice cream sales",
        "They may be correlated, but another factor (like hot weather) could explain both",
        "The graph proves there is no relationship",
      ],
      3,
      "Correlation doesn’t prove causation; look for a plausible third variable.",
      ["correlation", "causation", "confounding"]
    );
  }

  if (kind === "SURVEY_CLAIM") {
    return mc(
      "Look at the ad above. Which question would best test whether this claim is trustworthy?",
      [
        "How many dentists were surveyed and how were they chosen?",
        "What colour is the toothpaste?",
        "How long is the TV commercial?",
        "Is Brand X sold in stores?",
      ],
      1,
      "Sampling matters: who was asked, how many, and whether the survey was biased.",
      ["survey", "sampling", "bias"],
      { kind: "image", title: "Ad", src: "/questions/u8_3/slide12_img10.png", alt: "9 out of 10 dentists ad" }
    );
  }

  if (kind === "BASE_RATE_TRAP") {
    return mc(
      "Look at the pie chart above. Someone concludes: “Drunk driving isn’t a big issue.” What’s wrong with this reasoning?",
      [
        "It ignores how many drunk vs sober drivers are on the road (base rates)",
        "Pie charts cannot show injury data",
        "75% means the data is made up",
        "If it’s not 100% then it doesn’t matter",
      ],
      1,
      "You need rates (risk per driver/mile), not just the share of injuries.",
      ["base_rate", "denominator", "risk"],
      { kind: "image", title: "Pie chart", src: "/questions/u8_3/slide09_img07.png", alt: "NYC crash injuries DUI pie chart" }
    );
  }

  // MISSING_CONTEXT
  return mc(
    "A graph shows gas prices rising sharply over 2 months. The y-axis starts at $2.90 and ends at $3.60.\n\nWhat additional information would help judge the claim “prices are skyrocketing”?",
    [
      "A y-axis that starts at 0 or a longer time range for comparison",
      "A different font",
      "A bigger title",
      "More decimals on the labels",
    ],
    1,
    "Context matters: scale and time window can change the impression a lot.",
    ["context", "scale", "cherry_pick"],
    { kind: "image", title: "Graph", src: "/questions/u8_3/slide08_img06.png", alt: "Gas prices over 2 months with truncated y-axis" }
  );
}


function linReg(points: { x: number; y: number }[]): { m: number; b: number } {
  const n = points.length;
  if (!n) return { m: 0, b: 0 };
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
    sxx += p.x * p.x;
    sxy += p.x * p.y;
  }
  const xBar = sx / n;
  const yBar = sy / n;
  const denom = sxx - n * xBar * xBar;
  if (Math.abs(denom) < 1e-9) return { m: 0, b: yBar };
  const m = (sxy - n * xBar * yBar) / denom;
  const b = yBar - m * xBar;
  return { m, b };
}

function autoAxisForScatter(points: { x: number; y: number }[]): ScatterAxis {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padX = Math.max(1, Math.round((maxX - minX) * 0.12));
  const padY = Math.max(1, Math.round((maxY - minY) * 0.12));
  let xMin = Math.floor(minX - padX);
  let xMax = Math.ceil(maxX + padX);
  let yMin = Math.floor(minY - padY);
  let yMax = Math.ceil(maxY + padY);
  if (xMin === xMax) {
    xMin -= 1;
    xMax += 1;
  }
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const spanX = Math.max(1, xMax - xMin);
  const spanY = Math.max(1, yMax - yMin);
  const xTickStep = spanX <= 12 ? 1 : spanX <= 24 ? 2 : 5;
  const yTickStep = spanY <= 12 ? 1 : spanY <= 24 ? 2 : 5;
  // snap mins to tick
  xMin = Math.floor(xMin / xTickStep) * xTickStep;
  xMax = Math.ceil(xMax / xTickStep) * xTickStep;
  yMin = Math.floor(yMin / yTickStep) * yTickStep;
  yMax = Math.ceil(yMax / yTickStep) * yTickStep;
  return { xMin, xMax, yMin, yMax, xTickStep, yTickStep };
}

function recomputeScatterTicks(axis: ScatterAxis): ScatterAxis {
  let { xMin, xMax, yMin, yMax } = axis;
  if (xMin === xMax) {
    xMin -= 1;
    xMax += 1;
  }
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const spanX = Math.max(1, xMax - xMin);
  const spanY = Math.max(1, yMax - yMin);
  const xTickStep = spanX <= 12 ? 1 : spanX <= 24 ? 2 : 5;
  const yTickStep = spanY <= 12 ? 1 : spanY <= 24 ? 2 : 5;
  xMin = Math.floor(xMin / xTickStep) * xTickStep;
  xMax = Math.ceil(xMax / xTickStep) * xTickStep;
  yMin = Math.floor(yMin / yTickStep) * yTickStep;
  yMax = Math.ceil(yMax / yTickStep) * yTickStep;
  return { ...axis, xMin, xMax, yMin, yMax, xTickStep, yTickStep };
}

function expandScatterAxis(axis: ScatterAxis, opts: { includeX?: number; includeY?: number; includeY0?: boolean }): ScatterAxis {
  let { xMin, xMax, yMin, yMax } = axis;
  if (Number.isFinite(opts.includeX as any)) {
    const x = Number(opts.includeX);
    xMin = Math.min(xMin, x);
    xMax = Math.max(xMax, x);
  }
  if (Number.isFinite(opts.includeY as any)) {
    const y = Number(opts.includeY);
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  }
  if (opts.includeY0) {
    yMin = Math.min(yMin, 0);
    yMax = Math.max(yMax, 0);
  }
  return recomputeScatterTicks({ ...axis, xMin, xMax, yMin, yMax });
}

function letterToNumber(letter: string): number {
  const c = String(letter ?? "").trim().toUpperCase();
  if (!c) return NaN;
  const code = c.charCodeAt(0);
  if (code < 65 || code > 90) return NaN;
  return code - 64;
}

function numberToLetter(n: number): string {
  const nn = Math.round(Number(n));
  if (!Number.isFinite(nn) || nn < 1 || nn > 26) return "";
  return String.fromCharCode(64 + nn);
}

function makeScatterPointsFromLine(opts: {
  rng: RNG;
  m: number;
  b: number;
  xStart: number;
  xEnd: number;
  n: number;
  noise: number;
  labelPoints?: boolean;
}): ScatterPoint[] {
  const { rng, m, b, xStart, xEnd, n, noise, labelPoints } = opts;
  const out: ScatterPoint[] = [];
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let i = 0; i < n; i++) {
    const x = xStart + Math.round((i * (xEnd - xStart)) / Math.max(1, n - 1));
    const eps = randInt(rng, -noise, noise);
    const y = Math.round(m * x + b + eps);
    out.push({ x, y, label: labelPoints ? letters[i] : undefined });
  }
  return out;
}

function makeScatterPointsOnXs(opts: {
  rng: RNG;
  m: number;
  b: number;
  xs: number[];
  noise: number;
  labelPoints?: boolean;
}): ScatterPoint[] {
  const { rng, m, b, xs, noise, labelPoints } = opts;
  const out: ScatterPoint[] = [];
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const eps = randInt(rng, -noise, noise);
    const y = Math.round(m * x + b + eps);
    out.push({ x, y, label: labelPoints ? letters[i] : undefined });
  }
  return out;
}

function makeCloudPoints(opts: { rng: RNG; xMin: number; xMax: number; yMin: number; yMax: number; n: number }): ScatterPoint[] {
  const { rng, xMin, xMax, yMin, yMax, n } = opts;
  const out: ScatterPoint[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: randInt(rng, xMin, xMax), y: randInt(rng, yMin, yMax) });
  }
  return out;
}

function getU84Question(req: QuestionRequest): Question {
  const { rng, difficulty } = req;

  const tagSet = new Set((req.tags ?? []).map((t) => String(t ?? "")));
  const isBattleContext = tagSet.has("context:battle");

  const requireTagSet = new Set(
    (req.requireTags ?? [])
      .map((t) => String(t ?? "").trim().toLowerCase())
      .filter(Boolean)
  );

  const forceLineFit = isBattleContext && (requireTagSet.has("linefit") || requireTagSet.has("line_fit") || requireTagSet.has("scatter_linefit"));
  const forcePredict = isBattleContext && (requireTagSet.has("predict") || requireTagSet.has("scatter_predict"));
  const forceRead = requireTagSet.has("read") || requireTagSet.has("correlation") || requireTagSet.has("outlier") || requireTagSet.has("interp") || requireTagSet.has("extrap") || requireTagSet.has("interp_extrap");

  const KINDS =
    difficulty === 1
      ? (["CORR_TYPE", "OUTLIER", "INTERP_EXTRAP"] as const)
      : difficulty === 2
        ? (["CORR_TYPE", "OUTLIER", "INTERP_EXTRAP", "PREDICT", "LINE_FIT"] as const)
        : (["CORR_TYPE", "OUTLIER", "INTERP_EXTRAP", "PREDICT", "LINE_FIT"] as const);

  let kind = pick(rng, (KINDS as readonly string[]).slice() as any) as string;
  if (forceLineFit) kind = "LINE_FIT";
  else if (forcePredict) kind = "PREDICT";
  else if (forceRead) {
    // keep chosen kind if it is a read type; otherwise bias to a read type
    if (!["CORR_TYPE", "OUTLIER", "INTERP_EXTRAP"].includes(kind)) kind = pick(rng, ["CORR_TYPE", "OUTLIER", "INTERP_EXTRAP"] as any) as any;
  }

  // IMPORTANT: interactive scatter questions are battle-only. In non-battle contexts, fall back to read questions.
  if (!isBattleContext && (kind === "PREDICT" || kind === "LINE_FIT")) {
    kind = pick(rng, ["CORR_TYPE", "OUTLIER", "INTERP_EXTRAP"] as any) as any;
  }

  // Build a few stable scenarios.
  const POS = { m: 2, b: 1 };
  const NEG = { m: -1, b: 14 };

  const mkPositive = (labelPoints = false) => makeScatterPointsFromLine({ rng, ...POS, xStart: 1, xEnd: 8, n: 8, noise: 1, labelPoints });
  const mkNegative = (labelPoints = false) => makeScatterPointsFromLine({ rng, ...NEG, xStart: 1, xEnd: 8, n: 8, noise: 1, labelPoints });
  const mkNone = () => makeCloudPoints({ rng, xMin: 1, xMax: 8, yMin: 4, yMax: 16, n: 10 });

  if (kind === "CORR_TYPE") {
    const which = pick(rng, ["pos", "neg", "none"] as const);
    const points = which === "pos" ? mkPositive(false) : which === "neg" ? mkNegative(false) : mkNone();
    const axis = autoAxisForScatter(points);
    const options = ["Positive correlation", "Negative correlation", "No correlation"]; // 1..3
    const answer = which === "pos" ? 1 : which === "neg" ? 2 : 3;
    return {
      id: qid("u84", randInt(rng, 1000, 9999)),
      prompt: choicePromptGeneric("Look at the scatter plot. What type of correlation does it show?", options),
      answer,
      difficulty,
      tags: ["u8_4", "scatter", "read", "correlation"],
      viz: {
        kind: "scatter",
        title: "Scatter plot",
        xLabel: "x",
        yLabel: "y",
        ...axis,
        points,
      } as any,
      hint: "Positive: goes up as x increases. Negative: goes down. None: no clear trend.",
    };
  }

  if (kind === "OUTLIER") {
    const base = mkPositive(true);
    // pick a label to become the outlier
    const outIdx = randInt(rng, 2, Math.min(6, base.length - 2));
    const outLabel = String(base[outIdx].label ?? "C").toUpperCase();
    const points = base.map((p, i) => (i === outIdx ? { ...p, y: p.y + randInt(rng, 6, 9) } : p));
    const axis = autoAxisForScatter(points);
    const answer = letterToNumber(outLabel);

    return {
      id: qid("u84", randInt(rng, 1000, 9999)),
      prompt: `One point doesn’t match the overall pattern. Type the LETTER of the outlier (A, B, C...).`,
      answer: Number.isFinite(answer) ? answer : 1,
      difficulty,
      tags: ["u8_4", "scatter", "read", "outlier", "answer:letter"],
      viz: {
        kind: "scatter",
        title: "Scatter plot (labelled points)",
        xLabel: "x",
        yLabel: "y",
        ...axis,
        points,
      } as any,
      hint: "An outlier is far from the main cluster/trend.",
    };
  }

  if (kind === "INTERP_EXTRAP") {
    const points = mkNegative(false);
    const fit = linReg(points);
    const line = { m: fit.m, b: fit.b };

    const xs = points.map((p) => p.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);

    const xIn = randInt(rng, Math.min(minX + 1, maxX - 1), Math.max(minX + 1, maxX - 1));
    const xOut = maxX + randInt(rng, 2, 5);
    const useOut = rng() < 0.5;
    const x = useOut ? xOut : xIn;

    let axis = autoAxisForScatter(points);
    // Ensure the guide line is actually visible even when x is outside the original data range.
    axis = expandScatterAxis(axis, { includeX: x });

    const options = [
      "Interpolation (inside the data range)",
      "Extrapolation (outside the data range)",
    ];
    const answer = useOut ? 2 : 1;

    return {
      id: qid("u84", randInt(rng, 1000, 9999)),
      prompt: choicePromptGeneric(`Using the line of best fit, estimating the value at x = ${x} is…`, options),
      answer,
      difficulty,
      tags: ["u8_4", "scatter", "read", "interp_extrap", useOut ? "extrap" : "interp"],
      viz: {
        kind: "scatter",
        title: "Scatter plot + line of best fit",
        xLabel: "x",
        yLabel: "y",
        ...axis,
        points,
        line,
        guideX: x,
      } as any,
      hint: "Interpolation is within the x-values you already have; extrapolation is beyond them.",
    };
  }

  // Interactive PREDICT: drag a point on a vertical guide line (battle-only preferred).
  if (kind === "PREDICT") {
    // Vary the underlying trend so it doesn't always feel the same.
    const scenarios = [
      { m: 2, b: 1 },
      { m: 1, b: 3 },
      { m: -1, b: 16 },
      { m: -2, b: 22 },
    ];
    const sc = pick(rng, scenarios as any) as { m: number; b: number };

    const targetX = randInt(rng, 2, 8);
    // Generate points on integer x-values, but ensure there is NO data point at targetX.
    const xs: number[] = [];
    for (let x = 1; x <= 9; x++) {
      if (x !== targetX) xs.push(x);
    }

    const noise = difficulty >= 3 ? 2 : 1;
    const points = makeScatterPointsOnXs({ rng, m: sc.m, b: sc.b, xs, noise });

    // Use a regression line so the displayed line matches the data.
    const fit = linReg(points);
    const expectedY = fit.m * targetX + fit.b;

    // Ensure axis includes targetX (for the vertical guide) and y=0 (so the draggable starts at 0).
    let axis = autoAxisForScatter(points.concat([{ x: targetX, y: expectedY }]));
    axis = expandScatterAxis(axis, { includeX: targetX, includeY0: true });

    const tol = 1; // user-set tolerance
    return {
      id: qid("u84", randInt(rng, 1000, 9999)),
      prompt: `Drag the dot to your best estimate on the line of best fit at x = ${targetX}.`,
      answer: 1,
      difficulty,
      tags: ["u8_4", "scatter", "predict"],
      kind: "scatter_predict",
      build: {
        kind: "scatter_predict",
        axis: { ...axis, xLabel: "x", yLabel: "y" },
        points,
        line: fit,
        targetX,
        expectedY,
        tolerance: tol,
      },
      hint: "The line of best fit should go through the middle of the points.",
    };
  }

  // Interactive LINE_FIT: drag a line to best fit (battle-only preferred).
  {
    // More variety: different slope directions and steepness.
    const scenarios = [
      { m: 2, b: 1 },
      { m: 1, b: 4 },
      { m: -1, b: 16 },
      { m: -2, b: 22 },
      { m: 0.5, b: 6 },
      { m: -0.5, b: 14 },
    ];
    const sc = pick(rng, scenarios as any) as { m: number; b: number };

    const noise = difficulty >= 3 ? 2 : 1;
    const points = makeScatterPointsFromLine({ rng, m: sc.m, b: sc.b, xStart: 1, xEnd: 9, n: 8, noise });
    const axis = autoAxisForScatter(points);
    const fit = linReg(points);
    const tol = 1; // average vertical error tolerance

    return {
      id: qid("u84", randInt(rng, 1000, 9999)),
      prompt: "Drag the line so it best fits the data.",
      answer: 1,
      difficulty,
      tags: ["u8_4", "scatter", "linefit"],
      kind: "scatter_linefit",
      build: {
        kind: "scatter_linefit",
        axis: { ...axis, xLabel: "x", yLabel: "y" },
        points,
        expected: fit,
        tolerance: tol,
      },
      hint: "Try to balance points above and below the line.",
    };
  }
}


const PACK_GENERATORS: Record<string, (req: QuestionRequest) => Question> = {
  u8_1: getU81Question,
  u8_2: getU82Question,
  u8_3: getU83Question,
  u8_4: getU84Question,

};

export function getQuestion(req: QuestionRequest): Question {
  const { rng } = req;

  const requested = Array.isArray(req.packIds) ? req.packIds.filter((x) => typeof x === "string") : [];
  const eligible = (requested.length ? requested : QUESTION_PACKS.map((p) => p.id)).filter((id) => !!PACK_GENERATORS[id]);
  const fallbackPackId = QUESTION_PACKS[0]?.id ?? "u8_1";
  const pools = (eligible.length ? eligible : [fallbackPackId]).filter((id) => !!PACK_GENERATORS[id]);

  const avoid = new Set(Array.isArray(req.avoidSigs) ? req.avoidSigs.map(String) : []);
  const requireTags = new Set(
    Array.isArray(req.requireTags)
      ? req.requireTags.map((t) => String(t ?? "").trim().toLowerCase()).filter(Boolean)
      : []
  );

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
    if (avoid.has(sig)) continue;

    // If required tags were provided, ensure the generated question includes all of them.
    if (requireTags.size) {
      const qTags = new Set(Array.isArray((q0 as any)?.tags) ? (q0 as any).tags.map((x: any) => String(x ?? "").trim().toLowerCase()) : []);
      let ok = true;
      for (const rt of requireTags) {
        if (!qTags.has(rt)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
    }

    return q;
  }

  // Fall back to the last generated question even if it repeats.
  if (last) return last;
  const q0 = (PACK_GENERATORS[fallbackPackId] ?? getU81Question)(req);
  return { ...q0, sig: signatureFor(lastPack, q0) };
}
