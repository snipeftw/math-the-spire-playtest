// src/game/rng.ts
export type RNG = () => number;

// Mulberry32 seeded RNG (fast + repeatable)
export function makeRng(seed: number): RNG {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: RNG, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function pick<T>(rng: RNG, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
