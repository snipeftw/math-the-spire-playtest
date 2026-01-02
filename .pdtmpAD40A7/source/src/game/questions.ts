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
};

export type QuestionRequest = {
  rng: RNG;
  difficulty: Difficulty;
  tags?: string[]; // later: use unit tags (e.g., ["linear-relations"])
};

function qid(prefix: string, n: number) {
  return `${prefix}-${n}-${Date.now()}`;
}

// Placeholder/mock questions (unit-agnostic)
export function getQuestion(req: QuestionRequest): Question {
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
      tags: ["mock", "arithmetic"],
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
      tags: ["mock", "equations", "one-step"],
    };
  }

  if (pool === "TWO_STEP") {
    // ax + b = c (ensure divisible)
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
      tags: ["mock", "equations", "two-step"],
    };
  }

  // LINEAR_VALUE: y = mx + b, find y at x = k
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
    tags: ["mock", "linear-relations"],
  };
}
