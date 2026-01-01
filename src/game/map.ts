// src/game/map.ts
import type { RNG } from "./rng";
import { pick } from "./rng";

export type NodeType = "START" | "FIGHT" | "CHALLENGE" | "EVENT" | "REST" | "SHOP" | "BOSS";

export type MapNode = {
  id: string;
  depth: number; // 0=start, 1..sets=content, bossDepth=boss
  type: NodeType;
  next: string[];
};

export type RunMap = {
  seed: number;
  nodes: Record<string, MapNode>;
  startId: string;
  bossId: string;
  sets: number;      // number of sets students progress through
  bossDepth: number; // sets + 1
};

const MAX_SHOPS = 2;
const MAX_RESTS = 3;
const MAX_CHALLENGES = 2;

function nid(depth: number, index: number) {
  return `d${depth}_n${index}`;
}

type MidNodeType = Exclude<NodeType, "START" | "BOSS">;

function randomNodeType(
  rng: RNG,
  depth: number,
  counts: { shops: number; rests: number; challenges: number }
): MidNodeType {
  // ✅ Rule: no REST/SHOP/CHALLENGE in depth 1 or 2
  if (depth === 1 || depth === 2) {
    return pick(rng, ["FIGHT", "FIGHT", "EVENT"] as const);
  }

  // Weighted pool; remove SHOP/REST/CHALLENGE once caps are reached
  const pool: MidNodeType[] = ["FIGHT", "FIGHT", "EVENT"];

  // Challenges are rarer and start appearing from depth 3+
  if (counts.challenges < MAX_CHALLENGES) pool.push("CHALLENGE");

  if (counts.rests < MAX_RESTS) pool.push("REST");
  if (counts.shops < MAX_SHOPS) pool.push("SHOP");

  const t = pick(rng, pool);

  // update caps tracking (NOTE: depth 10 REST is forced elsewhere and does not count)
  if (t === "REST") counts.rests++;
  if (t === "SHOP") counts.shops++;
  if (t === "CHALLENGE") counts.challenges++;

  return t;
}

function shuffle<T>(rng: RNG, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateMap(seed: number, rng: RNG): RunMap {
  const sets = 14;            // ✅ students progress through 14 nodes (14 sets) - increased from 10
  const bossDepth = sets + 1; // boss at depth 15

  const nodes: Record<string, MapNode> = {};

  // Track limited node types while creating the map
  const counts = { shops: 0, rests: 0, challenges: 0 };

  // START
  const startId = nid(0, 0);
  nodes[startId] = { id: startId, depth: 0, type: "START", next: [] };

  // Create sets 1..10 (each set 1–3 nodes)
  for (let d = 1; d <= sets; d++) {
    const count = pick(rng, [1, 2, 2, 2, 3] as const); // bias toward 2
    for (let i = 0; i < count; i++) {
      const id = nid(d, i);

      // ✅ New rule: depth 10 is ALWAYS REST sites
      // "Separate from caps" → these forced rests do NOT count toward MAX_RESTS
      const type: MidNodeType =
        d === sets ? "REST" : randomNodeType(rng, d, counts);

      nodes[id] = { id, depth: d, type, next: [] };
    }
  }

  // ✅ Guarantee: always at least one SHOP in depths 11–13.
  // If a run rolls no shop in that window, we convert a node there to SHOP.
  // If shop cap is already reached, swap an existing SHOP outside the window back to FIGHT.
  try {
    const windowDepths = new Set([11, 12, 13]);
    const allMid = Object.values(nodes).filter((n) => n.depth >= 1 && n.depth <= sets);
    const windowNodes = allMid.filter((n) => windowDepths.has(n.depth));
    const hasShopInWindow = windowNodes.some((n) => n.type === "SHOP");
    if (!hasShopInWindow && windowNodes.length > 0) {
      const existingShops = allMid.filter((n) => n.type === "SHOP");
      if (existingShops.length >= MAX_SHOPS) {
        const outside = existingShops.filter((n) => !windowDepths.has(n.depth));
        const toDemote = outside.length > 0 ? pick(rng, outside) : existingShops[0];
        if (toDemote) nodes[toDemote.id] = { ...nodes[toDemote.id], type: "FIGHT" };
      }

      const candidates = windowNodes.filter((n) => n.type !== "REST");
      const chosen = (candidates.length > 0 ? pick(rng, candidates) : windowNodes[0]) as any;
      if (chosen) nodes[chosen.id] = { ...nodes[chosen.id], type: "SHOP" };
    }
  } catch {}

  // BOSS
  const bossId = nid(bossDepth, 0);
  nodes[bossId] = { id: bossId, depth: bossDepth, type: "BOSS", next: [] };

  // Helper to get nodes by depth (stable order)
  const byDepth = (d: number) =>
    Object.values(nodes)
      .filter((n) => n.depth === d)
      .sort((a, b) => a.id.localeCompare(b.id));

  // Wire START → all nodes in set 1
  const set1 = byDepth(1);
  nodes[startId].next = set1.map((n) => n.id);

  // Wire set d → set d+1 for d = 1..9
  for (let d = 1; d < sets; d++) {
    const curr = byDepth(d);
    const next = byDepth(d + 1);

    // reset outgoing edges
    curr.forEach((n) => (n.next = []));

    // ✅ Step A: guarantee NO dead ends (every curr node gets at least 1 child)
    for (const n of curr) {
      n.next.push(pick(rng, next).id);
    }

    // ✅ Step B: guarantee NO orphans (every next node gets at least 1 parent)
    const currShuffled = shuffle(rng, curr);
    next.forEach((nextNode, idx) => {
      const parent = currShuffled[idx % currShuffled.length];
      if (!parent.next.includes(nextNode.id)) parent.next.push(nextNode.id);
    });

    // ✅ Step C: extra branching
    for (const n of curr) {
      const extra = rng() < 0.55 ? 1 : 0;
      for (let k = 0; k < extra; k++) {
        const target = pick(rng, next).id;
        if (!n.next.includes(target)) n.next.push(target);
      }
      if (rng() < 0.12) {
        const target = pick(rng, next).id;
        if (!n.next.includes(target)) n.next.push(target);
      }

      nodes[n.id] = n;
    }
  }

  // Final set → boss (converge)
  const lastSet = byDepth(sets);
  for (const n of lastSet) {
    n.next = [bossId];
    nodes[n.id] = n;
  }

  return { seed, nodes, startId, bossId, sets, bossDepth };
}
