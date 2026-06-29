"use client";

import { useMemo, useState } from "react";
import type { PreflopRaiseRecord } from "../lib/pokerParser";
import { CardPair } from "./CardText";

interface PlayerRaiseModalProps {
  open: boolean;
  playerName: string;
  raises: PreflopRaiseRecord[];
  onClose: () => void;
  sessionCount?: number;
}

function preflopTypeLabel(r: PreflopRaiseRecord): string {
  if (r.preflopBetLevel <= 2) return "Open raise (2-bet)";
  return `${r.preflopBetLevel}-bet`;
}

function formatHandRef(r: PreflopRaiseRecord, sessionCount?: number): string {
  if (sessionCount === 1) {
    return `#${r.handNumber}`;
  }
  return `(#${r.sessionNumber},#${r.handNumber})`;
}

export default function PlayerRaiseModal({
  open,
  playerName,
  raises,
  onClose,
  sessionCount,
}: PlayerRaiseModalProps) {
  const [sortBy, setSortBy] = useState<"hand" | "raiseTo" | "raiseOverPrevBet">("hand");
  const [sortAsc, setSortAsc] = useState(true);

  function toggleSort(next: "hand" | "raiseTo" | "raiseOverPrevBet") {
    if (sortBy === next) {
      setSortAsc((v) => !v);
    } else {
      setSortBy(next);
      setSortAsc(true);
    }
  }

  const sortedRaises = useMemo(() => {
    const next = [...raises];
    next.sort((a, b) => {
      const av = sortBy === "hand"
        ? a.sessionNumber * 1_000_000 + a.handNumber
        : sortBy === "raiseTo"
        ? a.raiseTo
        : a.raiseOverPrevBet;
      const bv = sortBy === "hand"
        ? b.sessionNumber * 1_000_000 + b.handNumber
        : sortBy === "raiseTo"
        ? b.raiseTo
        : b.raiseOverPrevBet;
      return sortAsc ? av - bv : bv - av;
    });
    return next;
  }, [raises, sortBy, sortAsc]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 sm:p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Preflop raises for ${playerName}`}
    >
      <div
        className="w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl max-h-[85vh] sm:max-h-none flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5 sm:px-4 sm:py-3 shrink-0">
          <div>
            <h3 className="text-xs sm:text-sm font-semibold text-zinc-100">Preflop Raises: {playerName}</h3>
            <p className="text-[10px] sm:text-xs text-zinc-400">{raises.length} raises with revealed cards.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto p-2 sm:p-4 flex-1">
          {raises.length === 0 ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-400">
              No preflop raises with revealed hole cards for this player in the loaded file.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-400">
                    <th
                      onClick={() => toggleSort("hand")}
                      className={`cursor-pointer select-none px-3 py-2 text-left hover:text-zinc-100 ${
                        sortBy === "hand" ? "text-green-400" : ""
                      }`}
                    >
                      Hand
                      {sortBy === "hand" && <span className="ml-1">{sortAsc ? "▲" : "▼"}</span>}
                    </th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th
                      onClick={() => toggleSort("raiseTo")}
                      className={`cursor-pointer select-none px-3 py-2 text-left hover:text-zinc-100 ${
                        sortBy === "raiseTo" ? "text-green-400" : ""
                      }`}
                    >
                      Raise To
                      {sortBy === "raiseTo" && <span className="ml-1">{sortAsc ? "▲" : "▼"}</span>}
                    </th>
                    <th
                      onClick={() => toggleSort("raiseOverPrevBet")}
                      className={`cursor-pointer select-none px-3 py-2 text-left hover:text-zinc-100 ${
                        sortBy === "raiseOverPrevBet" ? "text-green-400" : ""
                      }`}
                    >
                      Over Prev
                      {sortBy === "raiseOverPrevBet" && <span className="ml-1">{sortAsc ? "▲" : "▼"}</span>}
                    </th>
                    <th className="px-3 py-2 text-left">Hole Cards</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRaises.map((r, i) => (
                    <tr
                      key={`${r.handNumber}-${i}`}
                      className={`border-t border-zinc-800 ${i % 2 === 0 ? "bg-zinc-900/20" : "bg-zinc-900/5"}`}
                    >
                      <td className="px-3 py-2 text-zinc-300">
                        {formatHandRef(r, sessionCount)}
                      </td>
                      <td className="px-3 py-2 text-zinc-300">
                        {preflopTypeLabel(r)}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-zinc-300">{r.raiseTo}</td>
                      <td className="px-3 py-2 tabular-nums text-zinc-300">{r.raiseOverPrevBet}</td>
                      <td className="px-3 py-2 text-zinc-300">
                        {r.holeCards ? <CardPair cards={r.holeCards} /> : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
