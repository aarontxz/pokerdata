"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import type { HandReplay, HandReplayAction } from "../lib/pokerParser";
import { CardPair, CardRow } from "./CardText";

function actionLabel(a: HandReplayAction, dn: (n: string) => string): string {
  const name = a.player ? dn(a.player) : "";
  switch (a.type) {
    case "small-blind": return `${name} posts SB ${a.amount}`;
    case "big-blind": return `${name} posts BB ${a.amount}`;
    case "straddle": return `${name} straddles ${a.amount}`;
    case "fold": return `${name} folds`;
    case "check": return `${name} checks`;
    case "call": return `${name} calls ${a.amount}`;
    case "bet": return `${name} bets ${a.amount}`;
    case "raise": return `${name} raises to ${a.amount}`;
    case "collect": return `${name} collects ${a.amount}`;
    case "uncalled-return": return `${a.amount} returned to ${name}`;
    case "flop": return "Flop";
    case "turn": return "Turn";
    case "river": return "River";
    case "show-cards": return `${name} shows`;
    default: return a.type;
  }
}

function actionColor(type: HandReplayAction["type"]): string {
  switch (type) {
    case "fold": return "text-red-400";
    case "check": return "text-zinc-400";
    case "call": return "text-green-400";
    case "bet":
    case "raise": return "text-amber-300";
    case "small-blind":
    case "big-blind":
    case "straddle": return "text-sky-400";
    case "flop":
    case "turn":
    case "river": return "text-purple-400 font-semibold";
    case "show-cards": return "text-pink-400";
    case "collect": return "text-green-300 font-semibold";
    case "uncalled-return": return "text-zinc-500";
    default: return "text-zinc-300";
  }
}

interface HandReplayPanelProps {
  handReplays: HandReplay[];
  currentHandNumber: number | null;
  getDisplayName: (name: string) => string;
  onHandChange: (handNumber: number) => void;
  selfHandPnL?: Record<number, number>;
  selfHandCards?: Record<number, string[]>;
}

export default function HandReplayPanel({
  handReplays,
  currentHandNumber,
  getDisplayName,
  onHandChange,
  selfHandPnL,
  selfHandCards,
}: HandReplayPanelProps) {
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);
  const actionListRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const replay = useMemo(() => {
    if (currentHandNumber === null) return null;
    return handReplays.find((r) => r.handNumber === currentHandNumber) ?? null;
  }, [handReplays, currentHandNumber]);

  const totalSteps = replay ? replay.actions.length : 0;

  const replayIndex = useMemo(() => {
    if (currentHandNumber === null) return -1;
    return handReplays.findIndex((r) => r.handNumber === currentHandNumber);
  }, [handReplays, currentHandNumber]);

  const prevHandNumber = replayIndex > 0 ? handReplays[replayIndex - 1].handNumber : null;
  const nextHandNumber = replayIndex >= 0 && replayIndex < handReplays.length - 1
    ? handReplays[replayIndex + 1].handNumber : null;

  useEffect(() => { setStep(0); }, [currentHandNumber]);

  const clampedStep = Math.min(step, totalSteps);

  useEffect(() => {
    const el = actionListRef.current;
    if (!el) return;
    const active = el.querySelector("[data-active]");
    if (active) active.scrollIntoView({ block: "nearest" });
  }, [clampedStep]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); setStep((s) => Math.min(s + 1, totalSteps)); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); setStep((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Home") { e.preventDefault(); setStep(0); }
    else if (e.key === "End") { e.preventDefault(); setStep(totalSteps); }
  }, [totalSteps]);

  const boardCards = useMemo(() => {
    if (!replay) return [];
    const cards: string[] = [];
    for (let i = 0; i < clampedStep; i++) {
      const a = replay.actions[i];
      if ((a.type === "flop" || a.type === "turn" || a.type === "river") && a.cards) cards.push(...a.cards);
    }
    return cards;
  }, [replay, clampedStep]);

  const shownCards = useMemo(() => {
    if (!replay) return new Map<string, string[]>();
    const map = new Map<string, string[]>();
    for (const a of replay.actions) {
      if (a.type === "show-cards" && a.player && a.cards) map.set(a.player, a.cards);
    }
    return map;
  }, [replay]);

  const foldedPlayers = useMemo(() => {
    if (!replay) return new Set<string>();
    const set = new Set<string>();
    for (let i = 0; i < clampedStep; i++) {
      if (replay.actions[i].type === "fold" && replay.actions[i].player) set.add(replay.actions[i].player!);
    }
    return set;
  }, [replay, clampedStep]);

  const { streetBets, mainPot, effectiveStacks } = useMemo(() => {
    if (!replay) return { streetBets: new Map<string, number>(), mainPot: 0, effectiveStacks: new Map<string, number>() };

    const stacks = new Map<string, number>();
    for (const p of replay.players) stacks.set(p.name, p.stack);

    const curStreet = new Map<string, number>();
    let pot = 0;

    for (let i = 0; i < clampedStep; i++) {
      const a = replay.actions[i];

      if (a.type === "flop" || a.type === "turn" || a.type === "river") {
        for (const v of curStreet.values()) pot += v;
        curStreet.clear();
        continue;
      }

      if (!a.player || !a.amount) continue;

      switch (a.type) {
        case "small-blind":
        case "big-blind":
        case "call":
        case "bet":
          curStreet.set(a.player, (curStreet.get(a.player) ?? 0) + a.amount);
          stacks.set(a.player, (stacks.get(a.player) ?? 0) - a.amount);
          break;
        case "raise":
        case "straddle": {
          const prev = curStreet.get(a.player) ?? 0;
          const additional = Math.max(0, a.amount - prev);
          curStreet.set(a.player, a.amount);
          stacks.set(a.player, (stacks.get(a.player) ?? 0) - additional);
          break;
        }
        case "uncalled-return":
          curStreet.set(a.player, Math.max(0, (curStreet.get(a.player) ?? 0) - a.amount));
          stacks.set(a.player, (stacks.get(a.player) ?? 0) + a.amount);
          break;
        case "collect":
          for (const v of curStreet.values()) pot += v;
          curStreet.clear();
          pot = Math.max(0, Math.round((pot - a.amount) * 100) / 100);
          stacks.set(a.player, (stacks.get(a.player) ?? 0) + a.amount);
          break;
      }
    }

    return {
      streetBets: curStreet,
      mainPot: Math.round(pot * 100) / 100,
      effectiveStacks: stacks,
    };
  }, [replay, clampedStep]);

  const lastActorName = useMemo(() => {
    if (!replay || clampedStep === 0) return null;
    return replay.actions[clampedStep - 1]?.player ?? null;
  }, [replay, clampedStep]);

  const selfHands = useMemo(() => {
    if (!selfHandPnL) return [];
    return Object.entries(selfHandPnL)
      .map(([h, pnl]) => ({ hand: Number(h), pnl }))
      .sort((a, b) => a.hand - b.hand);
  }, [selfHandPnL]);

  const handStripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = handStripRef.current;
    if (!el || currentHandNumber === null) return;
    const active = el.querySelector("[data-current-hand]");
    if (active) active.scrollIntoView({ block: "nearest", inline: "center" });
  }, [currentHandNumber]);

  const hasReplay = !!replay;
  const hasStrip = selfHands.length > 0;

  if (!hasReplay && !hasStrip) return null;

  const n = replay?.players.length ?? 0;

  return (
    <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/80 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 sm:px-4 sm:py-3 bg-zinc-900/60 border-b border-zinc-800 hover:bg-zinc-900/80 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Hand Replay
          </span>
          {currentHandNumber !== null && (
            <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-amber-400 tabular-nums">
              #{currentHandNumber}
            </span>
          )}
          {selfHandPnL && currentHandNumber !== null && selfHandPnL[currentHandNumber] !== undefined && (() => {
            const pnl = selfHandPnL[currentHandNumber];
            if (pnl === 0) return null;
            return (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
                pnl > 0
                  ? "bg-green-950/60 border border-green-700/40 text-green-400"
                  : "bg-red-950/60 border border-red-700/40 text-red-400"
              }`}>
                {pnl > 0 ? `+${pnl}` : `${pnl}`}
              </span>
            );
          })()}
          {!hasReplay && currentHandNumber !== null && (
            <span className="text-[10px] text-zinc-600 italic">no replay data</span>
          )}
        </div>
        <span className="text-zinc-500 text-sm">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="outline-none" tabIndex={0} onKeyDown={handleKeyDown}>

          {/* ── Focus Player Hand Strip ── */}
          {hasStrip && (
            <div className="px-2 pt-2 pb-1 sm:px-4 sm:pt-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Player Hands</span>
                <span className="text-[10px] text-zinc-600 tabular-nums">{selfHands.length} hands</span>
              </div>
              <div
                ref={handStripRef}
                className="flex gap-1 overflow-x-auto"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {selfHands.map(({ hand, pnl }) => {
                  const isCurrent = hand === currentHandNumber;
                  const cards = selfHandCards?.[hand];
                  return (
                    <button
                      key={hand}
                      type="button"
                      data-current-hand={isCurrent ? "" : undefined}
                      onClick={() => onHandChange(hand)}
                      className={`flex flex-col items-center shrink-0 rounded-md px-1.5 py-1 transition-colors ${
                        isCurrent
                          ? "bg-amber-950/60 border border-amber-500/60 shadow-[0_0_6px_rgba(245,158,11,0.2)]"
                          : "bg-zinc-800/50 border border-zinc-700/50 hover:bg-zinc-800 hover:border-zinc-600"
                      }`}
                      style={{ minWidth: 42 }}
                    >
                      <span className={`text-[10px] tabular-nums leading-tight ${
                        isCurrent ? "text-amber-400 font-semibold" : "text-zinc-500"
                      }`}>
                        #{hand}
                      </span>
                      {cards && (
                        <span className="text-[10px] leading-tight">
                          <CardPair cards={cards} />
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold tabular-nums leading-tight ${
                        pnl > 0 ? "text-green-400" : pnl < 0 ? "text-red-400" : "text-zinc-600"
                      }`}>
                        {pnl > 0 ? `+${pnl}` : pnl === 0 ? "0" : `${pnl}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Poker Table ── */}
          {replay && (<>
          <div
            className="relative mx-auto my-4 select-none"
            style={{
              width: "100%",
              maxWidth: isMobile ? 360 : 560,
              aspectRatio: isMobile ? "36/50" : "56/38",
            }}
          >
            {/* Tap zones — mobile only */}
            <div
              className="absolute inset-y-0 left-0 w-1/2 z-30 sm:hidden"
              onClick={() => {
                if (clampedStep > 0) setStep(clampedStep - 1);
                else if (prevHandNumber !== null) onHandChange(prevHandNumber);
              }}
            />
            <div
              className="absolute inset-y-0 right-0 w-1/2 z-30 sm:hidden"
              onClick={() => {
                if (clampedStep < totalSteps) setStep(clampedStep + 1);
                else if (nextHandNumber !== null) onHandChange(nextHandNumber);
              }}
            />
            {/* Table rim */}
            <div className="absolute inset-2 rounded-[50%] bg-gradient-to-b from-amber-950/60 to-amber-950/30 border border-amber-900/40" />
            {/* Table rail */}
            <div className="absolute inset-3 rounded-[50%] bg-gradient-to-b from-emerald-950 to-emerald-900 shadow-[inset_0_4px_30px_rgba(0,0,0,0.5)]" />
            {/* Inner felt line */}
            <div className="absolute inset-6 rounded-[50%] border border-emerald-700/20" />

            {/* Center: board + pot */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 sm:gap-1.5 pointer-events-none z-10">
              {boardCards.length > 0 ? (
                <div className="flex gap-1 sm:gap-1.5 rounded-xl bg-black/25 px-2 py-1 sm:px-3 sm:py-1.5 backdrop-blur-sm border border-white/5">
                  {boardCards.map((card, ci) => (
                    <div key={ci} className="rounded bg-zinc-900 border border-zinc-600 px-1 py-0.5 sm:px-1.5 sm:py-1 text-xs sm:text-sm font-bold shadow-sm">
                      <CardPair cards={[card]} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl bg-black/15 px-4 py-1.5 sm:px-6 sm:py-2 border border-white/5">
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-widest text-emerald-600/60">Poker Fish</span>
                </div>
              )}
              {mainPot > 0 && (
                <div className="flex items-center gap-1 sm:gap-1.5 rounded-full bg-black/30 px-2 py-0.5 sm:px-3 sm:py-1 backdrop-blur-sm border border-amber-500/20">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 border border-amber-300/50 shadow-sm" />
                  <span className="text-[10px] sm:text-xs font-bold text-amber-300 tabular-nums">{mainPot}</span>
                </div>
              )}
            </div>

            {/* Player seats */}
            {replay.players.map((p, i) => {
              const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
              const rx = isMobile ? 43 : 47;
              const ry = isMobile ? 45 : 43;
              const cx = 50 + rx * Math.cos(angle);
              const cy = 50 + ry * Math.sin(angle);

              const folded = foldedPlayers.has(p.name);
              const cards = shownCards.get(p.name);
              const bet = streetBets.get(p.name) ?? 0;
              const stack = effectiveStacks.get(p.name) ?? p.stack;
              const isActor = lastActorName === p.name;

              const betRx = isMobile ? 28 : 32;
              const betRy = isMobile ? 30 : 28;
              const betCx = 50 + betRx * Math.cos(angle);
              const betCy = 50 + betRy * Math.sin(angle);

              return (
                <div key={p.name}>
                  {/* Bet chip */}
                  {bet > 0 && (
                    <div
                      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20"
                      style={{ left: `${betCx}%`, top: `${betCy}%` }}
                    >
                      <div className="flex items-center gap-0.5 sm:gap-1 rounded-full bg-black/40 border border-amber-500/30 px-1 py-0.5 sm:px-1.5 backdrop-blur-sm">
                        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shrink-0" />
                        <span className="text-[8px] sm:text-[10px] font-bold text-amber-300 tabular-nums">{bet}</span>
                      </div>
                    </div>
                  )}

                  {/* Player seat */}
                  <div
                    className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 z-20"
                    style={{ left: `${cx}%`, top: `${cy}%` }}
                  >
                    {/* Hole cards */}
                    {cards && !folded && (
                      <div className="flex gap-0.5 mb-0.5">
                        {cards.map((card, ci) => (
                          <div key={ci} className="rounded bg-zinc-900 border border-zinc-600 px-0.5 py-0.5 text-[10px] sm:px-1 sm:text-xs font-bold shadow-sm">
                            <CardPair cards={[card]} />
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Name plate */}
                    <div
                      className={`rounded-lg text-center shadow-lg transition-all ${
                        folded
                          ? "bg-zinc-800/80 border border-zinc-700/40 px-1.5 py-0.5 opacity-40"
                          : isActor
                          ? "bg-gradient-to-b from-zinc-700 to-zinc-800 border-2 border-amber-400 px-1.5 py-0.5 sm:px-2.5 sm:py-1 shadow-[0_0_12px_rgba(245,158,11,0.25)]"
                          : "bg-gradient-to-b from-zinc-700 to-zinc-800 border border-zinc-500/60 px-1.5 py-0.5 sm:px-2.5 sm:py-1"
                      }`}
                    >
                      <div className={`text-[9px] sm:text-[11px] font-bold leading-tight whitespace-nowrap ${
                        folded ? "text-zinc-500" : "text-zinc-100"
                      }`}>
                        {getDisplayName(p.name)}
                      </div>
                      <div className={`text-[8px] sm:text-[10px] tabular-nums leading-tight ${
                        folded ? "text-zinc-600" : "text-zinc-400"
                      }`}>
                        {Math.round(stack * 100) / 100}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Controls ── */}
          <div className="px-2 pb-2 sm:px-4 sm:pb-3">
            <div className="flex items-center gap-1 sm:gap-1.5 mb-2 sm:mb-3">
              <button
                type="button"
                onClick={() => { if (prevHandNumber !== null) onHandChange(prevHandNumber); }}
                disabled={prevHandNumber === null}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2 sm:px-2.5 sm:py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 disabled:opacity-25 disabled:cursor-default transition-colors whitespace-nowrap"
              >
                ◀◀
              </button>
              {clampedStep > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep(clampedStep - 1)}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-2 sm:px-3 sm:py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-700 transition-colors"
                >
                  ◀
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { if (prevHandNumber !== null) onHandChange(prevHandNumber); }}
                  disabled={prevHandNumber === null}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-2 sm:px-3 sm:py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-700 disabled:opacity-25 disabled:cursor-default transition-colors"
                >
                  ◀
                </button>
              )}
              <input
                type="range"
                min={0}
                max={totalSteps}
                value={clampedStep}
                onChange={(e) => setStep(parseInt(e.target.value))}
                className="flex-1 accent-amber-500"
              />
              {clampedStep < totalSteps ? (
                <button
                  type="button"
                  onClick={() => setStep(clampedStep + 1)}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-2 sm:px-3 sm:py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-700 transition-colors"
                >
                  ▶
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { if (nextHandNumber !== null) onHandChange(nextHandNumber); }}
                  disabled={nextHandNumber === null}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-2 sm:px-3 sm:py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-700 disabled:opacity-25 disabled:cursor-default transition-colors"
                >
                  ▶
                </button>
              )}
              <button
                type="button"
                onClick={() => { if (nextHandNumber !== null) onHandChange(nextHandNumber); }}
                disabled={nextHandNumber === null}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2 sm:px-2.5 sm:py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 disabled:opacity-25 disabled:cursor-default transition-colors whitespace-nowrap"
              >
                ▶▶
              </button>
              <span className="text-[10px] sm:text-[11px] text-zinc-500 tabular-nums whitespace-nowrap ml-0.5 sm:ml-1">{clampedStep}/{totalSteps}</span>
            </div>

            {/* ── Action log ── */}
            <div
              ref={actionListRef}
              className="max-h-36 sm:max-h-44 overflow-y-auto rounded-lg border border-zinc-700/80 bg-zinc-900/80"
            >
              {replay.actions.map((a, i) => {
                const isActive = i === clampedStep - 1;
                const isPast = i < clampedStep;
                const isFuture = i >= clampedStep;
                const isStreet = a.type === "flop" || a.type === "turn" || a.type === "river";
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setStep(i + 1)}
                    data-active={isActive ? "" : undefined}
                    className={`flex w-full items-center gap-2 px-3 text-left text-xs transition-colors ${
                      isStreet ? "py-1.5 bg-zinc-800/30" : "py-1"
                    } ${
                      isActive
                        ? "bg-amber-950/50 border-l-2 border-amber-400"
                        : "border-l-2 border-transparent hover:bg-zinc-800/50"
                    } ${isFuture ? "opacity-25" : ""}`}
                  >
                    <span className="w-5 text-right text-zinc-600 tabular-nums shrink-0">{i + 1}</span>
                    <span className={`flex-1 ${isPast || isActive ? actionColor(a.type) : "text-zinc-600"}`}>
                      {actionLabel(a, getDisplayName)}
                    </span>
                    {isStreet && a.cards && (isPast || isActive) && (
                      <CardRow cards={a.cards} />
                    )}
                    {a.type === "show-cards" && a.cards && (isPast || isActive) && (
                      <CardPair cards={a.cards} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          </>)}
        </div>
      )}
    </div>
  );
}
