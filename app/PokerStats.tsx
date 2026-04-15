"use client";

import { useState, useCallback, useRef } from "react";
import { parsePokerLog, type PlayerStats } from "../lib/pokerParser";
import PlayerAliasModal from "./PlayerAliasModal";

type SortKey = keyof PlayerStats;

function baseName(name: string): string {
  const at = name.indexOf("@");
  if (at === -1) return name.trim();
  return name.slice(0, at).trim();
}

function displayName(name: string): string {
  return baseName(name);
}

function pct(num: number, denom: number): string {
  if (denom === 0) return "—";
  return ((num / denom) * 100).toFixed(1) + "%";
}

function af(agg: number, calls: number): string {
  if (calls === 0) return agg > 0 ? "∞" : "—";
  return (agg / calls).toFixed(2);
}

function sign(n: number): string {
  if (n > 0) return `+${n}`;
  return `${n}`;
}

const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: "name", label: "Player", title: "Player name" },
  { key: "handsDealt", label: "Hands", title: "Hands dealt" },
  { key: "buyIn", label: "Buy-in", title: "Total chips bought in" },
  { key: "cashOut", label: "Cash Out", title: "Chips removed from table" },
  { key: "finalStack", label: "Final", title: "Final chip stack" },
  { key: "netChips", label: "Net", title: "Net chip gain/loss" },
  { key: "vpipHands", label: "VPIP%", title: "Voluntarily Put money In Pot %" },
  { key: "pfrHands", label: "PFR%", title: "Preflop Raise %" },
  { key: "aggActions", label: "AF", title: "Aggression Factor = (bets+raises) / calls" },
  { key: "handsWon", label: "Won", title: "Hands collected from pot" },
];

function mergeAliasedStats(raw: PlayerStats[], groups: string[][]): PlayerStats[] {
  const aliasByName: Record<string, string> = {};
  const labelByAlias: Record<string, string> = {};

  for (const group of groups) {
    if (group.length === 0) continue;
    const alias = group[0];
    const label =
      group.length === 1
        ? displayName(alias)
        : group.map((name) => displayName(name)).join(" / ");
    for (const name of group) {
      aliasByName[name] = alias;
    }
    labelByAlias[alias] = label;
  }

  const merged: Record<string, PlayerStats> = {};

  for (const player of raw) {
    const alias = aliasByName[player.name] ?? player.name;
    if (!merged[alias]) {
      merged[alias] = {
        name: labelByAlias[alias] ?? alias,
        handsDealt: 0,
        vpipHands: 0,
        pfrHands: 0,
        aggActions: 0,
        callActions: 0,
        handsWon: 0,
        netChips: 0,
        buyIn: 0,
        finalStack: 0,
        cashOut: 0,
      };
    }

    merged[alias].handsDealt += player.handsDealt;
    merged[alias].vpipHands += player.vpipHands;
    merged[alias].pfrHands += player.pfrHands;
    merged[alias].aggActions += player.aggActions;
    merged[alias].callActions += player.callActions;
    merged[alias].handsWon += player.handsWon;
    merged[alias].netChips += player.netChips;
    merged[alias].buyIn += player.buyIn;
    merged[alias].finalStack += player.finalStack;
    merged[alias].cashOut += player.cashOut;
  }

  return Object.values(merged);
}

function autoMergeSameBaseNamePlayers(raw: PlayerStats[]): PlayerStats[] {
  const merged: Record<string, PlayerStats> = {};

  for (const player of raw) {
    const key = baseName(player.name);
    if (!merged[key]) {
      merged[key] = {
        name: key,
        handsDealt: 0,
        vpipHands: 0,
        pfrHands: 0,
        aggActions: 0,
        callActions: 0,
        handsWon: 0,
        netChips: 0,
        buyIn: 0,
        finalStack: 0,
        cashOut: 0,
      };
    }

    merged[key].handsDealt += player.handsDealt;
    merged[key].vpipHands += player.vpipHands;
    merged[key].pfrHands += player.pfrHands;
    merged[key].aggActions += player.aggActions;
    merged[key].callActions += player.callActions;
    merged[key].handsWon += player.handsWon;
    merged[key].netChips += player.netChips;
    merged[key].buyIn += player.buyIn;
    merged[key].finalStack += player.finalStack;
    merged[key].cashOut += player.cashOut;
  }

  return Object.values(merged);
}

export default function PokerStats() {
  const [stats, setStats] = useState<PlayerStats[] | null>(null);
  const [rawStats, setRawStats] = useState<PlayerStats[] | null>(null);
  const [aliasGroups, setAliasGroups] = useState<string[][]>([]);
  const [aliasModalOpen, setAliasModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("netChips");
  const [sortAsc, setSortAsc] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setError(null);
    setStats(null);
    setRawStats(null);
    setAliasModalOpen(false);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const result = parsePokerLog(text);
        if (result.length === 0) {
          setError("No player data found. Make sure the file is a valid poker log.");
          return;
        }
        const canonical = autoMergeSameBaseNamePlayers(result);
        setRawStats(canonical);
        setAliasGroups(canonical.map((p) => [p.name]));
        setStats(canonical);
      } catch (err) {
        setError("Failed to parse the log file. " + String(err));
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function applyAliases(groups: string[][]) {
    if (!rawStats) return;
    setAliasGroups(groups);
    setStats(mergeAliasedStats(rawStats, groups));
    setAliasModalOpen(false);
  }

  function skipAliases() {
    setAliasModalOpen(false);
  }

  function clearAll() {
    setStats(null);
    setRawStats(null);
    setAliasGroups([]);
    setAliasModalOpen(false);
    setError(null);
    setDragging(false);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setDragging(false), []);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(key === "name");
    }
  }

  const sorted = stats
    ? [...stats].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (typeof av === "string" && typeof bv === "string") {
          return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        }
        const an = av as number;
        const bn = bv as number;
        return sortAsc ? an - bn : bn - an;
      })
    : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-sans">
      <h1 className="text-2xl font-bold mb-1 text-green-400">♠ Poker Fish</h1>
      {!rawStats ? (
        <>
          <p className="text-zinc-400 text-sm mb-6">
            Upload a Poker Now hand history log to see per-player stats.
          </p>
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload poker log file"
            className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-10 cursor-pointer transition-colors
              ${dragging ? "border-green-400 bg-green-950/30" : "border-zinc-700 hover:border-zinc-500 bg-zinc-900"}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          >
            <svg className="w-10 h-10 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 16v-8m0 0-3 3m3-3 3 3M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
            </svg>
            <span className="text-zinc-400 text-sm">
              {dragging ? "Drop to parse…" : "Drop your CSV / log file here, or click to browse"}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.txt,.log"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clearAll}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => {
              if (!stats) return;
              const sorted = [...stats].sort((a, b) => b.netChips - a.netChips);
              const text = sorted
                .map((p) => {
                  const n = p.netChips;
                  const formatted = (Math.abs(n) >= 1000
                    ? (n < 0 ? "-" : "+") + Math.abs(n).toLocaleString("en-US")
                    : (n >= 0 ? "+" : "") + n.toLocaleString("en-US"));
                  return `${displayName(p.name)}: ${formatted}`;
                })
                .join("\n");
              navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="w-32 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
          >
            {copied ? "✓ Copied!" : "Copy Ledger"}
          </button>
          <button
            type="button"
            onClick={() => setAliasModalOpen(true)}
            className="rounded-lg bg-green-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-green-400"
          >
            Group Same Players
          </button>
        </div>
      )}

      {error && (
        <p className="mt-4 text-red-400 text-sm bg-red-950/40 border border-red-800 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <PlayerAliasModal
        open={aliasModalOpen && !!rawStats}
        players={rawStats ? rawStats.map((p) => p.name) : []}
        initialGroups={aliasGroups}
        onDone={applyAliases}
        onSkip={skipAliases}
      />

      {sorted && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-900 text-zinc-400 uppercase text-xs tracking-wider">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    title={col.title}
                    onClick={() => toggleSort(col.key)}
                    className={`px-4 py-3 cursor-pointer select-none whitespace-nowrap text-left transition-colors hover:text-zinc-100
                      ${sortKey === col.key ? "text-green-400" : ""}`}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span className="ml-1">{sortAsc ? "▲" : "▼"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => (
                <tr
                  key={p.name}
                  className={`border-t border-zinc-800 transition-colors hover:bg-zinc-800/50
                    ${i % 2 === 0 ? "bg-zinc-900/40" : "bg-zinc-900/10"}`}
                >
                  <td className="px-4 py-3 font-medium text-zinc-100 whitespace-nowrap">
                    {displayName(p.name)}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{p.handsDealt}</td>
                  <td className="px-4 py-3 tabular-nums text-zinc-300">{p.buyIn}</td>
                  <td className="px-4 py-3 tabular-nums text-zinc-300">{p.cashOut}</td>
                  <td className="px-4 py-3 tabular-nums text-zinc-300">{p.finalStack}</td>
                  <td
                    className={`px-4 py-3 font-semibold tabular-nums ${
                      p.netChips > 0
                        ? "text-green-400"
                        : p.netChips < 0
                        ? "text-red-400"
                        : "text-zinc-400"
                    }`}
                  >
                    {sign(p.netChips)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-zinc-300">
                    {pct(p.vpipHands, p.handsDealt)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-zinc-300">
                    {pct(p.pfrHands, p.handsDealt)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-zinc-300">
                    {af(p.aggActions, p.callActions)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-zinc-300">
                    {p.handsWon}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 bg-zinc-900 border-t border-zinc-800 text-xs text-zinc-500">
            {sorted.length} players · click a column header to sort
          </div>
        </div>
      )}

      {sorted && (
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-zinc-500 sm:grid-cols-3 lg:grid-cols-6">
          <div><span className="text-zinc-400 font-medium">Buy-in</span> — total chips bought in (incl. rebuys)</div>
          <div><span className="text-zinc-400 font-medium">Cash Out</span> — chips removed by stack adjustment</div>
          <div><span className="text-zinc-400 font-medium">Final</span> — chip stack at end of session</div>
          <div><span className="text-zinc-400 font-medium">Net</span> — final minus buy-in</div>
          <div><span className="text-zinc-400 font-medium">VPIP%</span> — voluntarily put money in pot preflop</div>
          <div><span className="text-zinc-400 font-medium">PFR%</span> — preflop raise %</div>
          <div><span className="text-zinc-400 font-medium">AF</span> — aggression factor (bets+raises / calls)</div>
          <div><span className="text-zinc-400 font-medium">Won</span> — times collected from pot</div>
        </div>
      )}
    </div>
  );
}
