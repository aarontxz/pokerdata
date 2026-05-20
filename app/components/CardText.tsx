type SuitTone = "heart" | "diamond" | "club" | "spade";

interface ParsedCard {
  rank: string;
  suit: string | null;
  tone: SuitTone | null;
}

const SUIT_META: Record<string, { symbol: string; tone: SuitTone }> = {
  s: { symbol: "♠", tone: "spade" },
  h: { symbol: "♥", tone: "heart" },
  d: { symbol: "♦", tone: "diamond" },
  c: { symbol: "♣", tone: "club" },
  "♠": { symbol: "♠", tone: "spade" },
  "♥": { symbol: "♥", tone: "heart" },
  "♦": { symbol: "♦", tone: "diamond" },
  "♣": { symbol: "♣", tone: "club" },
};

function parseCard(card: string): ParsedCard {
  const trimmed = card.trim();
  if (trimmed.length < 2) {
    return { rank: trimmed, suit: null, tone: null };
  }

  const cardMatch = trimmed.match(/(10|[2-9TJQKA])\s*([shdc♠♥♦♣])/i);
  if (!cardMatch) {
    return { rank: trimmed, suit: null, tone: null };
  }

  const suitKey = cardMatch[2].toLowerCase();
  const meta = SUIT_META[suitKey] ?? SUIT_META[cardMatch[2]];
  if (!meta) {
    return { rank: trimmed, suit: null, tone: null };
  }

  return {
    rank: cardMatch[1].toUpperCase(),
    suit: meta.symbol,
    tone: meta.tone,
  };
}

function suitClassName(tone: SuitTone): string {
  if (tone === "heart") return "text-red-400";
  if (tone === "diamond") return "text-blue-400";
  if (tone === "spade") return "text-purple-400";
  return "text-green-400";
}

export function CardText({ card }: { card: string }) {
  const parsed = parseCard(card);

  if (!parsed.suit || !parsed.tone) {
    return <span>{parsed.rank}</span>;
  }

  return (
    <span className="inline-flex items-baseline whitespace-nowrap">
      <span>{parsed.rank}</span>
      <span className={suitClassName(parsed.tone)}>{parsed.suit}</span>
    </span>
  );
}

export function CardPair({ cards }: { cards: string[] }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-1 whitespace-nowrap">
      {cards.map((card, index) => (
        <CardText key={`${card}-${index}`} card={card} />
      ))}
    </span>
  );
}

export function CardRow({ cards }: { cards: string[] }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-1 whitespace-nowrap">
      {cards.map((card, index) => (
        <CardText key={`${card}-${index}`} card={card} />
      ))}
    </span>
  );
}

export function SuitText({ suit }: { suit: string }) {
  const meta = SUIT_META[suit.toLowerCase()] ?? SUIT_META[suit];
  if (!meta) return <span>{suit}</span>;
  return <span className={suitClassName(meta.tone)}>{meta.symbol}</span>;
}