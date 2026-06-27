"use client";

import { useMemo, useRef, useCallback, useState, useEffect } from "react";
import type { HandLedgerSnapshot } from "../lib/pokerParser";

const PLAYER_COLORS = [
  "#4ade80", // green
  "#f87171", // red
  "#60a5fa", // blue
  "#fbbf24", // amber
  "#c084fc", // purple
  "#2dd4bf", // teal
  "#fb923c", // orange
  "#f472b6", // pink
  "#a3e635", // lime
  "#38bdf8", // sky
  "#e879f9", // fuchsia
  "#34d399", // emerald
];

interface NetChipsChartProps {
  snapshots: HandLedgerSnapshot[];
  currentHandIndex: number | null;
  onHandChange: (handNumber: number) => void;
  getDisplayName: (name: string) => string;
  aliasGroups?: string[][];
  selfPlayerName?: string | null;
}

interface PlayerSeries {
  name: string;
  displayName: string;
  color: string;
  segments: { hand: number; net: number }[][];
  lastPoint: { hand: number; net: number } | null;
}

export default function NetChipsChart({
  snapshots,
  currentHandIndex,
  onHandChange,
  getDisplayName,
  aliasGroups,
  selfPlayerName,
}: NetChipsChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null);
  const [hiddenPlayers, setHiddenPlayers] = useState<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const [chartVisible, setChartVisible] = useState(true);

  const [animKey, setAnimKey] = useState(0);
  const prevSnapshotCountRef = useRef(0);
  useEffect(() => {
    if (snapshots.length !== prevSnapshotCountRef.current) {
      prevSnapshotCountRef.current = snapshots.length;
      setAnimKey((k) => k + 1);
    }
  }, [snapshots]);

  const aliasByName = useMemo(() => {
    const map: Record<string, string> = {};
    if (aliasGroups) {
      for (const group of aliasGroups) {
        if (group.length === 0) continue;
        const canonical = group[0];
        for (const name of group) {
          map[name] = canonical;
        }
      }
    }
    return map;
  }, [aliasGroups]);

  const mergedSnapshots = useMemo(() => {
    if (Object.keys(aliasByName).length === 0) return snapshots;
    return snapshots.map((snap) => {
      const merged: Record<string, { netChips: number; handsDealt: number }> = {};
      for (const [name, ps] of Object.entries(snap.playerStats)) {
        const canonical = aliasByName[name] ?? name;
        if (!merged[canonical]) {
          merged[canonical] = { netChips: 0, handsDealt: 0 };
        }
        merged[canonical].netChips += ps.netChips;
        merged[canonical].handsDealt += ps.handsDealt;
      }
      return { ...snap, playerStats: Object.fromEntries(
        Object.entries(merged).map(([name, m]) => [name, { ...snap.playerStats[name] ?? { name, handsDealt: 0, vpipHands: 0, pfrHands: 0, cbetHands: 0, cbetOpportunities: 0, sawFlopHands: 0, aggActions: 0, callActions: 0, handsWon: 0, wsdHands: 0, wsdWins: 0, netChips: 0, buyIn: 0, finalStack: 0, cashOut: 0 }, netChips: m.netChips, handsDealt: m.handsDealt }]),
      ) };
    });
  }, [snapshots, aliasByName]);

  const series = useMemo(() => {
    if (mergedSnapshots.length === 0) return [];

    const allPlayers = new Set<string>();
    for (const snap of mergedSnapshots) {
      for (const name of Object.keys(snap.playerStats)) {
        allPlayers.add(name);
      }
    }

    const playerList = Array.from(allPlayers);
    const lastSnap = mergedSnapshots[mergedSnapshots.length - 1];
    playerList.sort((a, b) => {
      const aNet = lastSnap.playerStats[a]?.netChips ?? 0;
      const bNet = lastSnap.playerStats[b]?.netChips ?? 0;
      return bNet - aNet;
    });

    return playerList.map((name, i): PlayerSeries => {
      let firstIdx = -1;
      let lastIdx = -1;
      for (let si = 0; si < mergedSnapshots.length; si++) {
        const ps = mergedSnapshots[si].playerStats[name];
        if (!ps) continue;
        if (si > 0) {
          const prevPs = mergedSnapshots[si - 1]?.playerStats[name];
          const prevDealt = prevPs?.handsDealt ?? 0;
          if (ps.handsDealt <= prevDealt) continue;
        }
        if (firstIdx === -1) firstIdx = si;
        lastIdx = si;
      }

      const segments: { hand: number; net: number }[][] = [];
      if (firstIdx !== -1) {
        const seg: { hand: number; net: number }[] = [];
        for (let si = firstIdx; si <= lastIdx; si++) {
          const ps = mergedSnapshots[si].playerStats[name];
          seg.push({
            hand: mergedSnapshots[si].handNumber,
            net: ps?.netChips ?? (seg.length > 0 ? seg[seg.length - 1].net : 0),
          });
        }
        segments.push(seg);
      }

      const allPoints = segments.flat();
      const lastPoint = allPoints.length > 0 ? allPoints[allPoints.length - 1] : null;

      return {
        name,
        displayName: getDisplayName(name),
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
        segments,
        lastPoint,
      };
    });
  }, [mergedSnapshots, getDisplayName]);

  useEffect(() => {
    if (!initializedRef.current && series.length > 0) {
      initializedRef.current = true;
      if (selfPlayerName) {
        setHiddenPlayers(new Set(series.filter((s) => s.name !== selfPlayerName).map((s) => s.name)));
      } else {
        setHiddenPlayers(new Set(series.map((s) => s.name)));
      }
    }
  }, [series, selfPlayerName]);

  const prevSelfRef = useRef(selfPlayerName);
  useEffect(() => {
    if (!initializedRef.current || !selfPlayerName || series.length === 0) return;
    if (prevSelfRef.current === selfPlayerName) return;
    prevSelfRef.current = selfPlayerName;
    setHiddenPlayers(new Set(series.filter((s) => s.name !== selfPlayerName).map((s) => s.name)));
  }, [selfPlayerName, series]);

  const visibleSeries = useMemo(
    () => series.filter((s) => !hiddenPlayers.has(s.name)),
    [series, hiddenPlayers],
  );

  const { minNet, maxNet, minHand, maxHand } = useMemo(() => {
    let mn = 0, mx = 0, mnh = 1, mxh = 1;
    const target = visibleSeries.length > 0 ? visibleSeries : series;
    for (const s of target) {
      for (const seg of s.segments) {
        for (const p of seg) {
          if (p.net < mn) mn = p.net;
          if (p.net > mx) mx = p.net;
          if (p.hand < mnh) mnh = p.hand;
          if (p.hand > mxh) mxh = p.hand;
        }
      }
    }
    const padding = Math.max(Math.abs(mx - mn) * 0.1, 10);
    return { minNet: mn - padding, maxNet: mx + padding, minHand: mnh, maxHand: mxh };
  }, [series, visibleSeries]);

  const CHART_W = 600;
  const CHART_H = 300;
  const PAD_L = 55;
  const PAD_R = 15;
  const PAD_T = 20;
  const PAD_B = 35;
  const plotW = CHART_W - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;

  const toX = useCallback(
    (hand: number) => PAD_L + ((hand - minHand) / Math.max(maxHand - minHand, 1)) * plotW,
    [minHand, maxHand, plotW],
  );
  const toY = useCallback(
    (net: number) => PAD_T + plotH - ((net - minNet) / Math.max(maxNet - minNet, 1)) * plotH,
    [minNet, maxNet, plotH],
  );

  const gridLines = useMemo(() => {
    const range = maxNet - minNet;
    const raw = range / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)));
    const nice = Math.ceil(raw / mag) * mag;
    const lines: number[] = [];
    const start = Math.floor(minNet / nice) * nice;
    for (let v = start; v <= maxNet; v += nice) {
      lines.push(v);
    }
    return lines;
  }, [minNet, maxNet]);

  const handTicks = useMemo(() => {
    const range = maxHand - minHand;
    if (range <= 0) return [minHand];
    const raw = range / 6;
    const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const nice = Math.max(1, Math.ceil(raw / mag) * mag);
    const ticks: number[] = [];
    const start = Math.ceil(minHand / nice) * nice;
    for (let v = start; v <= maxHand; v += nice) {
      ticks.push(v);
    }
    if (ticks.length === 0) ticks.push(minHand);
    return ticks;
  }, [minHand, maxHand]);

  const pathData = useMemo(() => {
    return series.map((s) => {
      const segPaths = s.segments.map((seg) => {
        const d = seg
          .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.hand).toFixed(1)} ${toY(p.net).toFixed(1)}`)
          .join(" ");

        let length = 0;
        for (let i = 1; i < seg.length; i++) {
          const x1 = toX(seg[i - 1].hand);
          const y1 = toY(seg[i - 1].net);
          const x2 = toX(seg[i].hand);
          const y2 = toY(seg[i].net);
          length += Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        }

        return { d, length: Math.ceil(length) + 1 };
      });
      return { name: s.name, segPaths };
    });
  }, [series, toX, toY]);

  const ANIM_DURATION = 2;

  const cursorHandNumber = currentHandIndex !== null
    ? snapshots[Math.min(currentHandIndex, snapshots.length - 1)]?.handNumber ?? null
    : null;

  const scrubFromClient = useCallback(
    (clientX: number, target: SVGSVGElement) => {
      if (snapshots.length === 0) return;
      const rect = target.getBoundingClientRect();
      const scaleX = CHART_W / rect.width;
      const x = (clientX - rect.left) * scaleX;
      const handFrac = (x - PAD_L) / plotW;
      const hand = Math.round(minHand + handFrac * (maxHand - minHand));
      onHandChange(Math.max(minHand, Math.min(maxHand, hand)));
    },
    [snapshots, minHand, maxHand, plotW, onHandChange],
  );

  const dragTargetRef = useRef<SVGSVGElement | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      dragTargetRef.current = e.currentTarget;
      scrubFromClient(e.clientX, e.currentTarget);
    },
    [scrubFromClient],
  );

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragTargetRef.current) return;
      scrubFromClient(e.clientX, dragTargetRef.current);
    }
    function onUp() {
      dragTargetRef.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [scrubFromClient]);

  function togglePlayer(name: string) {
    setHiddenPlayers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  if (snapshots.length === 0 || series.length === 0) return null;

  const zeroY = toY(0);

  const snapIdx = currentHandIndex !== null
    ? Math.min(currentHandIndex, snapshots.length - 1)
    : snapshots.length - 1;

  const tableRows = series
    .map((s) => {
      const net = mergedSnapshots[snapIdx]?.playerStats[s.name]?.netChips ?? 0;
      const isHidden = hiddenPlayers.has(s.name);
      return { name: s.name, displayName: s.displayName, color: s.color, net, isHidden };
    })
    .sort((a, b) => {
      if (a.isHidden !== b.isHidden) return a.isHidden ? 1 : -1;
      return b.net - a.net;
    });

  return (
    <div className="mt-3">
      <style>{`
        @keyframes drawLine {
          from { stroke-dashoffset: var(--path-length); }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes fadeInDot {
          from { opacity: 0; transform: scale(0); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 overflow-hidden">
        <button
          type="button"
          onClick={() => setChartVisible((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 bg-zinc-900/60 border-b border-zinc-800 hover:bg-zinc-900/80 transition-colors"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Net Chips
          </span>
          <span className="text-zinc-500 text-sm">{chartVisible ? "▲" : "▼"}</span>
        </button>

      {chartVisible && (
        <div className="flex gap-3 p-3">
          <div className="flex-1 min-w-0 rounded-lg border border-zinc-700 bg-zinc-900/60 p-2 overflow-hidden">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              className="w-full h-auto cursor-crosshair"
              preserveAspectRatio="xMidYMid meet"
              onMouseDown={handleMouseDown}
            >
              {gridLines.map((v) => (
                <g key={v}>
                  <line
                    x1={PAD_L}
                    y1={toY(v)}
                    x2={PAD_L + plotW}
                    y2={toY(v)}
                    stroke={v === 0 ? "#52525b" : "#27272a"}
                    strokeWidth={v === 0 ? 1.5 : 0.5}
                    strokeDasharray={v === 0 ? undefined : "4 4"}
                  />
                  <text
                    x={PAD_L - 8}
                    y={toY(v) + 4}
                    textAnchor="end"
                    fill="#71717a"
                    fontSize={11}
                    fontFamily="monospace"
                  >
                    {v >= 1000 || v <= -1000
                      ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`
                      : v}
                  </text>
                </g>
              ))}

              {handTicks.map((h) => (
                <text
                  key={h}
                  x={toX(h)}
                  y={CHART_H - 8}
                  textAnchor="middle"
                  fill="#71717a"
                  fontSize={11}
                  fontFamily="monospace"
                >
                  #{h}
                </text>
              ))}

              {zeroY >= PAD_T && zeroY <= PAD_T + plotH && (
                <line
                  x1={PAD_L}
                  y1={zeroY}
                  x2={PAD_L + plotW}
                  y2={zeroY}
                  stroke="#52525b"
                  strokeWidth={1}
                />
              )}

              {pathData.map((pd, idx) => {
                const s = series[idx];
                if (hiddenPlayers.has(s.name)) return null;
                const isHighlighted = hoveredPlayer === null || hoveredPlayer === s.name;
                return pd.segPaths.map((seg, segIdx) => (
                  <path
                    key={`${s.name}-${segIdx}-${animKey}`}
                    d={seg.d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={hoveredPlayer === s.name ? 3 : 1.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity={isHighlighted ? 1 : 0.15}
                    strokeDasharray={seg.length}
                    strokeDashoffset={0}
                    style={{
                      "--path-length": seg.length,
                      animation: `drawLine ${ANIM_DURATION}s cubic-bezier(0.25, 0.1, 0.25, 1) forwards`,
                      transition: "opacity 0.15s, stroke-width 0.15s",
                    } as React.CSSProperties}
                  />
                ));
              })}

              {cursorHandNumber !== null && (
                <line
                  x1={toX(cursorHandNumber)}
                  y1={PAD_T}
                  x2={toX(cursorHandNumber)}
                  y2={PAD_T + plotH}
                  stroke="#fbbf24"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.8}
                />
              )}

              {cursorHandNumber !== null &&
                series.map((s) => {
                  if (hiddenPlayers.has(s.name)) return null;
                  const net = mergedSnapshots[snapIdx]?.playerStats[s.name]?.netChips ?? 0;
                  const isHighlighted = hoveredPlayer === null || hoveredPlayer === s.name;
                  return (
                    <circle
                      key={s.name}
                      cx={toX(cursorHandNumber)}
                      cy={toY(net)}
                      r={hoveredPlayer === s.name ? 5 : 3.5}
                      fill={s.color}
                      stroke="#18181b"
                      strokeWidth={1.5}
                      opacity={isHighlighted ? 1 : 0.2}
                      style={{ transition: "opacity 0.15s" }}
                    />
                  );
                })}

              {cursorHandNumber === null &&
                series.map((s) => {
                  if (hiddenPlayers.has(s.name)) return null;
                  if (!s.lastPoint) return null;
                  const isHighlighted = hoveredPlayer === null || hoveredPlayer === s.name;
                  return (
                    <circle
                      key={`end-${s.name}-${animKey}`}
                      cx={toX(s.lastPoint.hand)}
                      cy={toY(s.lastPoint.net)}
                      r={hoveredPlayer === s.name ? 5 : 3.5}
                      fill={s.color}
                      stroke="#18181b"
                      strokeWidth={1.5}
                      opacity={isHighlighted ? 1 : 0.2}
                      style={{
                        animation: `fadeInDot 0.3s ease-out ${ANIM_DURATION}s both`,
                        transition: "opacity 0.15s",
                      }}
                    />
                  );
                })}
            </svg>
          </div>

          <div className="w-48 shrink-0 rounded-lg border border-zinc-700 bg-zinc-900/60 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  if (hiddenPlayers.size === 0) {
                    setHiddenPlayers(new Set(series.map((s) => s.name)));
                  } else {
                    setHiddenPlayers(new Set());
                  }
                }}
                className="rounded border border-zinc-600 bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-300 hover:bg-zinc-700 hover:border-zinc-500 transition-colors"
              >
                {hiddenPlayers.size === 0 ? "Clear All" : "Select All"}
              </button>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Net</span>
            </div>
            <div className="px-3 py-1 border-b border-zinc-800">
              <span className="text-xs text-zinc-500 italic">Click player to toggle</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="flex items-center gap-2 px-3 py-1">
                <span className="text-[10px] text-zinc-600 shrink-0">Selected</span>
                <div className="flex-1 border-t border-zinc-700" />
              </div>
              {tableRows.filter((r) => !r.isHidden).map((row) => {
                const isHighlighted = hoveredPlayer === null || hoveredPlayer === row.name;
                return (
                  <button
                    key={row.name}
                    type="button"
                    className="group flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-zinc-800/60 cursor-pointer"
                    style={{ opacity: isHighlighted ? 1 : 0.4 }}
                    onClick={() => togglePlayer(row.name)}
                    onMouseEnter={() => setHoveredPlayer(row.name)}
                    onMouseLeave={() => setHoveredPlayer(null)}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full ring-1 ring-transparent group-hover:ring-zinc-500 transition-all"
                      style={{ backgroundColor: row.color }}
                    />
                    <span className="flex-1 truncate text-xs text-zinc-300">
                      {row.displayName}
                    </span>
                    <span
                      className={`shrink-0 text-xs font-mono tabular-nums ${
                        row.net > 0 ? "text-green-400" : row.net < 0 ? "text-red-400" : "text-zinc-500"
                      }`}
                    >
                      {row.net > 0 ? "+" : ""}{row.net}
                    </span>
                  </button>
                );
              })}
              <div className="flex items-center gap-2 px-3 py-1">
                <span className="text-[10px] text-zinc-600 shrink-0">Hidden</span>
                <div className="flex-1 border-t border-zinc-700" />
              </div>
              {tableRows.filter((r) => r.isHidden).map((row) => (
                <button
                  key={row.name}
                  type="button"
                  className="group flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-zinc-800/60 cursor-pointer"
                  onClick={() => togglePlayer(row.name)}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full ring-1 ring-transparent group-hover:ring-zinc-500 transition-all"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="flex-1 truncate text-xs text-zinc-300">
                    {row.displayName}
                  </span>
                  <span
                    className={`shrink-0 text-xs font-mono tabular-nums ${
                      row.net > 0 ? "text-green-400" : row.net < 0 ? "text-red-400" : "text-zinc-500"
                    }`}
                  >
                    {row.net > 0 ? "+" : ""}{row.net}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
