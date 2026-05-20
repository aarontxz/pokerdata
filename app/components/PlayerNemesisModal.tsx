"use client";

interface PlayerNemesisModalProps {
  open: boolean;
  playerName: string;
  /** headToHead[opponentName] = net chips gained by this player from that opponent */
  headToHead: Record<string, number>;
  /** Resolve canonical display name for an opponent */
  getDisplayName: (name: string) => string;
  onClose: () => void;
}

function sign(n: number): string {
  // Show as integer if whole number, otherwise show with needed decimals.
  const rounded = Math.round(n * 100) / 100;
  const str = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2);
  return rounded > 0 ? `+${str}` : str;
}

export default function PlayerNemesisModal({
  open,
  playerName,
  headToHead,
  getDisplayName,
  onClose,
}: PlayerNemesisModalProps) {
  if (!open) return null;

  // Keep raw values for correct total; sort worst (nemesis) first.
  const rows = Object.entries(headToHead)
    .map(([oppName, net]) => ({ oppName, net }))
    .sort((a, b) => a.net - b.net);

  // Total is computed from raw values — matches the player's net exactly
  // after parser-side reconciliation.
  const total = rows.reduce((s, r) => s + r.net, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-zinc-100">
              {playerName} — Head-to-Head
            </h2>
            {rows[0] && rows[0].net < 0 && (
              <p className="text-xs text-red-400 mt-0.5">
                Nemesis: <span className="font-semibold">{getDisplayName(rows[0].oppName)}</span>
                {" "}({sign(rows[0].net)})
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Table */}
        <div className="overflow-y-auto max-h-[60vh]">
          {rows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-zinc-400">No head-to-head data available.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-900 text-zinc-400 uppercase text-xs tracking-wider">
                  <th className="px-5 py-2 text-left">Opponent</th>
                  <th className="px-5 py-2 text-right">Net vs Them</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ oppName, net }, i) => (
                  <tr
                    key={oppName}
                    className={`border-t border-zinc-800 ${i % 2 === 0 ? "bg-zinc-900/40" : "bg-zinc-900/10"}`}
                  >
                    <td className="px-5 py-2 text-zinc-200 whitespace-nowrap">
                      {getDisplayName(oppName)}
                    </td>
                    <td
                      className={`px-5 py-2 text-right font-semibold tabular-nums ${
                        net > 0 ? "text-green-400" : net < 0 ? "text-red-400" : "text-zinc-400"
                      }`}
                    >
                      {sign(net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer: total should equal player's net */}
        <div className="border-t border-zinc-800 px-5 py-3 flex justify-between items-center text-xs text-zinc-400">
          <span>{rows.length} opponent{rows.length !== 1 ? "s" : ""}</span>
          <span>
            Total:{" "}
            <span
              className={`font-semibold tabular-nums ${
                total > 0 ? "text-green-400" : total < 0 ? "text-red-400" : "text-zinc-400"
              }`}
            >
              {sign(total)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
