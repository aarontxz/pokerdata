"use client";

import { useState, useCallback, useRef } from "react";
import {
  type CBetRecord,
  type HandReference,
  mergePokerLogResults,
  parsePokerLogDetailed,
  type PokerLogParseResult,
  type PlayerStats,
  type PreflopRaiseRecord,
} from "../lib/pokerParser";
import PlayerAliasModal from "./PlayerAliasModal";
import PlayerCBetModal from "./PlayerCBetModal";
import PlayerRaiseModal from "./PlayerRaiseModal";
import PlayerSeeFlopModal from "./PlayerSeeFlopModal";

type SortKey = keyof PlayerStats;

function baseName(name: string): string {
  const at = name.indexOf("@");
  if (at === -1) return name.trim();
  return name.slice(0, at).trim();
}

function displayName(name: string): string {
  return baseName(name);
}

/** Like displayName but also strips the ` (#N)` session tag added during multi-session merges. */
function coreDisplayName(name: string): string {
  return displayName(name).replace(/\s*\(#\d+\)\s*$/, "").trim();
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

type RaiseMap = Record<string, PreflopRaiseRecord[]>;
type CBetMap = Record<string, CBetRecord[]>;
type HandNumberMap = Record<string, HandReference[]>;
type UploadMode = "replace" | "append";

const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: "name", label: "Player", title: "Player name" },
  { key: "handsDealt", label: "Hands", title: "Hands dealt" },
  { key: "buyIn", label: "Buy-in", title: "Total chips bought in" },
  { key: "cashOut", label: "Cash Out", title: "Chips removed from table" },
  { key: "finalStack", label: "Final", title: "Final chip stack" },
  { key: "netChips", label: "Net", title: "Net chip gain/loss" },
  { key: "sawFlopHands", label: "See Flop%", title: "Did not fold preflop %" },
  { key: "vpipHands", label: "VPIP%", title: "Voluntarily Put money In Pot %" },
  { key: "pfrHands", label: "PFR%", title: "Preflop Raise %" },
  { key: "cbetHands", label: "CBet%", title: "Flop continuation bet % (after being last preflop aggressor)" },
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
        : [...new Set(group.map((name) => coreDisplayName(name)))].join(" / ");
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
        cbetHands: 0,
        cbetOpportunities: 0,
        sawFlopHands: 0,
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
    merged[alias].cbetHands += player.cbetHands;
    merged[alias].cbetOpportunities += player.cbetOpportunities;
    merged[alias].sawFlopHands += player.sawFlopHands;
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
        cbetHands: 0,
        cbetOpportunities: 0,
        sawFlopHands: 0,
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
    merged[key].cbetHands += player.cbetHands;
    merged[key].cbetOpportunities += player.cbetOpportunities;
    merged[key].sawFlopHands += player.sawFlopHands;
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

function autoMergeSameBaseNameRaises(raw: RaiseMap): RaiseMap {
  const merged: RaiseMap = {};
  for (const [name, records] of Object.entries(raw)) {
    const key = baseName(name);
    if (!merged[key]) merged[key] = [];
    merged[key].push(...records);
  }
  for (const key of Object.keys(merged)) {
    merged[key].sort((a, b) => a.handNumber - b.handNumber);
  }
  return merged;
}

function mergeAliasedRaises(raw: RaiseMap, groups: string[][]): RaiseMap {
  const aliasByName: Record<string, string> = {};
  const labelByAlias: Record<string, string> = {};

  for (const group of groups) {
    if (group.length === 0) continue;
    const alias = group[0];
    const label =
      group.length === 1
        ? displayName(alias)
        : [...new Set(group.map((name) => coreDisplayName(name)))].join(" / ");
    for (const name of group) {
      aliasByName[name] = alias;
    }
    labelByAlias[alias] = label;
  }

  const merged: RaiseMap = {};
  for (const [name, records] of Object.entries(raw)) {
    const alias = aliasByName[name] ?? name;
    const label = labelByAlias[alias] ?? displayName(alias);
    if (!merged[label]) merged[label] = [];
    merged[label].push(...records);
  }

  for (const key of Object.keys(merged)) {
    merged[key].sort((a, b) => a.handNumber - b.handNumber);
  }

  return merged;
}

function autoMergeSameBaseNameCBets(raw: CBetMap): CBetMap {
  const merged: CBetMap = {};
  for (const [name, records] of Object.entries(raw)) {
    const key = baseName(name);
    if (!merged[key]) merged[key] = [];
    merged[key].push(...records);
  }
  for (const key of Object.keys(merged)) {
    merged[key].sort((a, b) => a.sessionNumber - b.sessionNumber || a.handNumber - b.handNumber);
  }
  return merged;
}

function mergeAliasedCBets(raw: CBetMap, groups: string[][]): CBetMap {
  const aliasByName: Record<string, string> = {};
  const labelByAlias: Record<string, string> = {};

  for (const group of groups) {
    if (group.length === 0) continue;
    const alias = group[0];
    const label =
      group.length === 1
        ? displayName(alias)
        : [...new Set(group.map((name) => coreDisplayName(name)))].join(" / ");
    for (const name of group) {
      aliasByName[name] = alias;
    }
    labelByAlias[alias] = label;
  }

  const merged: CBetMap = {};
  for (const [name, records] of Object.entries(raw)) {
    const alias = aliasByName[name] ?? name;
    const label = labelByAlias[alias] ?? displayName(alias);
    if (!merged[label]) merged[label] = [];
    merged[label].push(...records);
  }

  for (const key of Object.keys(merged)) {
    merged[key].sort((a, b) => a.sessionNumber - b.sessionNumber || a.handNumber - b.handNumber);
  }

  return merged;
}

function autoMergeSameBaseNameHandNumbers(raw: HandNumberMap): HandNumberMap {
  const merged: HandNumberMap = {};
  for (const [name, handRefs] of Object.entries(raw)) {
    const key = baseName(name);
    if (!merged[key]) merged[key] = [];
    merged[key].push(...handRefs);
  }
  for (const key of Object.keys(merged)) {
    merged[key].sort((a, b) => a.sessionNumber - b.sessionNumber || a.handNumber - b.handNumber);
  }
  return merged;
}

function mergeAliasedHandNumbers(raw: HandNumberMap, groups: string[][]): HandNumberMap {
  const aliasByName: Record<string, string> = {};
  const labelByAlias: Record<string, string> = {};

  for (const group of groups) {
    if (group.length === 0) continue;
    const alias = group[0];
    const label =
      group.length === 1
        ? displayName(alias)
        : [...new Set(group.map((name) => coreDisplayName(name)))].join(" / ");
    for (const name of group) {
      aliasByName[name] = alias;
    }
    labelByAlias[alias] = label;
  }

  const merged: HandNumberMap = {};
  for (const [name, handRefs] of Object.entries(raw)) {
    const alias = aliasByName[name] ?? name;
    const label = labelByAlias[alias] ?? displayName(alias);
    if (!merged[label]) merged[label] = [];
    merged[label].push(...handRefs);
  }

  for (const key of Object.keys(merged)) {
    merged[key].sort((a, b) => a.sessionNumber - b.sessionNumber || a.handNumber - b.handNumber);
  }

  return merged;
}

function extendAliasGroups(existingGroups: string[][], playerNames: string[]): string[][] {
  const remainingNames = new Set(playerNames);
  const nextGroups = existingGroups
    .map((group) => group.filter((name) => remainingNames.has(name)))
    .filter((group) => group.length > 0);

  for (const group of nextGroups) {
    for (const name of group) {
      remainingNames.delete(name);
    }
  }

  for (const name of playerNames) {
    if (remainingNames.has(name)) {
      nextGroups.push([name]);
      remainingNames.delete(name);
    }
  }

  return nextGroups;
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve((event.target?.result as string) ?? "");
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
    reader.readAsText(file, "utf-8");
  });
}

function normalizeForMatch(name: string): string {
  const baseDisplayName = displayName(name).replace(/\s*\(#\d+\)\s*/, "");
  return baseDisplayName.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) {
      prev[j] = curr[j];
    }
  }

  return prev[b.length];
}

function isSimilarName(a: string, b: string): boolean {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const minLen = Math.min(na.length, nb.length);
  if (minLen >= 4 && (na.includes(nb) || nb.includes(na))) return true;

  const dist = levenshtein(na, nb);
  if (minLen <= 5) return dist <= 1;
  return dist <= 2;
}

function autoGroupBySimilarity(names: string[]): string[][] {
  const sortedNames = names.slice().sort((a, b) => a.localeCompare(b));
  if (sortedNames.length <= 1) return sortedNames.map((name) => [name]);

  const parent = sortedNames.map((_, idx) => idx);

  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }

  for (let i = 0; i < sortedNames.length; i += 1) {
    for (let j = i + 1; j < sortedNames.length; j += 1) {
      if (isSimilarName(sortedNames[i], sortedNames[j])) {
        union(i, j);
      }
    }
  }

  const groupsByRoot: Record<number, string[]> = {};
  for (let i = 0; i < sortedNames.length; i += 1) {
    const root = find(i);
    if (!groupsByRoot[root]) groupsByRoot[root] = [];
    groupsByRoot[root].push(sortedNames[i]);
  }

  return Object.values(groupsByRoot)
    .map((group) => group.sort((a, b) => a.localeCompare(b)))
    .sort((a, b) => a[0].localeCompare(b[0]));
}

export default function PokerStats() {
  const [stats, setStats] = useState<PlayerStats[] | null>(null);
  const [rawStats, setRawStats] = useState<PlayerStats[] | null>(null);
  const [rawPreflopRaises, setRawPreflopRaises] = useState<RaiseMap | null>(null);
  const [preflopRaises, setPreflopRaises] = useState<RaiseMap | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [rawCbetRecords, setRawCbetRecords] = useState<CBetMap | null>(null);
  const [cbetRecords, setCbetRecords] = useState<CBetMap | null>(null);
  const [selectedCbetPlayer, setSelectedCbetPlayer] = useState<string | null>(null);
  const [rawSawFlopHands, setRawSawFlopHands] = useState<HandNumberMap | null>(null);
  const [rawNoFlopHands, setRawNoFlopHands] = useState<HandNumberMap | null>(null);
  const [sawFlopHands, setSawFlopHands] = useState<HandNumberMap | null>(null);
  const [noFlopHands, setNoFlopHands] = useState<HandNumberMap | null>(null);
  const [selectedSeeFlopPlayer, setSelectedSeeFlopPlayer] = useState<string | null>(null);
  const [aliasGroups, setAliasGroups] = useState<string[][]>([]);
  const [aliasModalOpen, setAliasModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [loadedSessions, setLoadedSessions] = useState<PokerLogParseResult[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("netChips");
  const [sortAsc, setSortAsc] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadModeRef = useRef<UploadMode>("replace");

  const handleFiles = useCallback(async (files: FileList | File[], mode: UploadMode = "replace") => {
    const selectedFiles = Array.from(files);
    if (selectedFiles.length === 0) return;

    setError(null);
    setIsParsing(true);
    if (mode === "replace") {
      setStats(null);
      setRawStats(null);
      setRawPreflopRaises(null);
      setPreflopRaises(null);
      setRawCbetRecords(null);
      setCbetRecords(null);
      setRawSawFlopHands(null);
      setRawNoFlopHands(null);
      setSawFlopHands(null);
      setNoFlopHands(null);
    }
    setSelectedPlayer(null);
    setSelectedCbetPlayer(null);
    setSelectedSeeFlopPlayer(null);
    setAliasModalOpen(false);

    try {
      const parsedResults = await Promise.all(
        selectedFiles.map(async (file) => {
          const rawText = await readFileText(file);
          const text = rawText.split("\n").slice(0).join("\n");
          const parsed = parsePokerLogDetailed(text);

          if (parsed.players.length === 0) {
            throw new Error(`${file.name}: no player data found. Make sure the file is a valid poker log.`);
          }

          return parsed;
        }),
      );

      const nextSessions = mode === "append" ? [...loadedSessions, ...parsedResults] : parsedResults;
      const mergedParsed = mergePokerLogResults(nextSessions);
      const canonical = autoMergeSameBaseNamePlayers(mergedParsed.players);
      const canonicalRaises = autoMergeSameBaseNameRaises(mergedParsed.preflopRaisesByPlayer);
      const canonicalCBets = autoMergeSameBaseNameCBets(mergedParsed.cbetRecordsByPlayer);
      const canonicalSawFlopHands = autoMergeSameBaseNameHandNumbers(mergedParsed.sawFlopHandsByPlayer);
      const canonicalNoFlopHands = autoMergeSameBaseNameHandNumbers(mergedParsed.noFlopHandsByPlayer);
      const nextAliasGroups = mode === "append"
        ? extendAliasGroups(aliasGroups, canonical.map((p) => p.name))
        : canonical.map((p) => [p.name]);

      setRawStats(canonical);
      setRawPreflopRaises(canonicalRaises);
        setRawCbetRecords(canonicalCBets);
      setRawSawFlopHands(canonicalSawFlopHands);
      setRawNoFlopHands(canonicalNoFlopHands);
  setLoadedSessions(nextSessions);
      setAliasGroups(nextAliasGroups);
      setStats(mergeAliasedStats(canonical, nextAliasGroups));
      setPreflopRaises(mergeAliasedRaises(canonicalRaises, nextAliasGroups));
        setCbetRecords(mergeAliasedCBets(canonicalCBets, nextAliasGroups));
      setSawFlopHands(mergeAliasedHandNumbers(canonicalSawFlopHands, nextAliasGroups));
      setNoFlopHands(mergeAliasedHandNumbers(canonicalNoFlopHands, nextAliasGroups));
    } catch (err) {
      setError("Failed to parse the selected files. " + String(err));
    } finally {
      setIsParsing(false);
      uploadModeRef.current = "replace";
    }
  }, [aliasGroups, loadedSessions]);

  function applyAliases(groups: string[][]) {
    if (!rawStats) return;
    setAliasGroups(groups);
    setStats(mergeAliasedStats(rawStats, groups));
    if (rawPreflopRaises) {
      setPreflopRaises(mergeAliasedRaises(rawPreflopRaises, groups));
    }
    if (rawCbetRecords) {
      setCbetRecords(mergeAliasedCBets(rawCbetRecords, groups));
    }
    if (rawSawFlopHands) {
      setSawFlopHands(mergeAliasedHandNumbers(rawSawFlopHands, groups));
    }
    if (rawNoFlopHands) {
      setNoFlopHands(mergeAliasedHandNumbers(rawNoFlopHands, groups));
    }
    setSelectedPlayer(null);
    setSelectedCbetPlayer(null);
    setSelectedSeeFlopPlayer(null);
    setAliasModalOpen(false);
  }

  function skipAliases() {
    setAliasModalOpen(false);
  }

  function autoGroupPlayers() {
    if (!rawStats) return;
    const groups = autoGroupBySimilarity(rawStats.map((p) => p.name));
    setAliasGroups(groups);
    setStats(mergeAliasedStats(rawStats, groups));
    if (rawPreflopRaises) {
      setPreflopRaises(mergeAliasedRaises(rawPreflopRaises, groups));
    }
    if (rawCbetRecords) {
      setCbetRecords(mergeAliasedCBets(rawCbetRecords, groups));
    }
    if (rawSawFlopHands) {
      setSawFlopHands(mergeAliasedHandNumbers(rawSawFlopHands, groups));
    }
    if (rawNoFlopHands) {
      setNoFlopHands(mergeAliasedHandNumbers(rawNoFlopHands, groups));
    }
    setSelectedPlayer(null);
    setSelectedCbetPlayer(null);
    setSelectedSeeFlopPlayer(null);
    setAliasModalOpen(false);
  }

  function clearAll() {
    setStats(null);
    setRawStats(null);
    setRawPreflopRaises(null);
    setPreflopRaises(null);
    setSelectedPlayer(null);
    setRawCbetRecords(null);
    setCbetRecords(null);
    setSelectedCbetPlayer(null);
    setRawSawFlopHands(null);
    setRawNoFlopHands(null);
    setSawFlopHands(null);
    setNoFlopHands(null);
    setSelectedSeeFlopPlayer(null);
    setAliasGroups([]);
    setAliasModalOpen(false);
    setError(null);
    setDragging(false);
    setIsParsing(false);
    setLoadedSessions([]);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

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

  const getSortValue = (player: PlayerStats, key: SortKey): number | string => {
    if (key === "vpipHands") {
      return player.handsDealt === 0 ? 0 : (player.vpipHands / player.handsDealt) * 100;
    }
    if (key === "pfrHands") {
      return player.handsDealt === 0 ? 0 : (player.pfrHands / player.handsDealt) * 100;
    }
    if (key === "cbetHands") {
      return player.cbetOpportunities === 0 ? 0 : (player.cbetHands / player.cbetOpportunities) * 100;
    }
    if (key === "sawFlopHands") {
      return player.handsDealt === 0 ? 0 : (player.sawFlopHands / player.handsDealt) * 100;
    }
    if (key === "aggActions") {
      return player.callActions === 0 ? (player.aggActions > 0 ? Infinity : 0) : player.aggActions / player.callActions;
    }
    return player[key];
  };

  const sorted = stats
    ? [...stats].sort((a, b) => {
        const av = getSortValue(a, sortKey);
        const bv = getSortValue(b, sortKey);
        if (typeof av === "string" && typeof bv === "string") {
          return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        }
        const an = av as number;
        const bn = bv as number;
        return sortAsc ? an - bn : bn - an;
      })
    : null;

  const selectedRaises = selectedPlayer && preflopRaises
    ? (preflopRaises[selectedPlayer] ?? []).filter((r) => r.holeCards !== null)
    : [];

  const selectedCBets = selectedCbetPlayer && cbetRecords
    ? cbetRecords[selectedCbetPlayer] ?? []
    : [];

  const selectedSawFlopHands = selectedSeeFlopPlayer && sawFlopHands
    ? sawFlopHands[selectedSeeFlopPlayer] ?? []
    : [];

  const selectedNoFlopHands = selectedSeeFlopPlayer && noFlopHands
    ? noFlopHands[selectedSeeFlopPlayer] ?? []
    : [];

  function renderCell(player: PlayerStats, key: SortKey) {
    if (key === "name") {
      return <span className="font-medium text-zinc-100 whitespace-nowrap">{displayName(player.name)}</span>;
    }

    if (key === "handsDealt") {
      return <span className="text-zinc-300">{player.handsDealt}</span>;
    }

    if (key === "buyIn" || key === "cashOut" || key === "finalStack") {
      return <span className="tabular-nums text-zinc-300">{player[key]}</span>;
    }

    if (key === "netChips") {
      return (
        <span
          className={`font-semibold tabular-nums ${
            player.netChips > 0
              ? "text-green-400"
              : player.netChips < 0
              ? "text-red-400"
              : "text-zinc-400"
          }`}
        >
          {sign(player.netChips)}
        </span>
      );
    }

    if (key === "sawFlopHands") {
      return (
        <button
          type="button"
          onClick={() => setSelectedSeeFlopPlayer(player.name)}
          className={`rounded px-1 tabular-nums transition-colors hover:text-green-300 ${
            selectedSeeFlopPlayer === player.name ? "text-green-300" : "text-zinc-300"
          }`}
          title="Show hand numbers for saw flop vs did not see flop"
        >
          {pct(player.sawFlopHands, player.handsDealt)}
        </button>
      );
    }

    if (key === "vpipHands") {
      return <span className="tabular-nums text-zinc-300">{pct(player.vpipHands, player.handsDealt)}</span>;
    }

    if (key === "pfrHands") {
      return (
        <button
          type="button"
          onClick={() => setSelectedPlayer(player.name)}
          className={`rounded px-1 tabular-nums transition-colors hover:text-green-300 ${
            selectedPlayer === player.name ? "text-green-300" : "text-zinc-300"
          }`}
          title="Show preflop raises and revealed cards"
        >
          {pct(player.pfrHands, player.handsDealt)}
        </button>
      );
    }

    if (key === "cbetHands") {
      return (
        <button
          type="button"
          onClick={() => setSelectedCbetPlayer(player.name)}
          className={`rounded px-1 tabular-nums transition-colors hover:text-green-300 ${
            selectedCbetPlayer === player.name ? "text-green-300" : "text-zinc-300"
          }`}
          title="Show continuation bets with hole cards and flop cards"
        >
          {pct(player.cbetHands, player.cbetOpportunities)}
        </button>
      );
    }

    if (key === "aggActions") {
      return <span className="tabular-nums text-zinc-300">{af(player.aggActions, player.callActions)}</span>;
    }

    if (key === "handsWon") {
      return <span className="tabular-nums text-zinc-300">{player.handsWon}</span>;
    }

    return <span className="text-zinc-300">{String(player[key])}</span>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-sans">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt,.log"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void handleFiles(e.target.files, uploadModeRef.current);
          }
          e.target.value = "";
        }}
      />

      <h1 className="text-2xl font-bold mb-1 text-green-400">♠ Poker Fish</h1>
      {!rawStats ? (
        <>
          <p className="text-zinc-400 text-sm mb-6">
            Upload one or more Poker Now hand history logs to see combined per-player stats.
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
              {isParsing
                ? "Parsing selected files..."
                : dragging
                ? "Drop to parse..."
                : "Drop your CSV / log files here, or click to browse"}
            </span>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAliasModalOpen(true)}
              className="rounded-lg border border-green-700 bg-green-950/40 px-3 py-2 text-sm font-semibold text-green-300 hover:bg-green-900/40"
            >
              Manually Group Same Players
            </button>
            <button
              type="button"
              onClick={autoGroupPlayers}
              className="rounded-lg bg-green-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-green-400"
            >
              Auto Group
            </button>
            <button
              type="button"
              onClick={() => {
                uploadModeRef.current = "append";
                inputRef.current?.click();
              }}
              className="rounded-lg border border-sky-700 bg-sky-950/40 px-3 py-2 text-sm font-semibold text-sky-300 hover:bg-sky-900/40"
            >
              Add More Files
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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
              className="w-32 rounded-lg border border-blue-700 bg-blue-950/40 px-3 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-900/40"
            >
              {copied ? "✓ Copied!" : "Copy Ledger"}
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="rounded-lg border border-red-700 bg-red-950/40 px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-900/40"
            >
              Clear
            </button>
          </div>
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
                  {COLUMNS.map((col) => (
                    <td
                      key={String(col.key)}
                      className={`px-4 py-3 ${col.key === "name" ? "whitespace-nowrap" : ""}`}
                    >
                      {renderCell(p, col.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 bg-zinc-900 border-t border-zinc-800 text-xs text-zinc-500">
            {sorted.length} players · click a column header to sort
          </div>
        </div>
      )}

      <PlayerRaiseModal
        open={!!selectedPlayer}
        playerName={selectedPlayer ? displayName(selectedPlayer) : ""}
        raises={selectedRaises}
        onClose={() => setSelectedPlayer(null)}
        sessionCount={loadedSessions.length}
      />

      <PlayerSeeFlopModal
        open={!!selectedSeeFlopPlayer}
        playerName={selectedSeeFlopPlayer ? displayName(selectedSeeFlopPlayer) : ""}
        sawFlopHands={selectedSawFlopHands}
        noFlopHands={selectedNoFlopHands}
        onClose={() => setSelectedSeeFlopPlayer(null)}
        sessionCount={loadedSessions.length}
      />

      <PlayerCBetModal
        open={!!selectedCbetPlayer}
        playerName={selectedCbetPlayer ? displayName(selectedCbetPlayer) : ""}
        cbets={selectedCBets}
        onClose={() => setSelectedCbetPlayer(null)}
        sessionCount={loadedSessions.length}
      />

      {sorted && (
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-zinc-500 sm:grid-cols-3 lg:grid-cols-6">
          <div><span className="text-zinc-400 font-medium">Buy-in</span> — total chips bought in (incl. rebuys)</div>
          <div><span className="text-zinc-400 font-medium">Cash Out</span> — chips removed by stack adjustment</div>
          <div><span className="text-zinc-400 font-medium">Final</span> — chip stack at end of session</div>
          <div><span className="text-zinc-400 font-medium">Net</span> — final minus buy-in</div>
          <div><span className="text-zinc-400 font-medium">VPIP%</span> — voluntarily put money in pot preflop</div>
          <div><span className="text-zinc-400 font-medium">PFR%</span> — preflop raise %</div>
          <div><span className="text-zinc-400 font-medium">CBet%</span> — flop bet/raise after being last preflop aggressor</div>
          <div><span className="text-zinc-400 font-medium">See Flop%</span> — did not fold preflop / hands played</div>
          <div><span className="text-zinc-400 font-medium">AF</span> — aggression factor (bets+raises / calls)</div>
          <div><span className="text-zinc-400 font-medium">Won</span> — times collected from pot</div>
        </div>
      )}
    </div>
  );
}
