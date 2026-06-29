"use client";

import { useMemo, useState } from "react";
import type { CBetRecord } from "../lib/pokerParser";
import { CardPair, CardRow } from "./CardText";

interface PlayerCBetModalProps {
  open: boolean;
  playerName: string;
  cbets: CBetRecord[];
  onClose: () => void;
  sessionCount?: number;
}

function formatHandRef(r: CBetRecord, sessionCount?: number): string {
  if (sessionCount === 1) {
    return `#${r.handNumber}`;
  }
  return `(#${r.sessionNumber},#${r.handNumber})`;
}

function fmtAmount(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(2);
}

export default function PlayerCBetModal({
  open,
  playerName,
  cbets,
  onClose,
  sessionCount,
}: PlayerCBetModalProps) {
  const [sortBy, setSortBy] = useState<"hand" | "pot" | "cbetAmount">("hand");
  const [sortAsc, setSortAsc] = useState(true);

  function toggleSort(next: "hand" | "pot" | "cbetAmount") {
    if (sortBy === next) {
      setSortAsc((v) => !v);
    } else {
      setSortBy(next);
      setSortAsc(true);
    }
  }

  const sortedCBets = useMemo(() => {
    const next = [...cbets];
    next.sort((a, b) => {
      let av: number;
      let bv: number;

      if (sortBy === "hand") {
        av = a.sessionNumber * 1_000_000 + a.handNumber;
        bv = b.sessionNumber * 1_000_000 + b.handNumber;
      } else if (sortBy === "pot") {
        av = a.potBeforeCBet;
        bv = b.potBeforeCBet;
      } else {
        av = a.cbetAmount;
        bv = b.cbetAmount;
      }

      return sortAsc ? av - bv : bv - av;
    });
    return next;
  }, [cbets, sortBy, sortAsc]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 sm:p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Continuation bets for ${playerName}`}
    >
      <div
        className="w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl max-h-[85vh] sm:max-h-none flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5 sm:px-4 sm:py-3 shrink-0">
          <div>
            <h3 className="text-xs sm:text-sm font-semibold text-zinc-100">C-Bets: {playerName}</h3>
            <p className="text-[10px] sm:text-xs text-zinc-400">{cbets.length} flop continuation bets.</p>
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
          {cbets.length === 0 ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-400">
              No continuation bets found for this player in the loaded files.
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
                    <th className="px-3 py-2 text-left">Hole Cards</th>
                    <th className="px-3 py-2 text-left">Flop</th>
                    <th
                      onClick={() => toggleSort("pot")}
                      className={`cursor-pointer select-none px-3 py-2 text-left hover:text-zinc-100 ${
                        sortBy === "pot" ? "text-green-400" : ""
                      }`}
                    >
                      Pot
                      {sortBy === "pot" && <span className="ml-1">{sortAsc ? "▲" : "▼"}</span>}
                    </th>
                    <th
                      onClick={() => toggleSort("cbetAmount")}
                      className={`cursor-pointer select-none px-3 py-2 text-left hover:text-zinc-100 ${
                        sortBy === "cbetAmount" ? "text-green-400" : ""
                      }`}
                    >
                      CBet
                      {sortBy === "cbetAmount" && <span className="ml-1">{sortAsc ? "▲" : "▼"}</span>}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCBets.map((r, i) => (
                    <tr
                      key={`${r.sessionNumber}-${r.handNumber}-${i}`}
                      className={`border-t border-zinc-800 ${i % 2 === 0 ? "bg-zinc-900/20" : "bg-zinc-900/5"}`}
                    >
                      <td className="px-3 py-2 text-zinc-300">{formatHandRef(r, sessionCount)}</td>
                      <td className="px-3 py-2 text-zinc-300">
                        {r.holeCards ? <CardPair cards={r.holeCards} /> : "-"}
                      </td>
                      <td className="px-3 py-2 text-zinc-300">
                        {r.flopCards ? <CardRow cards={r.flopCards} /> : "-"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-zinc-300">{fmtAmount(r.potBeforeCBet)}</td>
                      <td className="px-3 py-2 tabular-nums text-zinc-300">{fmtAmount(r.cbetAmount)}</td>
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
