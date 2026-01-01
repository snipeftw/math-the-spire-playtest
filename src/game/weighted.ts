// src/game/weighted.ts
import type { RNG } from "./rng";

export function weightByRarity(rarity: string | null | undefined): number {
  switch (rarity) {
    case "Common":
      return 70;
    case "Uncommon":
      return 25;
    case "Rare":
      return 5;
    case "Ultra Rare":
      return 1;
    default:
      return 30;
  }
}

export function pickWeighted<T>(rng: RNG, items: T[], getWeight: (item: T) => number): T | null {
  if (!items.length) return null;
  let total = 0;
  const weights = items.map((it) => {
    const w = Math.max(0, Number(getWeight(it) ?? 0));
    total += w;
    return w;
  });

  if (total <= 0) {
    return items[Math.floor(rng() * items.length)] ?? null;
  }

  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1] ?? null;
}

// Weighted pick WITHOUT replacement.
export function pickWeightedUnique<T>(rng: RNG, items: T[], n: number, getWeight: (item: T) => number): T[] {
  const pool = items.slice();
  const out: T[] = [];
  const take = Math.max(0, Math.min(n, pool.length));

  for (let k = 0; k < take; k++) {
    const picked = pickWeighted(rng, pool, getWeight);
    if (picked == null) break;
    out.push(picked);

    const idx = pool.indexOf(picked);
    if (idx >= 0) pool.splice(idx, 1);
    else pool.pop();
  }

  return out;
}
