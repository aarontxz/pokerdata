"use client";

import { useEffect, useMemo, useState } from "react";

interface PlayerAliasModalProps {
  open: boolean;
  players: string[];
  initialGroups: string[][];
  onDone: (groups: string[][]) => void;
  onSkip: () => void;
}

function displayName(name: string): string {
  const at = name.indexOf("@");
  if (at === -1) return name.trim();
  return name.slice(0, at).trim();
}

function initGroups(players: string[]): string[][] {
  return players
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .map((p) => [p]);
}

function normalizeForMatch(name: string): string {
  return displayName(name).toLowerCase().replace(/[^a-z0-9]/g, "");
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

function autoGroupPlayers(players: string[]): string[][] {
  const names = players.slice().sort((a, b) => a.localeCompare(b));
  if (names.length <= 1) return names.map((name) => [name]);

  const parent = names.map((_, idx) => idx);

  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }

  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      if (isSimilarName(names[i], names[j])) {
        union(i, j);
      }
    }
  }

  const groupsByRoot: Record<number, string[]> = {};
  for (let i = 0; i < names.length; i += 1) {
    const root = find(i);
    if (!groupsByRoot[root]) groupsByRoot[root] = [];
    groupsByRoot[root].push(names[i]);
  }

  return Object.values(groupsByRoot)
    .map((group) => group.sort((a, b) => a.localeCompare(b)))
    .sort((a, b) => a[0].localeCompare(b[0]));
}

export default function PlayerAliasModal({
  open,
  players,
  initialGroups,
  onDone,
  onSkip,
}: PlayerAliasModalProps) {
  const [groups, setGroups] = useState<string[][]>([]);
  const [dragName, setDragName] = useState<string | null>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (open) {
      if (initialGroups.length > 0) {
        setGroups(initialGroups.map((g) => g.slice()));
      } else {
        setGroups(initGroups(players));
      }
      setDragName(null);
      setPickedName(null);
    }
  }, [open, players, initialGroups]);

  const groupedCount = useMemo(
    () => groups.filter((g) => g.length > 1).reduce((acc, g) => acc + g.length, 0),
    [groups],
  );

  function findGroupIndex(name: string): number {
    return groups.findIndex((g) => g.includes(name));
  }

  function mergePlayerIntoGroup(name: string, targetGroupIndex: number) {
    const sourceGroupIndex = findGroupIndex(name);
    if (sourceGroupIndex === -1 || sourceGroupIndex === targetGroupIndex) return;

    setGroups((prev) => {
      const sourceGroup = prev[sourceGroupIndex];
      const targetGroup = prev[targetGroupIndex];
      if (!sourceGroup || !targetGroup) return prev;

      const next = prev.map((g) => g.slice());
      next[sourceGroupIndex] = next[sourceGroupIndex].filter((n) => n !== name);
      next[targetGroupIndex].push(name);
      return next.filter((g) => g.length > 0);
    });
  }

  function movePickedToGroup(targetGroupIndex: number) {
    if (!pickedName) return;
    mergePlayerIntoGroup(pickedName, targetGroupIndex);
    setPickedName(null);
  }

  function movePlayerToNewGroup(name: string) {
    const sourceGroupIndex = findGroupIndex(name);
    if (sourceGroupIndex === -1) return;

    setGroups((prev) => {
      const sourceGroup = prev[sourceGroupIndex];
      if (!sourceGroup || sourceGroup.length <= 1) return prev;

      const next = prev.map((g) => g.slice());
      next[sourceGroupIndex] = next[sourceGroupIndex].filter((n) => n !== name);
      next.push([name]);
      return next.filter((g) => g.length > 0);
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
      <div className="w-full sm:max-w-5xl rounded-t-2xl sm:rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden max-h-[90vh] sm:max-h-none flex flex-col">
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-zinc-800 bg-zinc-950/80 shrink-0">
          <h2 className="text-base sm:text-xl font-semibold text-zinc-100">Merge Duplicate Players</h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Tap a player, then tap a group to merge. Or drag on desktop.
          </p>
        </div>

        <div className="p-3 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto flex-1">
          <div className="text-xs text-zinc-500">
            {groups.length} groups · {groupedCount} players merged
          </div>

          <div
            className={`rounded-xl border border-dashed p-3 text-xs transition-colors cursor-pointer ${
              pickedName
                ? "border-green-500 bg-green-950/20 text-green-300"
                : "border-zinc-600 bg-zinc-950/30 text-zinc-400 hover:border-zinc-400"
            }`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragName) movePlayerToNewGroup(dragName);
              setDragName(null);
            }}
            onClick={() => {
              if (!pickedName) return;
              movePlayerToNewGroup(pickedName);
              setPickedName(null);
            }}
          >
            {pickedName
              ? `Tap here to move ${displayName(pickedName)} into a new group`
              : "Drop here to pull a player out into a new separate group"}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
            {groups.map((group, idx) => (
              <div
                key={group.join("|")}
                className="rounded-lg border border-zinc-700 bg-zinc-950/50 p-2 min-h-[64px] transition-colors hover:border-zinc-500"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragName) mergePlayerIntoGroup(dragName, idx);
                  setDragName(null);
                }}
                onClick={() => movePickedToGroup(idx)}
              >
                <div className="flex flex-wrap gap-2">
                  {group.map((name) => (
                    <button
                      key={name}
                      type="button"
                      draggable
                      onDragStart={() => setDragName(name)}
                      onDragEnd={() => setDragName(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPickedName((prev) => (prev === name ? null : name));
                      }}
                      className={`rounded-full border px-2 py-0.5 text-[11px] cursor-grab active:cursor-grabbing ${
                        pickedName === name
                          ? "border-green-400 bg-green-900/50 text-green-200"
                          : "border-zinc-600 bg-zinc-800 text-zinc-200"
                      }`}
                      title="Drag onto another group to merge"
                    >
                      {displayName(name)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-3 py-3 sm:px-6 sm:py-4 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => {
                setGroups(autoGroupPlayers(groups.flat()));
                setDragName(null);
                setPickedName(null);
              }}
              className="rounded-lg border border-green-700 bg-green-950/40 px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm text-green-300 hover:bg-green-900/40"
            >
              Auto
            </button>
            <button
              type="button"
              onClick={() => setGroups(initGroups(players))}
              className="rounded-lg border border-zinc-600 px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="rounded-lg border border-zinc-600 px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Skip
            </button>
          </div>

          <button
            type="button"
            onClick={() => onDone(groups)}
            className="rounded-lg bg-green-500 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold text-zinc-950 hover:bg-green-400"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
