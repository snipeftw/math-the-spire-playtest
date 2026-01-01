// src/components/DebugPanel.tsx
import React, { useMemo, useState, useEffect } from "react";
import type { GameState, Action } from "../game/state";
import { SUPPLIES_POOL_10 } from "../content/supplies";
import { ALL_CARDS_40ish, BASE_CARDS } from "../content/cards";
import { EVENTS } from "../content/events";
import { AllCardsModal } from "./AllCardsModal";
import { AllSuppliesModal } from "./AllSuppliesModal";
import { AllConsumablesModal } from "./AllConsumablesModal";
import {
  ENCOUNTER_POOL_EASY_5,
  ENCOUNTER_POOL_MED_5,
  ENCOUNTER_POOL_HARD_5,
  ENCOUNTER_POOL_CHALLENGE_EASY,
  ENCOUNTER_POOL_CHALLENGE_MED,
  ENCOUNTER_POOL_CHALLENGE_HARD,
  BOSS_ENCOUNTER,
} from "../content/enemies";

type Props = {
  open: boolean;
  state: GameState;
  dispatch: React.Dispatch<Action>;
  onClose: () => void;
};

const DEBUG_PASSWORD = "dsp"; // Same as teacher password

export function DebugPanel(props: Props) {
  const { open, state, dispatch, onClose } = props;

  const [supply, setSupply] = useState<string>(state.setup?.supplyId ?? "");
  const [cardId, setCardId] = useState<string>(BASE_CARDS[0]?.id ?? "");
  const [encounterId, setEncounterId] = useState<string>("");
  const [eventId, setEventId] = useState<string>(EVENTS[0]?.id ?? "vault");
  const [battleDifficulty, setBattleDifficulty] = useState<1 | 2 | 3>(1);
  const [battleIsChallenge, setBattleIsChallenge] = useState<boolean>(false);
  const [showAllCards, setShowAllCards] = useState<boolean>(false);
  const [showAllSupplies, setShowAllSupplies] = useState<boolean>(false);
  const [showAllConsumables, setShowAllConsumables] = useState<boolean>(false);
  const [password, setPassword] = useState<string>("");
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);

  const cardOptions = useMemo(() => {
    return ALL_CARDS_40ish.map((c) => ({ id: c.id, label: `${c.name} (${c.id})` }));
  }, []);

  const encounterOptions = useMemo(() => {
    const allEncounters = [
      { group: "Easy", encounters: ENCOUNTER_POOL_EASY_5 },
      { group: "Medium", encounters: ENCOUNTER_POOL_MED_5 },
      { group: "Hard", encounters: ENCOUNTER_POOL_HARD_5 },
      { group: "Challenge (Easy)", encounters: ENCOUNTER_POOL_CHALLENGE_EASY },
      { group: "Challenge (Medium)", encounters: ENCOUNTER_POOL_CHALLENGE_MED },
      { group: "Challenge (Hard)", encounters: ENCOUNTER_POOL_CHALLENGE_HARD },
      { group: "Boss", encounters: [BOSS_ENCOUNTER] },
    ];
    
    return allEncounters.flatMap(({ group, encounters }) =>
      encounters.map((enc) => ({
        id: enc.id,
        label: `[${group}] ${enc.name}`,
        isChallenge: enc.id.startsWith("ch_"),
        isBoss: enc.id === BOSS_ENCOUNTER.id,
      }))
    );
  }, []);

  const eventOptions = useMemo(() => {
    return EVENTS.map((e) => ({ id: e.id, label: `${e.title} (${e.id})` }));
  }, []);

  // Handle password unlock
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === DEBUG_PASSWORD) {
      setIsUnlocked(true);
      setPassword("");
    } else {
      setPassword("");
      alert("Incorrect password");
    }
  };

  // Reset unlock state when panel closes
  useEffect(() => {
    if (!open) {
      setIsUnlocked(false);
      setPassword("");
      setShowAllCards(false);
      setShowAllSupplies(false);
      setShowAllConsumables(false);
    }
  }, [open]);

  if (!open) return null;

  // Show password prompt if not unlocked
  if (!isUnlocked) {
    return (
      <div
        className="fixed right-3 bottom-3 z-[9999] w-[360px] max-w-[90vw] max-h-[80vh] overflow-auto rounded-2xl border border-white/15 bg-black/70 p-3 shadow-xl backdrop-blur"
        role="dialog"
        aria-label="Debug Panel"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Debug Panel</div>
          <button className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <form onSubmit={handlePasswordSubmit}>
          <div className="text-xs mb-2 opacity-80">Enter password to access debug tools:</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl bg-black/50 border border-white/10 p-2 text-sm mb-2"
            placeholder="Password"
            autoFocus
          />
          <button type="submit" className="btn btn-sm w-full">
            Unlock
          </button>
        </form>
      </div>
    );
  }

  return (
    <div
      className="fixed right-3 bottom-3 z-[9999] w-[360px] max-w-[90vw] max-h-[80vh] overflow-auto rounded-2xl border border-white/15 bg-black/70 p-3 shadow-xl backdrop-blur"
      role="dialog"
      aria-label="Debug Panel"
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Debug Panel</div>
        <button className="btn btn-sm" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="mt-2 text-xs opacity-80">
        Screen: <span className="font-mono">{state.screen}</span>
        {state.setup?.supplyId ? (
          <>
            {" "}
            • Supply: <span className="font-mono">{state.setup.supplyId}</span>
          </>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="btn btn-sm" onClick={() => dispatch({ type: "DEBUG_ADD_ALL_CONSUMABLES" })}>
          All Consumables
        </button>
        <button className="btn btn-sm" onClick={() => dispatch({ type: "DEBUG_CLEAR_CONSUMABLES" })}>
          Clear Consumables
        </button>
        <button className="btn btn-sm" onClick={() => dispatch({ type: "DEBUG_HEAL_FULL" })}>
          Heal Full
        </button>
        <button className="btn btn-sm" onClick={() => dispatch({ type: "DEBUG_GIVE_GOLD", amount: 100 })}>
          +100 Gold
        </button>
      </div>

      <div className="mt-2">
        <button className="btn btn-sm w-full" onClick={() => setShowAllCards(true)}>
          View All Cards
        </button>
        <button className="btn btn-sm w-full mt-2" onClick={() => setShowAllSupplies(true)}>
          View All Supplies
        </button>
        <button className="btn btn-sm w-full mt-2" onClick={() => setShowAllConsumables(true)}>
          View All Consumables
        </button>
      </div>

      <div className="mt-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.debugSkipQuestions ?? false}
            onChange={() => dispatch({ type: "DEBUG_TOGGLE_SKIP_QUESTIONS" })}
            className="rounded"
          />
          <span>Skip Questions (auto-submit cards)</span>
        </label>
      </div>

      <div className="mt-3">
        <div className="text-xs mb-1 opacity-80">Set Supply</div>
        <select
          className="w-full rounded-xl bg-black/50 border border-white/10 p-2 text-sm"
          value={supply}
          onChange={(e) => setSupply(e.target.value)}
        >
          <option value="">(none)</option>
          {SUPPLIES_POOL_10.map((s) => (
            <option key={s.id} value={s.id}>
              {s.emoji ? `${s.emoji} ` : ""}{s.name} — {s.id}
            </option>
          ))}
        </select>
        <button
          className="btn btn-sm mt-2 w-full"
          onClick={() => dispatch({ type: "DEBUG_SET_SUPPLY", supplyId: supply || null })}
        >
          Apply Supply
        </button>
      </div>

      <div className="mt-3">
        <div className="text-xs mb-1 opacity-80">Add Card</div>
        <select
          className="w-full rounded-xl bg-black/50 border border-white/10 p-2 text-sm"
          value={cardId}
          onChange={(e) => setCardId(e.target.value)}
        >
          {cardOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className="btn btn-sm" onClick={() => dispatch({ type: "DEBUG_ADD_CARD_TO_DECK", cardId })}>
            Add to Deck
          </button>
          <button
            className="btn btn-sm"
            disabled={!state.battle}
            title={!state.battle ? "Start a battle first" : ""}
            onClick={() => dispatch({ type: "DEBUG_ADD_CARD_TO_HAND", cardId })}
          >
            Add to Hand
          </button>
        </div>
      </div>

      {state.screen === "OVERWORLD" && (
        <div className="mt-3">
          <div className="text-xs mb-1 opacity-80">Force Battle</div>
          <select
            className="w-full rounded-xl bg-black/50 border border-white/10 p-2 text-sm"
            value={encounterId}
            onChange={(e) => {
              setEncounterId(e.target.value);
              const option = encounterOptions.find((opt) => opt.id === e.target.value);
              if (option) {
                setBattleIsChallenge(option.isChallenge);
                if (option.isBoss) {
                  setBattleDifficulty(3);
                }
              }
            }}
          >
            <option value="">Select encounter...</option>
            {encounterOptions.map((enc) => (
              <option key={enc.id} value={enc.id}>
                {enc.label}
              </option>
            ))}
          </select>
          
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] mb-1 opacity-70">Difficulty</div>
              <select
                className="w-full rounded-xl bg-black/50 border border-white/10 p-1.5 text-xs"
                value={battleDifficulty}
                onChange={(e) => setBattleDifficulty(Number(e.target.value) as 1 | 2 | 3)}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </div>
            <div>
              <div className="text-[10px] mb-1 opacity-70">Challenge</div>
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={battleIsChallenge}
                  onChange={(e) => setBattleIsChallenge(e.target.checked)}
                  className="rounded"
                />
                <span>Challenge</span>
              </label>
            </div>
          </div>

          <button
            className="btn btn-sm mt-2 w-full"
            disabled={!encounterId}
            onClick={() => {
              if (encounterId) {
                dispatch({
                  type: "DEBUG_FORCE_BATTLE",
                  encounterId,
                  difficulty: battleDifficulty,
                  isChallenge: battleIsChallenge,
                });
              }
            }}
          >
            Start Battle
          </button>
        </div>


      )}

      <div className="mt-3">
        <div className="text-xs mb-1 opacity-80">Force Event</div>
        <div className="text-[11px] opacity-70 mb-1">
          Forced next event: <span className="font-mono">{state.debugForcedEventId ?? "none"}</span>
        </div>
        <select
          className="w-full rounded-xl bg-black/50 border border-white/10 p-2 text-sm"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
        >
          {eventOptions.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.label}
            </option>
          ))}
        </select>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            className="btn btn-sm"
            onClick={() => dispatch({ type: "DEBUG_SET_FORCED_EVENT", eventId })}
            title="The next EVENT node you open will use this event id (auto-clears after use)."
          >
            Set Next
          </button>
          <button
            className="btn btn-sm"
            onClick={() => dispatch({ type: "DEBUG_SET_FORCED_EVENT", eventId: null })}
            title="Clear any forced event id."
          >
            Clear
          </button>
        </div>

        <button
          className="btn btn-sm mt-2 w-full"
          disabled={!state.map}
          onClick={() => dispatch({ type: "DEBUG_FORCE_EVENT", eventId })}
          title={!state.map ? "Start a run first" : "Jump into an EVENT node immediately for testing."}
        >
          Jump to Event Now
        </button>
      </div>

      <div className="mt-3 text-[11px] opacity-70">
        Tip: Press <span className="font-mono">F2</span> to toggle this panel.
      </div>

      <AllCardsModal open={showAllCards} onClose={() => setShowAllCards(false)} />
      <AllSuppliesModal open={showAllSupplies} onClose={() => setShowAllSupplies(false)} />
      <AllConsumablesModal open={showAllConsumables} onClose={() => setShowAllConsumables(false)} />
    </div>
  );
}
