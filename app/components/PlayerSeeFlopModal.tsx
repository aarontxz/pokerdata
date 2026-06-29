"use client";

import type { HandReference } from "../lib/pokerParser";

interface PlayerSeeFlopModalProps {
  open: boolean;
  playerName: string;
  sawFlopHands: HandReference[];
  noFlopHands: HandReference[];
  onClose: () => void;
  sessionCount?: number;
}

function sorted(handRefs: HandReference[]): HandReference[] {
  return [...handRefs].sort((a, b) => a.sessionNumber - b.sessionNumber || a.handNumber - b.handNumber);
}

function formatHandRef(handRef: HandReference, sessionCount?: number): string {
  if (sessionCount === 1) {
    return `#${handRef.handNumber}`;
  }
  return `(#${handRef.sessionNumber},#${handRef.handNumber})`;
}

export default function PlayerSeeFlopModal({
  open,
  playerName,
  sawFlopHands,
  noFlopHands,
  onClose,
  sessionCount,
}: PlayerSeeFlopModalProps) {
  if (!open) return null;

  const saw = sorted(sawFlopHands);
  const noFlop = sorted(noFlopHands);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 sm:p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`See flop hands for ${playerName}`}
    >
      <div
        className="w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl max-h-[85vh] sm:max-h-none flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5 sm:px-4 sm:py-3 shrink-0">
          <div>
            <h3 className="text-xs sm:text-sm font-semibold text-zinc-100">See Flop: {playerName}</h3>
            <p className="text-[10px] sm:text-xs text-zinc-400">Saw flop: {saw.length} · No flop: {noFlop.length}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 p-2 sm:p-4 md:grid-cols-2 overflow-y-auto flex-1">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/30 p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">Saw Flop</h4>
            {saw.length === 0 ? (
              <p className="text-sm text-zinc-500">None</p>
            ) : (
              <div className="max-h-72 overflow-y-auto text-sm text-zinc-200">
                {saw.map((ref) => formatHandRef(ref, sessionCount)).join(", ")}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/30 p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">Did Not See Flop</h4>
            {noFlop.length === 0 ? (
              <p className="text-sm text-zinc-500">None</p>
            ) : (
              <div className="max-h-72 overflow-y-auto text-sm text-zinc-200">
                {noFlop.map((ref) => formatHandRef(ref, sessionCount)).join(", ")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
