"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  type CBetRecord,
  type HandReference,
  getPartialSession,
  mergePokerLogResults,
  parsePokerLogDetailed,
  type PokerLogParseResult,
  type PlayerStats,
  type PreflopRaiseRecord,
  type WSDRecord,
} from "../lib/pokerParser";
import type { SnapshotPayload } from "../lib/snapshotTypes";
import PlayerAliasModal from "./PlayerAliasModal";
import PlayerCBetModal from "./PlayerCBetModal";
import PlayerNemesisModal from "./PlayerNemesisModal";
import PlayerRaiseModal from "./PlayerRaiseModal";
import PlayerSeeFlopModal from "./PlayerSeeFlopModal";
import PlayerWSDModal from "./PlayerWSDModal";
import { SuitText } from "./CardText";
import HandReplayPanel from "./HandReplayPanel";
import NetChipsChart from "./NetChipsChart";

type SortKey = keyof PlayerStats | "nemesis";

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

function displayNameOptions(name: string): string[] {
  const aliases = baseName(name)
    .split(" / ")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return aliases.length > 0 ? aliases : [baseName(name)];
}

function selectedDisplayName(name: string, selectedName: string | undefined): string {
  const options = displayNameOptions(name);
  if (selectedName && options.includes(selectedName)) return selectedName;
  return options[0];
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

function tableBubbleClassName(options?: { active?: boolean; tone?: "green" | "neutral" }) {
  const active = options?.active ?? false;
  const tone = options?.tone ?? "green";

  if (tone === "neutral") {
    return active
      ? "inline-flex items-center rounded-full border border-zinc-500 bg-zinc-800/80 px-2 py-0.5 transition-colors"
      : "inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900/70 px-2 py-0.5 transition-colors hover:border-zinc-500 hover:bg-zinc-800/80";
  }

  return active
    ? "inline-flex items-center rounded-full border border-green-500/50 bg-green-500/10 px-2 py-0.5 transition-colors"
    : "inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900/70 px-2 py-0.5 transition-colors hover:border-green-500/40 hover:bg-green-500/5";
}

type RaiseMap = Record<string, PreflopRaiseRecord[]>;
type CBetMap = Record<string, CBetRecord[]>;
type HandNumberMap = Record<string, HandReference[]>;
type WSDMap = Record<string, WSDRecord[]>;
type H2HMap = Record<string, Record<string, number>>;
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
  { key: "wsdHands", label: "WSD%", title: "Won at Showdown % (outright showdowns won / showdowns reached). Split pots count as draws, not wins. Showdown = called or got called on the river." },
  { key: "aggActions", label: "AF", title: "Aggression Factor = (bets+raises) / calls" },
  { key: "handsWon", label: "Won", title: "Hands collected from pot" },
];

function mergeAliasedStats(raw: PlayerStats[], groups: string[][]): PlayerStats[] {
  const aliasByName: Record<string, string> = {};

  for (const group of groups) {
    if (group.length === 0) continue;
    const alias = group[0];
    for (const name of group) {
      aliasByName[name] = alias;
    }
  }

  const merged: Record<string, PlayerStats> = {};

  for (const player of raw) {
    const alias = aliasByName[player.name] ?? player.name;
    if (!merged[alias]) {
      merged[alias] = {
        name: alias,
        handsDealt: 0,
        vpipHands: 0,
        pfrHands: 0,
        cbetHands: 0,
        cbetOpportunities: 0,
        sawFlopHands: 0,
        aggActions: 0,
        callActions: 0,
        handsWon: 0,
        wsdHands: 0,
        wsdWins: 0,
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
    merged[alias].wsdHands += player.wsdHands;
    merged[alias].wsdWins += player.wsdWins;
    merged[alias].netChips += player.netChips;
    merged[alias].buyIn += player.buyIn;
    merged[alias].finalStack += player.finalStack;
    merged[alias].cashOut += player.cashOut;
  }

  return Object.values(merged);
}

function autoMergeSameBaseNamePlayers(raw: PlayerStats[]): PlayerStats[] {
  return raw.map((player) => ({ ...player }));
}

function autoMergeSameBaseNameRaises(raw: RaiseMap): RaiseMap {
  const merged: RaiseMap = {};
  for (const [name, records] of Object.entries(raw)) {
    merged[name] = [...records];
  }
  for (const key of Object.keys(merged)) {
    merged[key].sort((a, b) => a.handNumber - b.handNumber);
  }
  return merged;
}

function mergeAliasedRaises(raw: RaiseMap, groups: string[][]): RaiseMap {
  const aliasByName: Record<string, string> = {};

  for (const group of groups) {
    if (group.length === 0) continue;
    const alias = group[0];
    for (const name of group) {
      aliasByName[name] = alias;
    }
  }

  const merged: RaiseMap = {};
  for (const [name, records] of Object.entries(raw)) {
    const alias = aliasByName[name] ?? name;
    if (!merged[alias]) merged[alias] = [];
    merged[alias].push(...records);
  }

  for (const key of Object.keys(merged)) {
    merged[key].sort((a, b) => a.handNumber - b.handNumber);
  }

  return merged;
}

function autoMergeSameBaseNameCBets(raw: CBetMap): CBetMap {
  const merged: CBetMap = {};
  for (const [name, records] of Object.entries(raw)) {
    merged[name] = [...records];
  }
  for (const key of Object.keys(merged)) {
    merged[key].sort((a, b) => a.sessionNumber - b.sessionNumber || a.handNumber - b.handNumber);
  }
  return merged;
}

function mergeAliasedCBets(raw: CBetMap, groups: string[][]): CBetMap {
  const aliasByName: Record<string, string> = {};

  for (const group of groups) {
    if (group.length === 0) continue;
    const alias = group[0];
    for (const name of group) {
      aliasByName[name] = alias;
    }
  }

  const merged: CBetMap = {};
  for (const [name, records] of Object.entries(raw)) {
    const alias = aliasByName[name] ?? name;
    if (!merged[alias]) merged[alias] = [];
    merged[alias].push(...records);
  }

  for (const key of Object.keys(merged)) {
    merged[key].sort((a, b) => a.sessionNumber - b.sessionNumber || a.handNumber - b.handNumber);
  }

  return merged;
}

function autoMergeSameBaseNameHandNumbers(raw: HandNumberMap): HandNumberMap {
  const merged: HandNumberMap = {};
  for (const [name, handRefs] of Object.entries(raw)) {
    merged[name] = [...handRefs];
  }
  for (const key of Object.keys(merged)) {
    merged[key].sort((a, b) => a.sessionNumber - b.sessionNumber || a.handNumber - b.handNumber);
  }
  return merged;
}

function mergeAliasedHandNumbers(raw: HandNumberMap, groups: string[][]): HandNumberMap {
  const aliasByName: Record<string, string> = {};

  for (const group of groups) {
    if (group.length === 0) continue;
    const alias = group[0];
    for (const name of group) {
      aliasByName[name] = alias;
    }
  }

  const merged: HandNumberMap = {};
  for (const [name, handRefs] of Object.entries(raw)) {
    const alias = aliasByName[name] ?? name;
    if (!merged[alias]) merged[alias] = [];
    merged[alias].push(...handRefs);
  }

  for (const key of Object.keys(merged)) {
    merged[key].sort((a, b) => a.sessionNumber - b.sessionNumber || a.handNumber - b.handNumber);
  }

  return merged;
}

function autoMergeSameBaseNameWSD(raw: WSDMap): WSDMap {
  const merged: WSDMap = {};
  for (const [name, records] of Object.entries(raw)) {
    merged[name] = [...records];
  }
  for (const key of Object.keys(merged)) {
    merged[key].sort((a, b) => a.sessionNumber - b.sessionNumber || a.handNumber - b.handNumber);
  }
  return merged;
}

function mergeAliasedWSD(raw: WSDMap, groups: string[][]): WSDMap {
  const aliasByName: Record<string, string> = {};

  for (const group of groups) {
    if (group.length === 0) continue;
    const alias = group[0];
    for (const name of group) {
      aliasByName[name] = alias;
    }
  }

  const merged: WSDMap = {};
  for (const [name, records] of Object.entries(raw)) {
    const alias = aliasByName[name] ?? name;
    if (!merged[alias]) merged[alias] = [];
    for (const rec of records) {
      merged[alias].push({
        ...rec,
        opponents: rec.opponents.map((opp) => ({
          ...opp,
          name: aliasByName[opp.name] ?? opp.name,
        })),
      });
    }
  }

  for (const key of Object.keys(merged)) {
    merged[key].sort((a, b) => a.sessionNumber - b.sessionNumber || a.handNumber - b.handNumber);
  }

  return merged;
}

function autoMergeSameBaseNameH2H(raw: H2HMap): H2HMap {
  const merged: H2HMap = {};
  for (const [name, opponents] of Object.entries(raw)) {
    merged[name] = { ...opponents };
  }
  return merged;
}

function mergeAliasedH2H(raw: H2HMap, groups: string[][]): H2HMap {
  const aliasByName: Record<string, string> = {};
  for (const group of groups) {
    if (group.length === 0) continue;
    const alias = group[0];
    for (const name of group) {
      aliasByName[name] = alias;
    }
  }

  const merged: H2HMap = {};
  for (const [name, opponents] of Object.entries(raw)) {
    const alias = aliasByName[name] ?? name;
    if (!merged[alias]) merged[alias] = {};
    for (const [oppName, amount] of Object.entries(opponents)) {
      const oppAlias = aliasByName[oppName] ?? oppName;
      if (oppAlias === alias) continue; // same player after merge — skip
      merged[alias][oppAlias] = Math.round(((merged[alias][oppAlias] ?? 0) + amount) * 10) / 10;
    }
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

function parseTimestampFromEventLine(line: string): string | null {
  if (line.includes("\t")) {
    const parts = line.split("\t");
    if (parts.length < 3) return null;
    return parts[1].trim();
  }

  const m = line.match(/^(.*),([^,]+),([^,]+)$/);
  if (!m) return null;
  return m[2].trim();
}

function parseActionFromEventLine(line: string): string | null {
  if (line.includes("\t")) {
    const parts = line.split("\t");
    if (parts.length < 3) return null;
    return parts[0].trim();
  }

  const m = line.match(/^(.*),([^,]+),([^,]+)$/);
  if (!m) return null;

  let action = m[1].trim();
  if (action.startsWith('"') && action.endsWith('"') && action.length >= 2) {
    action = action.slice(1, -1).replace(/""/g, '"');
  }
  return action;
}

interface SessionTimeRange {
  startIso: string | null;
  endIso: string | null;
}

function extractSessionTimeRange(content: string): SessionTimeRange {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return { startIso: null, endIso: null };

  const timestampEntries = lines
    .map((line) => {
      const action = parseActionFromEventLine(line);
      const ts = parseTimestampFromEventLine(line);
      if (!action || !ts) return null;
      const dt = new Date(ts);
      if (Number.isNaN(dt.getTime())) return null;
      return { action, ts, ms: dt.getTime() };
    })
    .filter((entry): entry is { action: string; ts: string; ms: number } => entry !== null);

  if (timestampEntries.length === 0) return { startIso: null, endIso: null };

  const startHandOne = timestampEntries.find((entry) =>
    /^-- starting hand #1\b/.test(entry.action),
  );
  const startIso = startHandOne ? startHandOne.ts : timestampEntries.reduce((min, curr) => (curr.ms < min.ms ? curr : min)).ts;
  const endIso = timestampEntries.reduce((max, curr) => (curr.ms > max.ms ? curr : max)).ts;

  return { startIso, endIso };
}

function formatSessionHeader(range: SessionTimeRange): string | null {
  if (!range.startIso || !range.endIso) return null;

  const start = new Date(range.startIso);
  const end = new Date(range.endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const datePart = `${start.getDate()}/${start.getMonth() + 1}/${start.getFullYear()}`;

  const hour24 = start.getHours();
  const hour12 = hour24 % 12 || 12;
  const minute = String(start.getMinutes()).padStart(2, "0");
  const meridiem = hour24 >= 12 ? "pm" : "am";
  const timePart = `${hour12}.${minute}${meridiem}`;

  const diffMs = Math.max(0, end.getTime() - start.getTime());
  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const durationPart = hours > 0
    ? `${hours}h ${minutes}m`
    : `${minutes}m`;

  return `${datePart} ${timePart} (${durationPart})`;
}

function extractSessionStartDate(content: string): string | null {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return null;

  // Poker Now exports are newest-first; the last row is the session start.
  const ts = parseTimestampFromEventLine(lines[lines.length - 1]);
  if (!ts) return null;

  function formatDayMonthYear(d: Date): string {
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }

  // ISO format from export: 2026-04-18T12:02:45.208Z
  // Use UTC so timezone does not shift the exported day.
  const isoDate = ts.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (isoDate) {
    const year = Number(isoDate[1]);
    const month = Number(isoDate[2]);
    const day = Number(isoDate[3]);
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(ts);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatDayMonthYear(parsed);
}

function normalizeForMatch(name: string): string {
  const baseDisplayName = baseName(name).replace(/\s*\(#\d+\)\s*/, "");
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

export default function PokerStats({
  initialSnapshot,
  snapshotId,
}: {
  initialSnapshot?: SnapshotPayload;
  snapshotId?: string;
} = {}) {
  const router = useRouter();
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
  const [rawWsdRecords, setRawWsdRecords] = useState<WSDMap | null>(null);
  const [wsdRecords, setWsdRecords] = useState<WSDMap | null>(null);
  const [selectedWsdPlayer, setSelectedWsdPlayer] = useState<string | null>(null);
  const [rawH2H, setRawH2H] = useState<H2HMap | null>(null);
  const [h2h, setH2H] = useState<H2HMap | null>(null);
  const [selectedNemesisPlayer, setSelectedNemesisPlayer] = useState<string | null>(null);
  const [aliasGroups, setAliasGroups] = useState<string[][]>([]);
  const [aliasModalOpen, setAliasModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [loadedSessions, setLoadedSessions] = useState<PokerLogParseResult[]>([]);
  const [loadedSessionTimeRanges, setLoadedSessionTimeRanges] = useState<SessionTimeRange[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("netChips");
  const [sortAsc, setSortAsc] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedNameByPlayer, setSelectedNameByPlayer] = useState<Record<string, string>>({});
  const [openNameDropdownPlayer, setOpenNameDropdownPlayer] = useState<string | null>(null);
  const [shareState, setShareState] = useState<
    | { status: "idle" }
    | { status: "saving" }
    | { status: "saved"; url: string }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const [shareCopied, setShareCopied] = useState(false);
  const [selfPlayerName, setSelfPlayerName] = useState<string | null>(null);
  const [timelineSheet, setTimelineSheet] = useState<number | null>(null);
  const [timelineHand, setTimelineHand] = useState<number | null>(null);
  const [sheetManagerOpen, setSheetManagerOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadModeRef = useRef<UploadMode>("replace");

  const applySessions = useCallback(
    (
      nextSessions: PokerLogParseResult[],
      nextSessionTimeRanges: SessionTimeRange[],
      groupOverride?: string[][],
    ) => {
      const mergedParsed = mergePokerLogResults(nextSessions);
      const canonical = autoMergeSameBaseNamePlayers(mergedParsed.players);
      const canonicalRaises = autoMergeSameBaseNameRaises(mergedParsed.preflopRaisesByPlayer);
      const canonicalCBets = autoMergeSameBaseNameCBets(mergedParsed.cbetRecordsByPlayer);
      const canonicalSawFlopHands = autoMergeSameBaseNameHandNumbers(
        mergedParsed.sawFlopHandsByPlayer,
      );
      const canonicalNoFlopHands = autoMergeSameBaseNameHandNumbers(
        mergedParsed.noFlopHandsByPlayer,
      );
      const canonicalWsd = autoMergeSameBaseNameWSD(mergedParsed.wsdRecordsByPlayer);
      const canonicalH2H = autoMergeSameBaseNameH2H(mergedParsed.headToHeadByPlayer);
      const nextAliasGroups =
        groupOverride ?? canonical.map((p) => [p.name]);

      setRawStats(canonical);
      setRawPreflopRaises(canonicalRaises);
      setRawCbetRecords(canonicalCBets);
      setRawSawFlopHands(canonicalSawFlopHands);
      setRawNoFlopHands(canonicalNoFlopHands);
      setRawWsdRecords(canonicalWsd);
      setRawH2H(canonicalH2H);
      setLoadedSessions(nextSessions);
      setLoadedSessionTimeRanges(nextSessionTimeRanges);
      setAliasGroups(nextAliasGroups);
      setStats(mergeAliasedStats(canonical, nextAliasGroups));
      setPreflopRaises(mergeAliasedRaises(canonicalRaises, nextAliasGroups));
      setCbetRecords(mergeAliasedCBets(canonicalCBets, nextAliasGroups));
      setSawFlopHands(mergeAliasedHandNumbers(canonicalSawFlopHands, nextAliasGroups));
      setNoFlopHands(mergeAliasedHandNumbers(canonicalNoFlopHands, nextAliasGroups));
      setWsdRecords(mergeAliasedWSD(canonicalWsd, nextAliasGroups));
      setH2H(mergeAliasedH2H(canonicalH2H, nextAliasGroups));
    },
    [],
  );

  const applyTimelineCutoff = useCallback(
    (sessions: PokerLogParseResult[], sheet: number | null, hand: number | null, groups: string[][]) => {
      if (sheet === null || hand === null || sessions.length === 0) {
        return;
      }

      const partialSessions: PokerLogParseResult[] = [];
      for (let i = 0; i < sessions.length; i++) {
        const sessionNum = i + 1;
        if (sessionNum < sheet) {
          partialSessions.push(sessions[i]);
        } else if (sessionNum === sheet) {
          partialSessions.push(getPartialSession(sessions[i], hand));
        }
      }

      if (partialSessions.length === 0) return;

      const mergedParsed = mergePokerLogResults(partialSessions);
      const canonical = autoMergeSameBaseNamePlayers(mergedParsed.players);
      const canonicalRaises = autoMergeSameBaseNameRaises(mergedParsed.preflopRaisesByPlayer);
      const canonicalCBets = autoMergeSameBaseNameCBets(mergedParsed.cbetRecordsByPlayer);
      const canonicalSawFlopHands = autoMergeSameBaseNameHandNumbers(mergedParsed.sawFlopHandsByPlayer);
      const canonicalNoFlopHands = autoMergeSameBaseNameHandNumbers(mergedParsed.noFlopHandsByPlayer);
      const canonicalWsd = autoMergeSameBaseNameWSD(mergedParsed.wsdRecordsByPlayer);
      const canonicalH2H = autoMergeSameBaseNameH2H(mergedParsed.headToHeadByPlayer);

      setRawStats(canonical);
      setRawPreflopRaises(canonicalRaises);
      setRawCbetRecords(canonicalCBets);
      setRawSawFlopHands(canonicalSawFlopHands);
      setRawNoFlopHands(canonicalNoFlopHands);
      setRawWsdRecords(canonicalWsd);
      setRawH2H(canonicalH2H);
      setStats(mergeAliasedStats(canonical, groups));
      setPreflopRaises(mergeAliasedRaises(canonicalRaises, groups));
      setCbetRecords(mergeAliasedCBets(canonicalCBets, groups));
      setSawFlopHands(mergeAliasedHandNumbers(canonicalSawFlopHands, groups));
      setNoFlopHands(mergeAliasedHandNumbers(canonicalNoFlopHands, groups));
      setWsdRecords(mergeAliasedWSD(canonicalWsd, groups));
      setH2H(mergeAliasedH2H(canonicalH2H, groups));
    },
    [],
  );

  // Hydrate from a server-provided snapshot exactly once.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    if (!initialSnapshot) return;
    hydratedRef.current = true;
    applySessions(
      initialSnapshot.sessions,
      initialSnapshot.sessionTimeRanges,
      initialSnapshot.aliasGroups,
    );
    setSelectedNameByPlayer(initialSnapshot.selectedNameByPlayer ?? {});
    setSelfPlayerName(initialSnapshot.selfPlayerName ?? null);
  }, [initialSnapshot, applySessions]);

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
      setRawWsdRecords(null);
      setWsdRecords(null);
      setRawH2H(null);
      setH2H(null);
      setSelectedNameByPlayer({});
    }
    setOpenNameDropdownPlayer(null);
    setSelectedPlayer(null);
    setSelectedCbetPlayer(null);
    setSelectedSeeFlopPlayer(null);
    setSelectedWsdPlayer(null);
    setSelectedNemesisPlayer(null);
    setAliasModalOpen(false);
    setTimelineSheet(null);
    setTimelineHand(null);

    try {
      const parsedResults = await Promise.all(
        selectedFiles.map(async (file) => {
          const rawText = await readFileText(file);
          const text = rawText.split("\n").slice(0).join("\n");
          const parsed = parsePokerLogDetailed(text);
          const sessionTimeRange = extractSessionTimeRange(rawText);

          if (parsed.players.length === 0) {
            throw new Error(`${file.name}: no player data found. Make sure the file is a valid poker log.`);
          }

          return {
            parsed,
            sessionTimeRange,
          };
        }),
      );

      const nextSessions = mode === "append"
        ? [...loadedSessions, ...parsedResults.map((result) => result.parsed)]
        : parsedResults.map((result) => result.parsed);
      const nextSessionTimeRanges = mode === "append"
        ? [...loadedSessionTimeRanges, ...parsedResults.map((result) => result.sessionTimeRange)]
        : parsedResults.map((result) => result.sessionTimeRange);
      const mergedParsedForGroups = mergePokerLogResults(nextSessions);
      const canonicalForGroups = autoMergeSameBaseNamePlayers(mergedParsedForGroups.players);
      const nextAliasGroups = mode === "append"
        ? extendAliasGroups(aliasGroups, canonicalForGroups.map((p) => p.name))
        : canonicalForGroups.map((p) => [p.name]);

      applySessions(nextSessions, nextSessionTimeRanges, nextAliasGroups);
      setShareState({ status: "idle" });

      const lastSession = nextSessions[nextSessions.length - 1];
      if (lastSession && lastSession.totalHands > 0) {
        const lastSheet = nextSessions.length;
        const lastHand = lastSession.totalHands;
        setTimelineSheet(lastSheet);
        setTimelineHand(lastHand);
        applyTimelineCutoff(nextSessions, lastSheet, lastHand, nextAliasGroups);
      }
    } catch (err) {
      setError("Failed to parse the selected files. " + String(err));
    } finally {
      setIsParsing(false);
      uploadModeRef.current = "replace";
    }
  }, [aliasGroups, loadedSessionTimeRanges, loadedSessions, applySessions, applyTimelineCutoff]);

  const handleShare = useCallback(async () => {
    if (loadedSessions.length === 0) return;
    setShareState({ status: "saving" });
    setShareCopied(false);
    try {
      const payload: SnapshotPayload = {
        version: 1,
        sessions: loadedSessions,
        sessionTimeRanges: loadedSessionTimeRanges,
        aliasGroups,
        selectedNameByPlayer,
        selfPlayerName,
      };
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const { id } = (await res.json()) as { id: string };
      const url = `${window.location.origin}/s/${id}`;
      setShareState({ status: "saved", url });
      try {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
      } catch {
        // Clipboard access may be denied; the URL is still shown.
      }
    } catch (err) {
      setShareState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [loadedSessions, loadedSessionTimeRanges, aliasGroups, selectedNameByPlayer]);

  function applyAliases(groups: string[][]) {
    if (!rawStats) return;
    setShareState({ status: "idle" });
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
    if (rawWsdRecords) {
      setWsdRecords(mergeAliasedWSD(rawWsdRecords, groups));
    }
    if (rawH2H) {
      setH2H(mergeAliasedH2H(rawH2H, groups));
    }
    setSelectedPlayer(null);
    setSelectedCbetPlayer(null);
    setSelectedSeeFlopPlayer(null);
    setSelectedWsdPlayer(null);
    setSelectedNemesisPlayer(null);
    setSelectedNameByPlayer({});
    setOpenNameDropdownPlayer(null);
    setAliasModalOpen(false);
  }

  function skipAliases() {
    setAliasModalOpen(false);
  }

  function autoGroupPlayers() {
    if (!rawStats) return;
    setShareState({ status: "idle" });
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
    if (rawWsdRecords) {
      setWsdRecords(mergeAliasedWSD(rawWsdRecords, groups));
    }
    if (rawH2H) {
      setH2H(mergeAliasedH2H(rawH2H, groups));
    }
    setSelectedPlayer(null);
    setSelectedCbetPlayer(null);
    setSelectedSeeFlopPlayer(null);
    setSelectedWsdPlayer(null);
    setSelectedNemesisPlayer(null);
    setSelectedNameByPlayer({});
    setOpenNameDropdownPlayer(null);
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
    setRawWsdRecords(null);
    setWsdRecords(null);
    setSelectedWsdPlayer(null);
    setRawH2H(null);
    setH2H(null);
    setSelectedNemesisPlayer(null);
    setAliasGroups([]);
    setAliasModalOpen(false);
    setSelectedNameByPlayer({});
    setSelfPlayerName(null);
    setOpenNameDropdownPlayer(null);
    setError(null);
    setDragging(false);
    setIsParsing(false);
    setLoadedSessions([]);
    setLoadedSessionTimeRanges([]);
    setShareState({ status: "idle" });
    setShareCopied(false);
    setTimelineSheet(null);
    setTimelineHand(null);
    setSheetManagerOpen(false);
    setDragIdx(null);

    if (snapshotId) {
      router.replace("/");
    }
  }

  function deleteSheet(index: number) {
    const nextSessions = loadedSessions.filter((_, i) => i !== index);
    const nextRanges = loadedSessionTimeRanges.filter((_, i) => i !== index);
    if (nextSessions.length === 0) {
      clearAll();
      return;
    }
    setTimelineSheet(null);
    setTimelineHand(null);
    setShareState({ status: "idle" });
    const mergedForGroups = mergePokerLogResults(nextSessions);
    const canonicalForGroups = autoMergeSameBaseNamePlayers(mergedForGroups.players);
    const nextAliasGroups = extendAliasGroups(aliasGroups, canonicalForGroups.map((p) => p.name));
    applySessions(nextSessions, nextRanges, nextAliasGroups);
  }

  function reorderSheets(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    const nextSessions = [...loadedSessions];
    const nextRanges = [...loadedSessionTimeRanges];
    const [movedSession] = nextSessions.splice(fromIdx, 1);
    const [movedRange] = nextRanges.splice(fromIdx, 1);
    nextSessions.splice(toIdx, 0, movedSession);
    nextRanges.splice(toIdx, 0, movedRange);
    setTimelineSheet(null);
    setTimelineHand(null);
    setShareState({ status: "idle" });
    applySessions(nextSessions, nextRanges, aliasGroups);
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
    if (key === "nemesis") {
      const playerH2H = h2h?.[player.name] ?? {};
      const nemesisNet = Object.values(playerH2H).filter((n) => n < 0).sort((a, b) => a - b)[0];
      // Sort by most lost (most negative first). Players with no nemesis go to the end.
      return nemesisNet ?? 0;
    }
    if (key === "name") {
      return selectedDisplayName(player.name, selectedNameByPlayer[player.name]);
    }
    if (key === "vpipHands") {
      return player.handsDealt === 0 ? 0 : (player.vpipHands / player.handsDealt) * 100;
    }
    if (key === "pfrHands") {
      return player.handsDealt === 0 ? 0 : (player.pfrHands / player.handsDealt) * 100;
    }
    if (key === "cbetHands") {
      return player.cbetOpportunities === 0 ? 0 : (player.cbetHands / player.cbetOpportunities) * 100;
    }
    if (key === "wsdHands") {
      return player.wsdHands === 0 ? 0 : (player.wsdWins / player.wsdHands) * 100;
    }
    if (key === "sawFlopHands") {
      return player.handsDealt === 0 ? 0 : (player.sawFlopHands / player.handsDealt) * 100;
    }
    if (key === "aggActions") {
      return player.callActions === 0 ? (player.aggActions > 0 ? Infinity : 0) : player.aggActions / player.callActions;
    }
    return player[key as keyof PlayerStats];
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

  // Per-hand P&L for the "self" player in the currently displayed session.
  // Uses handLedgerSnapshots (cumulative netChips deltas) to compute each hand's result.
  const selfHandPnL = useMemo<Record<number, number>>(() => {
    if (!selfPlayerName || timelineSheet === null) return {};
    const session = loadedSessions[timelineSheet - 1];
    if (!session) return {};
    const group = aliasGroups.find((g) => g[0] === selfPlayerName);
    if (!group) return {};
    // Strip " (#N)" session tags so names match the session-local snapshot keys.
    const rawNames = new Set(group.map((n) => n.replace(/\s*\(#\d+\)\s*$/, "").trim()));
    const snapshots = session.handLedgerSnapshots;
    const result: Record<number, number> = {};
    for (let i = 0; i < snapshots.length; i++) {
      const snap = snapshots[i];
      const prevSnap = i > 0 ? snapshots[i - 1] : null;
      let pnl = 0;
      for (const rawName of rawNames) {
        const curr = snap.playerStats[rawName]?.netChips ?? 0;
        const prev = prevSnap?.playerStats[rawName]?.netChips ?? 0;
        pnl += curr - prev;
      }
      result[snap.handNumber] = Math.round(pnl * 100) / 100;
    }
    return result;
  }, [selfPlayerName, timelineSheet, loadedSessions, aliasGroups]);

  const selfHandCards = useMemo<Record<number, string[]>>(() => {
    if (!selfPlayerName || timelineSheet === null) return {};
    const session = loadedSessions[timelineSheet - 1];
    if (!session) return {};
    const group = aliasGroups.find((g) => g[0] === selfPlayerName);
    if (!group) return {};
    const rawNames = new Set(group.map((n) => n.replace(/\s*\(#\d+\)\s*$/, "").trim()));
    const result: Record<number, string[]> = {};
    for (const replay of session.handReplays) {
      for (const action of replay.actions) {
        if (action.type === "show-cards" && action.player && action.cards && rawNames.has(action.player)) {
          result[replay.handNumber] = action.cards;
          break;
        }
      }
    }
    return result;
  }, [selfPlayerName, timelineSheet, loadedSessions, aliasGroups]);

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

  const selectedWsdRecords = selectedWsdPlayer && wsdRecords
    ? wsdRecords[selectedWsdPlayer] ?? []
    : [];

  function renderCell(player: PlayerStats, key: SortKey, rowIndex: number, totalRows: number) {
    if (key === "name") {
      const options = displayNameOptions(player.name);
      const current = selectedDisplayName(player.name, selectedNameByPlayer[player.name]);
      if (options.length <= 1) {
        return <span className="font-medium text-zinc-100 whitespace-nowrap">{current}</span>;
      }

      const isOpen = openNameDropdownPlayer === player.name;
      const openUpward = rowIndex >= totalRows - 3;
      return (
        <div className="relative inline-flex items-center">
          <button
            type="button"
            onClick={() => setOpenNameDropdownPlayer((prev) => (prev === player.name ? null : player.name))}
            className="inline-flex items-center gap-1 rounded px-1 font-medium text-zinc-100 transition-colors hover:bg-zinc-800"
            title="Choose which player name to display"
          >
            <span className="whitespace-nowrap">{current}</span>
            <span className="text-xs text-zinc-400">▾</span>
          </button>
          {isOpen && (
            <div
              className={`absolute left-0 z-20 min-w-40 rounded border border-zinc-700 bg-zinc-900 p-1 text-sm text-zinc-100 shadow-lg ${
                openUpward ? "bottom-full mb-1" : "top-full mt-1"
              }`}
            >
              {options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setSelectedNameByPlayer((prev) => ({ ...prev, [player.name]: option }));
                    setOpenNameDropdownPlayer(null);
                  }}
                  className={`block w-full rounded px-2 py-1 text-left transition-colors hover:bg-zinc-800 ${
                    option === current ? "text-green-300" : "text-zinc-100"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
      );
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
          onClick={() => {
            setOpenNameDropdownPlayer(null);
            setSelectedSeeFlopPlayer(player.name);
          }}
          className={`${tableBubbleClassName({ active: selectedSeeFlopPlayer === player.name })} tabular-nums ${
            selectedSeeFlopPlayer === player.name ? "text-green-300" : "text-zinc-300"
          }`}
          title="Show hand numbers for saw flop vs did not see flop"
          aria-label={`Open see flop details for ${selectedDisplayName(player.name, selectedNameByPlayer[player.name])}`}
        >
          <span>{pct(player.sawFlopHands, player.handsDealt)}</span>
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
          onClick={() => {
            setOpenNameDropdownPlayer(null);
            setSelectedPlayer(player.name);
          }}
          className={`${tableBubbleClassName({ active: selectedPlayer === player.name })} tabular-nums ${
            selectedPlayer === player.name ? "text-green-300" : "text-zinc-300"
          }`}
          title="Show preflop raises and revealed cards"
          aria-label={`Open preflop raise details for ${selectedDisplayName(player.name, selectedNameByPlayer[player.name])}`}
        >
          <span>{pct(player.pfrHands, player.handsDealt)}</span>
        </button>
      );
    }

    if (key === "cbetHands") {
      return (
        <button
          type="button"
          onClick={() => {
            setOpenNameDropdownPlayer(null);
            setSelectedCbetPlayer(player.name);
          }}
          className={`${tableBubbleClassName({ active: selectedCbetPlayer === player.name })} tabular-nums ${
            selectedCbetPlayer === player.name ? "text-green-300" : "text-zinc-300"
          }`}
          title="Show continuation bets with hole cards and flop cards"
          aria-label={`Open continuation bet details for ${selectedDisplayName(player.name, selectedNameByPlayer[player.name])}`}
        >
          <span>{pct(player.cbetHands, player.cbetOpportunities)}</span>
        </button>
      );
    }

    if (key === "aggActions") {
      return <span className="tabular-nums text-zinc-300">{af(player.aggActions, player.callActions)}</span>;
    }

    if (key === "wsdHands") {
      return (
        <button
          type="button"
          onClick={() => {
            setOpenNameDropdownPlayer(null);
            setSelectedWsdPlayer(player.name);
          }}
          className={`${tableBubbleClassName({ active: selectedWsdPlayer === player.name })} tabular-nums ${
            selectedWsdPlayer === player.name ? "text-green-300" : "text-zinc-300"
          }`}
          title={`${player.wsdWins} / ${player.wsdHands} showdowns won — click to see hands`}
          aria-label={`Open showdown details for ${selectedDisplayName(player.name, selectedNameByPlayer[player.name])}`}
        >
          <span>{pct(player.wsdWins, player.wsdHands)}</span>
        </button>
      );
    }

    if (key === "handsWon") {
      return <span className="tabular-nums text-zinc-300">{player.handsWon}</span>;
    }

    return <span className="text-zinc-300">{String(player[key as keyof PlayerStats])}</span>;
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

      <h1 className="text-2xl font-bold mb-1 text-green-400"><SuitText suit="♠" /> Poker Fish</h1>
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
                const latestRange = loadedSessionTimeRanges[loadedSessionTimeRanges.length - 1] ?? null;
                const sessionHeader = latestRange ? formatSessionHeader(latestRange) : null;
                const ledgerBody = sorted
                  .map((p) => {
                    const n = p.netChips;
                    const formatted = (Math.abs(n) >= 1000
                      ? (n < 0 ? "-" : "+") + Math.abs(n).toLocaleString("en-US")
                      : (n >= 0 ? "+" : "") + n.toLocaleString("en-US"));
                    return `${selectedDisplayName(p.name, selectedNameByPlayer[p.name])}: ${formatted}`;
                  })
                  .join("\n");
                const text = sessionHeader ? `${sessionHeader}\n${ledgerBody}` : ledgerBody;
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
              onClick={() => {
                if (shareState.status === "saved") {
                  navigator.clipboard.writeText(shareState.url).then(
                    () => {
                      setShareCopied(true);
                      setTimeout(() => setShareCopied(false), 2000);
                    },
                    () => {},
                  );
                  return;
                }
                void handleShare();
              }}
              disabled={shareState.status === "saving" || loadedSessions.length === 0}
              className="w-36 rounded-lg border border-purple-700 bg-purple-950/40 px-3 py-2 text-sm font-semibold text-purple-300 hover:bg-purple-900/40 disabled:opacity-50"
              title={
                shareState.status === "saved"
                  ? shareState.url
                  : "Save current data and create a shareable link"
              }
            >
              {shareState.status === "saving"
                ? "Saving…"
                : shareState.status === "saved"
                ? shareCopied
                  ? "✓ Link Copied!"
                  : "Copy Share Link"
                : "Share Snapshot"}
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

      {sorted && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 shrink-0">Focus Player</span>
          <select
            value={selfPlayerName ?? ""}
            onChange={(e) => setSelfPlayerName(e.target.value || null)}
            className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"
          >
            <option value="">— select a player to focus —</option>
            {sorted.map((p) => (
              <option key={p.name} value={p.name}>
                {selectedDisplayName(p.name, selectedNameByPlayer[p.name])}
              </option>
            ))}
          </select>
        </div>
      )}

      {loadedSessions.length > 1 && (
        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-3">
          <button
            type="button"
            onClick={() => setSheetManagerOpen((v) => !v)}
            className="flex w-full items-center justify-between"
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Sheets ({loadedSessions.length})
            </span>
            <span className="text-xs text-zinc-500">{sheetManagerOpen ? "▲" : "▼"}</span>
          </button>
          {sheetManagerOpen && (
            <div className="mt-2 flex flex-col gap-1">
              {loadedSessions.map((session, idx) => {
                const range = loadedSessionTimeRanges[idx];
                const label = range ? formatSessionHeader(range) : null;
                const handCount = session.totalHands;
                const isDragging = dragIdx === idx;
                return (
                  <div
                    key={idx}
                    draggable
                    onDragStart={() => setDragIdx(idx)}
                    onDragEnd={() => setDragIdx(null)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIdx !== null && dragIdx !== idx) {
                        reorderSheets(dragIdx, idx);
                      }
                      setDragIdx(null);
                    }}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                      isDragging
                        ? "border-amber-600 bg-amber-950/30 opacity-50"
                        : "border-zinc-700 bg-zinc-800/40 hover:bg-zinc-800/70"
                    }`}
                    style={{ cursor: "grab" }}
                  >
                    <span className="text-zinc-600 text-xs select-none" title="Drag to reorder">⠿</span>
                    <span className="text-xs font-medium text-zinc-300 flex-1 truncate">
                      Sheet {idx + 1}
                      {label && <span className="ml-2 text-zinc-500 font-normal">{label}</span>}
                    </span>
                    <span className="text-[10px] text-zinc-500 tabular-nums shrink-0">{handCount} hands</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSheet(idx);
                      }}
                      className="ml-1 rounded p-0.5 text-zinc-600 hover:text-red-400 hover:bg-red-950/40 transition-colors"
                      title={`Remove Sheet ${idx + 1}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loadedSessions.length > 0 && loadedSessions.some((s) => s.totalHands > 0) && (() => {
        const isActive = timelineSheet !== null && timelineHand !== null;
        const currentSheet = timelineSheet ?? 1;
        const maxHandForSheet = loadedSessions[currentSheet - 1]?.totalHands ?? 0;
        const currentHand = timelineHand ?? maxHandForSheet;
        const currentSnapshots = loadedSessions[currentSheet - 1]?.handLedgerSnapshots ?? [];

        let currentSnapshotIndex: number | null = null;
        if (isActive) {
          for (let i = currentSnapshots.length - 1; i >= 0; i--) {
            if (currentSnapshots[i].handNumber <= currentHand) {
              currentSnapshotIndex = i;
              break;
            }
          }
        }

        function handleSheetChange(val: number) {
          const clamped = Math.max(1, Math.min(val, loadedSessions.length));
          const newMax = loadedSessions[clamped - 1]?.totalHands ?? 0;
          const newHand = newMax;
          setTimelineSheet(clamped);
          setTimelineHand(newHand);
          applyTimelineCutoff(loadedSessions, clamped, newHand, aliasGroups);
        }

        function handleHandChange(val: number) {
          const sheet = timelineSheet ?? 1;
          const max = loadedSessions[sheet - 1]?.totalHands ?? 0;
          const clamped = Math.max(1, Math.min(val, max));
          setTimelineSheet(sheet);
          setTimelineHand(clamped);
          applyTimelineCutoff(loadedSessions, sheet, clamped, aliasGroups);
        }

        function handleChartHandChange(handNumber: number) {
          const sheet = timelineSheet ?? 1;
          setTimelineSheet(sheet);
          setTimelineHand(handNumber);
          applyTimelineCutoff(loadedSessions, sheet, handNumber, aliasGroups);
        }

        return (
          <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Time Machine
                </span>
                {isActive && (
                  <span className="text-xs text-amber-400">
                    Sheet {currentSheet}, Hand {currentHand} of {maxHandForSheet}
                  </span>
                )}
              </div>
              {loadedSessions.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-500">Sheet</span>
                  <input
                    type="number"
                    min={1}
                    max={loadedSessions.length}
                    value={currentSheet}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!Number.isNaN(v)) handleSheetChange(v);
                    }}
                    className="w-20 rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 text-center tabular-nums"
                  />
                  <span className="text-sm text-zinc-500 tabular-nums">/ {loadedSessions.length}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 mb-2">
              <input
                type="range"
                min={1}
                max={maxHandForSheet || 1}
                value={currentHand}
                onChange={(e) => handleHandChange(parseInt(e.target.value))}
                className="flex-1 accent-amber-500"
                disabled={maxHandForSheet === 0}
              />
              <div className="w-48 shrink-0 flex items-center gap-2">
                <span className="text-sm text-zinc-500">Hand</span>
                <input
                  type="number"
                  min={1}
                  max={maxHandForSheet || 1}
                  value={currentHand}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!Number.isNaN(v)) handleHandChange(v);
                  }}
                  className="w-20 rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 text-center tabular-nums"
                  disabled={maxHandForSheet === 0}
                />
                <span className="text-sm text-zinc-500 tabular-nums">/ {maxHandForSheet}</span>
              </div>
            </div>

            {isActive && (
              <HandReplayPanel
                handReplays={loadedSessions[currentSheet - 1]?.handReplays ?? []}
                currentHandNumber={currentHand}
                getDisplayName={(name) => selectedDisplayName(name, selectedNameByPlayer[name])}
                onHandChange={handleChartHandChange}
                selfHandPnL={selfHandPnL}
                selfHandCards={selfHandCards}
              />
            )}

            <NetChipsChart
              snapshots={currentSnapshots}
              currentHandIndex={currentSnapshotIndex}
              onHandChange={handleChartHandChange}
              getDisplayName={(name) => selectedDisplayName(name, selectedNameByPlayer[name])}
              aliasGroups={aliasGroups}
              selfPlayerName={selfPlayerName}
            />
          </div>
        );
      })()}

      {error && (
        <p className="mt-4 text-red-400 text-sm bg-red-950/40 border border-red-800 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      {shareState.status === "saved" && (
        <div className="mt-4 flex flex-col gap-1 rounded-lg border border-purple-800 bg-purple-950/30 px-4 py-3 text-sm text-purple-200 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-wider text-purple-400">Snapshot link</span>
            <a
              href={shareState.url}
              className="break-all font-mono text-purple-200 hover:text-purple-100"
              target="_blank"
              rel="noreferrer"
            >
              {shareState.url}
            </a>
          </div>
          <span className="text-xs text-purple-400">
            Anyone with this link can view this exact table.
          </span>
        </div>
      )}

      {shareState.status === "error" && (
        <p className="mt-4 text-red-400 text-sm bg-red-950/40 border border-red-800 rounded-lg px-4 py-3">
          Failed to save snapshot: {shareState.message}
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
                <th
                  title="Player you've lost the most chips to — click to sort"
                  onClick={() => toggleSort("nemesis")}
                  className={`px-4 py-3 cursor-pointer select-none whitespace-nowrap text-left uppercase text-xs tracking-wider transition-colors hover:text-zinc-100 ${
                    sortKey === "nemesis" ? "text-green-400" : "text-zinc-400"
                  }`}
                >
                  Nemesis
                  {sortKey === "nemesis" && (
                    <span className="ml-1">{sortAsc ? "▲" : "▼"}</span>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => {
                const playerH2H = h2h?.[p.name] ?? {};
                const nemesisEntry = Object.entries(playerH2H)
                  .filter(([, n]) => n < 0)
                  .sort(([, a], [, b]) => a - b)[0];
                const nemesisName = nemesisEntry?.[0] ?? null;
                const nemesisNet = nemesisEntry?.[1] ?? null;
                return (
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
                        {renderCell(p, col.key, i, sorted.length)}
                      </td>
                    ))}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {nemesisName ? (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenNameDropdownPlayer(null);
                            setSelectedNemesisPlayer(p.name);
                          }}
                          className={`${tableBubbleClassName({ active: selectedNemesisPlayer === p.name })} tabular-nums text-left ${
                            selectedNemesisPlayer === p.name ? "text-green-300" : "text-zinc-300"
                          }`}
                          title="Click to see full head-to-head breakdown"
                          aria-label={`Open nemesis details for ${selectedDisplayName(p.name, selectedNameByPlayer[p.name])}`}
                        >
                          <span className="truncate">
                            {selectedDisplayName(nemesisName, selectedNameByPlayer[nemesisName])}
                            <span className="ml-1 text-xs text-zinc-500">({nemesisNet!.toFixed(1)})</span>
                          </span>
                        </button>
                      ) : Object.keys(playerH2H).length > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenNameDropdownPlayer(null);
                            setSelectedNemesisPlayer(p.name);
                          }}
                          className={`${tableBubbleClassName({ tone: "neutral" })} text-left text-zinc-500 hover:text-zinc-300`}
                          title="Click to see full head-to-head breakdown"
                          aria-label={`Open head-to-head details for ${selectedDisplayName(p.name, selectedNameByPlayer[p.name])}`}
                        >
                          <span>No Nemesis</span>
                        </button>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 bg-zinc-900 border-t border-zinc-800 text-xs text-zinc-500">
            {sorted.length} players · click a column header to sort
          </div>
        </div>
      )}

      <PlayerRaiseModal
        open={!!selectedPlayer}
        playerName={selectedPlayer ? selectedDisplayName(selectedPlayer, selectedNameByPlayer[selectedPlayer]) : ""}
        raises={selectedRaises}
        onClose={() => setSelectedPlayer(null)}
        sessionCount={loadedSessions.length}
      />

      <PlayerSeeFlopModal
        open={!!selectedSeeFlopPlayer}
        playerName={selectedSeeFlopPlayer ? selectedDisplayName(selectedSeeFlopPlayer, selectedNameByPlayer[selectedSeeFlopPlayer]) : ""}
        sawFlopHands={selectedSawFlopHands}
        noFlopHands={selectedNoFlopHands}
        onClose={() => setSelectedSeeFlopPlayer(null)}
        sessionCount={loadedSessions.length}
      />

      <PlayerCBetModal
        open={!!selectedCbetPlayer}
        playerName={selectedCbetPlayer ? selectedDisplayName(selectedCbetPlayer, selectedNameByPlayer[selectedCbetPlayer]) : ""}
        cbets={selectedCBets}
        onClose={() => setSelectedCbetPlayer(null)}
        sessionCount={loadedSessions.length}
      />

      <PlayerWSDModal
        open={!!selectedWsdPlayer}
        playerName={selectedWsdPlayer ? selectedDisplayName(selectedWsdPlayer, selectedNameByPlayer[selectedWsdPlayer]) : ""}
        records={selectedWsdRecords}
        onClose={() => setSelectedWsdPlayer(null)}
        sessionCount={loadedSessions.length}
      />

      <PlayerNemesisModal
        open={!!selectedNemesisPlayer}
        playerName={selectedNemesisPlayer ? selectedDisplayName(selectedNemesisPlayer, selectedNameByPlayer[selectedNemesisPlayer]) : ""}
        headToHead={selectedNemesisPlayer && h2h ? (h2h[selectedNemesisPlayer] ?? {}) : {}}
        getDisplayName={(name) => selectedDisplayName(name, selectedNameByPlayer[name])}
        onClose={() => setSelectedNemesisPlayer(null)}
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
          <div><span className="text-zinc-400 font-medium">WSD%</span> — outright won at showdown (split pots count as draws, not wins)</div>
          <div><span className="text-zinc-400 font-medium">See Flop%</span> — did not fold preflop / hands played</div>
          <div><span className="text-zinc-400 font-medium">AF</span> — aggression factor (bets+raises / calls)</div>
          <div><span className="text-zinc-400 font-medium">Won</span> — times collected from pot</div>
        </div>
      )}

      <p className="mt-8 rounded-lg border border-amber-800/70 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
        If you live in Singapore and want to help fund the creator of this project, consider sending a tip via PayNow to
        {" "} <span className="font-semibold tracking-wide">91069528</span>, under the comments put pokerfish! :D
      </p>
    </div>
  );
}
