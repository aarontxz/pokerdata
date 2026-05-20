"use client";

import { useMemo, useState } from "react";
import type { WSDRecord } from "../lib/pokerParser";
import { CardPair, CardRow } from "./CardText";

interface PlayerWSDModalProps {
  open: boolean;
  playerName: string;
  records: WSDRecord[];
  onClose: () => void;
  sessionCount?: number;
}

function baseName(name: string): string {
  const at = name.indexOf("@");
  if (at === -1) return name.trim();
  return name.slice(0, at).trim();
}

function displayName(name: string): string {
  const aliases = baseName(name)
    .split(" / ")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return aliases[0] ?? baseName(name);
}

function formatHandRef(r: WSDRecord, sessionCount?: number): string {
  if (sessionCount === 1) return `#${r.handNumber}`;
  return `(#${r.sessionNumber},#${r.handNumber})`;
}

export default function PlayerWSDModal({
  open,
  playerName,
  records,
  onClose,
  sessionCount,
}: PlayerWSDModalProps) {
  const [sortBy, setSortBy] = useState<"hand" | "pot">("hand");
  const [sortAsc, setSortAsc] = useState(true);

  function toggleSort(next: "hand" | "pot") {
    if (sortBy === next) {
      setSortAsc((v) => !v);
    } else {
      setSortBy(next);
      setSortAsc(next === "hand");
    }
  }

  const sorted = useMemo(() => {
    const next = [...records];
    next.sort((a, b) => {
      const av =
        sortBy === "hand"
          ? a.sessionNumber * 1_000_000 + a.handNumber
          : a.potSize;
      const bv =
        sortBy === "hand"
          ? b.sessionNumber * 1_000_000 + b.handNumber
          : b.potSize;
      return sortAsc ? av - bv : bv - av;
    });
    return next;
  }, [records, sortBy, sortAsc]);

  const wins = records.filter((r) => r.result === "won").length;
  const draws = records.filter((r) => r.result === "draw").length;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Showdowns for ${playerName}`}
    >
      <div
        className="w-full max-w-5xl rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              Showdowns: {playerName}
            </h3>
            <p className="text-xs text-zinc-400">
              {records.length} showdown{records.length === 1 ? "" : "s"} · {wins} won · {draws} draw{draws === 1 ? "" : "s"}
              {records.length > 0
                ? ` (${((wins / records.length) * 100).toFixed(1)}% WSD)`
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-4">
          {records.length === 0 ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-400">
              No showdowns recorded for this player.
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
                      {sortBy === "hand" && (
                        <span className="ml-1">{sortAsc ? "▲" : "▼"}</span>
                      )}
                    </th>
                    <th className="px-3 py-2 text-left">Result</th>
                    <th className="px-3 py-2 text-left">Hole Cards</th>
                    <th className="px-3 py-2 text-left">Board</th>
                    <th className="px-3 py-2 text-left">Opponents</th>
                    <th
                      onClick={() => toggleSort("pot")}
                      className={`cursor-pointer select-none px-3 py-2 text-right hover:text-zinc-100 ${
                        sortBy === "pot" ? "text-green-400" : ""
                      }`}
                    >
                      Pot
                      {sortBy === "pot" && (
                        <span className="ml-1">{sortAsc ? "▲" : "▼"}</span>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => (
                    <tr
                      key={`${r.sessionNumber}-${r.handNumber}-${i}`}
                      className={`border-t border-zinc-800 align-top ${
                        i % 2 === 0 ? "bg-zinc-900/20" : "bg-zinc-900/5"
                      }`}
                    >
                      <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">
                        {formatHandRef(r, sessionCount)}
                      </td>
                      <td
                        className={`px-3 py-2 font-medium ${
                          r.result === "won"
                            ? "text-green-400"
                            : r.result === "draw"
                            ? "text-amber-300"
                            : "text-red-400"
                        }`}
                      >
                        {r.result === "won" ? "Won" : r.result === "draw" ? "Draw" : "Lost"}
                      </td>
                      <td className="px-3 py-2 text-zinc-200 whitespace-nowrap">
                        {r.holeCards ? <CardPair cards={r.holeCards} /> : "—"}
                      </td>
                      <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">
                        {(() => {
                          const boards = r.boards && r.boards.length > 0
                            ? r.boards
                            : r.board.length > 0
                            ? [r.board]
                            : [];
                          if (boards.length === 0) return "—";
                          if (boards.length === 1) return <CardRow cards={boards[0]} />;
                          return (
                            <div className="space-y-0.5">
                              {boards.map((b, idx) => (
                                <div key={idx}>
                                  <span className="text-zinc-500 text-xs mr-1">
                                    #{idx + 1}
                                  </span>
                                  <CardRow cards={b} />
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2 text-zinc-300">
                        {r.opponents.length === 0 ? (
                          "—"
                        ) : (
                          <ul className="space-y-0.5">
                            {r.opponents.map((opp, j) => (
                              <li key={`${opp.name}-${j}`}>
                                <span className="text-zinc-100">
                                  {displayName(opp.name)}
                                </span>
                                <span className="ml-2 text-zinc-400">
                                  {opp.holeCards ? <CardPair cards={opp.holeCards} /> : "—"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-zinc-300 text-right">
                        {r.potSize}
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
