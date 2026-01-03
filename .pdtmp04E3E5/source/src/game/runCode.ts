// src/game/runCode.ts
// Manual cross-device "resume code" system.
// Encodes a portable snapshot of the current GameState into a copy/paste string.

import type { GameState, Screen } from "./state";
import { initialState } from "./state";

const PREFIX = "MTS1:"; // Math The Spire v1

function fnv1a32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function b64UrlEncodeUtf8(str: string): string {
  // NOTE: btoa/atob expect latin1; this wrapper ensures UTF-8 safety.
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64UrlDecodeUtf8(b64url: string): string {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return decodeURIComponent(escape(atob(b64)));
}

function isValidScreen(x: any): x is Screen {
  return (
    x === "TITLE" ||
    x === "OVERWORLD" ||
    x === "SETUP" ||
    x === "NODE" ||
    x === "BATTLE" ||
    x === "REWARD" ||
    x === "VICTORY" ||
    x === "DEFEAT"
  );
}

function pruneBattleMeta(meta: any) {
  if (!meta || typeof meta !== "object") return;
  // UI-only queues / flashes (safe to drop; they'll rebuild naturally)
  delete meta.damageEvents;
  delete meta.healEvents;
  delete meta.statusFlashNonce;
  delete meta.statusFlashId;
  delete meta.statusFlashTarget;
  delete meta.blockedNegativeCardNonce;
  delete meta.blockedNegativeCardByEnemyId;
  delete meta.pendingHandExhaustNonce;
  delete meta.cleanseFlashNonce;
  delete meta.cleanseFlashEnemyId;
  delete meta.cleanseFlashStatusIds;
  delete meta.battleLog;
}

function makePortableState(state: GameState): any {
  // Ensure we're only dealing with JSON-safe data.
  const raw: any = JSON.parse(JSON.stringify(state ?? {}));

  // Never export debug/testing flags.
  raw.debugSkipQuestions = false;
  raw.debugForcedEventId = null;

  // Teacher mode is disabled in the student-facing build.
  raw.teacherUnlocked = false;

  // Prune volatile UI state that isn't important to resume.
  if (raw?.battle?.meta) pruneBattleMeta(raw.battle.meta);

  return raw;
}

function normalizeLoadedState(rawState: any, teacherUnlockedFallback: boolean): GameState {
  const merged: any = {
    ...initialState,
    ...(rawState ?? {}),
  };

  merged.screen = isValidScreen(merged.screen) ? merged.screen : "TITLE";

  merged.consumables = Array.isArray(merged.consumables) ? merged.consumables : [];
  merged.wrongAnswerLog = Array.isArray(merged.wrongAnswerLog) ? merged.wrongAnswerLog : [];
  merged.lockedNodeIds = Array.isArray(merged.lockedNodeIds) ? merged.lockedNodeIds : [];
  merged.appliedSupplyIds = Array.isArray(merged.appliedSupplyIds) ? merged.appliedSupplyIds : [];
  merged.currentSupplyIds = Array.isArray(merged.currentSupplyIds) ? merged.currentSupplyIds : [];
  merged.supplyFlashIds = Array.isArray(merged.supplyFlashIds) ? merged.supplyFlashIds : [];

  // Teacher mode is disabled in the student-facing build.
  merged.teacherUnlocked = false;

  // Always clear debug flags on import.
  merged.debugSkipQuestions = false;
  merged.debugForcedEventId = null;

  if (merged.screen !== "TITLE" && merged.runStartMs == null) {
    merged.runStartMs = Date.now();
  }

  // Quick sanity checks to avoid hard crashes after import.
  if (merged.screen !== "TITLE") {
    if (!merged.map || !merged.currentNodeId) {
      // fall back to title if it's an incomplete snapshot
      merged.screen = "TITLE";
    }
  }

  // If we imported a boss battle snapshot, ensure its UI queues are clean.
  if (merged?.battle?.meta) pruneBattleMeta(merged.battle.meta);

  return merged as GameState;
}

export function encodeRunCode(state: GameState): string {
  const portable = makePortableState(state);
  const payload = { v: 1, state: portable };
  const json = JSON.stringify(payload);
  const b64 = b64UrlEncodeUtf8(json);
  const hash = (fnv1a32(b64) >>> 0).toString(16).padStart(8, "0");
  return `${PREFIX}${b64}.${hash}`;
}

export function decodeRunCode(
  code: string,
  opts?: { teacherUnlockedFallback?: boolean }
): { ok: true; state: GameState } | { ok: false; error: string } {
  try {
    const trimmed = String(code ?? "").trim();
    if (!trimmed) return { ok: false, error: "Paste a run code first." };
    if (!trimmed.startsWith(PREFIX)) return { ok: false, error: "That doesn't look like a Math The Spire run code." };

    const rest = trimmed.slice(PREFIX.length);
    const parts = rest.split(".");
    if (parts.length !== 2) return { ok: false, error: "Run code format is invalid (missing checksum)." };
    const [b64, hash] = parts;
    if (!b64 || !hash) return { ok: false, error: "Run code format is invalid." };

    const expected = (fnv1a32(b64) >>> 0).toString(16).padStart(8, "0");
    if (expected.toLowerCase() !== String(hash).toLowerCase()) {
      return { ok: false, error: "Run code checksum failed (maybe a missing/extra character)." };
    }

    const json = b64UrlDecodeUtf8(b64);
    const payload: any = JSON.parse(json);
    if (!payload || payload.v !== 1 || !payload.state) {
      return { ok: false, error: "Run code payload is invalid or from an unsupported version." };
    }

    const teacherFallback = !!opts?.teacherUnlockedFallback;
    const normalized = normalizeLoadedState(payload.state, teacherFallback);
    if (normalized.screen !== "TITLE" && (!normalized.map || !normalized.currentNodeId)) {
      return { ok: false, error: "Run code is missing map data and can't be resumed." };
    }

    return { ok: true, state: normalized };
  } catch (e: any) {
    return { ok: false, error: `Couldn't read run code: ${e?.message ?? String(e)}` };
  }
}
