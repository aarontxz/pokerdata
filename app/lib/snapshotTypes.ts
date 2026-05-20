import type { PokerLogParseResult } from "./pokerParser";

export interface SessionTimeRange {
  startIso: string | null;
  endIso: string | null;
}

export interface SnapshotPayload {
  version: 1;
  sessions: PokerLogParseResult[];
  sessionTimeRanges: SessionTimeRange[];
  aliasGroups: string[][];
  selectedNameByPlayer: Record<string, string>;
}
