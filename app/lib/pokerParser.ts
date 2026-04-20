export interface PlayerStats {
  name: string;
  handsDealt: number;
  vpipHands: number;
  pfrHands: number;
  cbetHands: number;
  cbetOpportunities: number;
  sawFlopHands: number;
  aggActions: number; // bets + raises
  callActions: number;
  handsWon: number;
  netChips: number;
  buyIn: number;
  finalStack: number;
  cashOut: number;
}

export interface PreflopRaiseRecord {
  sessionNumber: number;
  handNumber: number;
  handId: string | null;
  raiseTo: number;
  raiseSize: number;
  raiseOverPrevBet: number;
  isReraise: boolean;
  preflopRaiseNumber: number;
  preflopBetLevel: number;
  holeCards: [string, string] | null;
}

export interface HandReference {
  sessionNumber: number;
  handNumber: number;
}

export interface CBetRecord {
  sessionNumber: number;
  handNumber: number;
  handId: string | null;
  holeCards: [string, string] | null;
  flopCards: [string, string, string] | null;
  potBeforeCBet: number;
  cbetAmount: number;
}

export interface PokerLogParseResult {
  players: PlayerStats[];
  preflopRaisesByPlayer: Record<string, PreflopRaiseRecord[]>;
  cbetRecordsByPlayer: Record<string, CBetRecord[]>;
  sawFlopHandsByPlayer: Record<string, HandReference[]>;
  noFlopHandsByPlayer: Record<string, HandReference[]>;
}

export function mergePokerLogResults(results: PokerLogParseResult[]): PokerLogParseResult {
  const multiSession = results.length > 1;
  const mergedPlayers: Record<string, PlayerStats> = {};
  const preflopRaisesByPlayer: Record<string, PreflopRaiseRecord[]> = {};
  const cbetRecordsByPlayer: Record<string, CBetRecord[]> = {};
  const sawFlopHandsByPlayer: Record<string, HandReference[]> = {};
  const noFlopHandsByPlayer: Record<string, HandReference[]> = {};
  const canonicalNameById: Record<string, string> = {};
  const aliasesByCanonicalName: Record<string, string[]> = {};

  function splitNameAndId(name: string): { baseName: string; playerId: string | null } {
    const at = name.lastIndexOf(" @ ");
    if (at === -1) return { baseName: name, playerId: null };
    return {
      baseName: name.slice(0, at),
      playerId: name.slice(at + 3),
    };
  }

  for (const [resultIndex, result] of results.entries()) {
    const sessionNumber = resultIndex + 1;
    const tag = multiSession ? ` (#${sessionNumber})` : "";

    // Use player ID as stable identity across sessions. If no ID is present,
    // keep session tags so unknown identities do not auto-merge.
    function mergedName(name: string): string {
      const { baseName, playerId } = splitNameAndId(name);
      if (playerId) {
        const existingCanonical = canonicalNameById[playerId];
        if (existingCanonical) {
          const aliases = aliasesByCanonicalName[existingCanonical] ?? [];
          if (!aliases.includes(baseName)) aliases.push(baseName);
          aliasesByCanonicalName[existingCanonical] = aliases;
          return existingCanonical;
        }
        canonicalNameById[playerId] = `${baseName} @ ${playerId}`;
        aliasesByCanonicalName[canonicalNameById[playerId]] = [baseName];
        return canonicalNameById[playerId];
      }
      if (!tag) return name;
      return baseName + tag;
    }

    for (const player of result.players) {
      const taggedName = mergedName(player.name);
      if (!mergedPlayers[taggedName]) {
        mergedPlayers[taggedName] = {
          name: taggedName,
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

      mergedPlayers[taggedName].handsDealt += player.handsDealt;
      mergedPlayers[taggedName].vpipHands += player.vpipHands;
      mergedPlayers[taggedName].pfrHands += player.pfrHands;
      mergedPlayers[taggedName].cbetHands += player.cbetHands;
      mergedPlayers[taggedName].cbetOpportunities += player.cbetOpportunities;
      mergedPlayers[taggedName].sawFlopHands += player.sawFlopHands;
      mergedPlayers[taggedName].aggActions += player.aggActions;
      mergedPlayers[taggedName].callActions += player.callActions;
      mergedPlayers[taggedName].handsWon += player.handsWon;
      mergedPlayers[taggedName].netChips += player.netChips;
      mergedPlayers[taggedName].buyIn += player.buyIn;
      mergedPlayers[taggedName].finalStack += player.finalStack;
      mergedPlayers[taggedName].cashOut += player.cashOut;
    }

    for (const [name, raises] of Object.entries(result.preflopRaisesByPlayer)) {
      const taggedName = mergedName(name);
      if (!preflopRaisesByPlayer[taggedName]) preflopRaisesByPlayer[taggedName] = [];
      preflopRaisesByPlayer[taggedName].push(
        ...raises.map((raise) => ({
          ...raise,
          sessionNumber,
        })),
      );
    }

    for (const [name, records] of Object.entries(result.cbetRecordsByPlayer)) {
      const taggedName = mergedName(name);
      if (!cbetRecordsByPlayer[taggedName]) cbetRecordsByPlayer[taggedName] = [];
      cbetRecordsByPlayer[taggedName].push(
        ...records.map((record) => ({
          ...record,
          sessionNumber,
        })),
      );
    }

    for (const [name, handRefs] of Object.entries(result.sawFlopHandsByPlayer)) {
      const taggedName = mergedName(name);
      if (!sawFlopHandsByPlayer[taggedName]) sawFlopHandsByPlayer[taggedName] = [];
      sawFlopHandsByPlayer[taggedName].push(
        ...handRefs.map((handRef) => ({
          ...handRef,
          sessionNumber,
        })),
      );
    }

    for (const [name, handRefs] of Object.entries(result.noFlopHandsByPlayer)) {
      const taggedName = mergedName(name);
      if (!noFlopHandsByPlayer[taggedName]) noFlopHandsByPlayer[taggedName] = [];
      noFlopHandsByPlayer[taggedName].push(
        ...handRefs.map((handRef) => ({
          ...handRef,
          sessionNumber,
        })),
      );
    }
  }

  for (const raises of Object.values(preflopRaisesByPlayer)) {
    raises.sort((a, b) => a.sessionNumber - b.sessionNumber || a.handNumber - b.handNumber);
  }

  for (const records of Object.values(cbetRecordsByPlayer)) {
    records.sort((a, b) => a.sessionNumber - b.sessionNumber || a.handNumber - b.handNumber);
  }

  for (const handRefs of Object.values(sawFlopHandsByPlayer)) {
    handRefs.sort((a, b) => a.sessionNumber - b.sessionNumber || a.handNumber - b.handNumber);
  }

  for (const handRefs of Object.values(noFlopHandsByPlayer)) {
    handRefs.sort((a, b) => a.sessionNumber - b.sessionNumber || a.handNumber - b.handNumber);
  }

  const renameByOldName: Record<string, string> = {};
  for (const [playerId, canonicalName] of Object.entries(canonicalNameById)) {
    const aliases = aliasesByCanonicalName[canonicalName] ?? [];
    if (aliases.length <= 1) continue;
    const mergedAliasName = `${aliases.join(" / ")} @ ${playerId}`;
    if (mergedAliasName !== canonicalName) {
      renameByOldName[canonicalName] = mergedAliasName;
    }
  }

  function renamePlayerKeys<T>(byPlayer: Record<string, T>): Record<string, T> {
    const renamed: Record<string, T> = {};
    for (const [oldName, value] of Object.entries(byPlayer)) {
      renamed[renameByOldName[oldName] ?? oldName] = value;
    }
    return renamed;
  }

  const renamedMergedPlayers = renamePlayerKeys(mergedPlayers);
  const renamedPreflopRaisesByPlayer = renamePlayerKeys(preflopRaisesByPlayer);
  const renamedCbetRecordsByPlayer = renamePlayerKeys(cbetRecordsByPlayer);
  const renamedSawFlopHandsByPlayer = renamePlayerKeys(sawFlopHandsByPlayer);
  const renamedNoFlopHandsByPlayer = renamePlayerKeys(noFlopHandsByPlayer);

  for (const [name, player] of Object.entries(renamedMergedPlayers)) {
    player.name = name;
  }

  return {
    players: Object.values(renamedMergedPlayers),
    preflopRaisesByPlayer: renamedPreflopRaisesByPlayer,
    cbetRecordsByPlayer: renamedCbetRecordsByPlayer,
    sawFlopHandsByPlayer: renamedSawFlopHandsByPlayer,
    noFlopHandsByPlayer: renamedNoFlopHandsByPlayer,
  };
}

interface HandPreflopRaiseEvent {
  player: string;
  raiseTo: number;
  raiseSize: number;
  raiseOverPrevBet: number;
  preflopRaiseNumber: number;
  preflopBetLevel: number;
}

interface HandState {
  handNumber: number;
  handId: string | null;
  players: string[];
  sbPlayer: string | null;
  bbPlayer: string | null;
  street: "preflop" | "flop" | "turn" | "river";
  // Highest total contribution any player has on current street
  streetTarget: number;
  // How much each player has put in on the current street (resets each street)
  streetPutIn: Record<string, number>;
  // Total in for the whole hand
  totalPutIn: Record<string, number>;
  // Chips collected from pot this hand
  collected: Record<string, number>;
  // Uncalled bets returned this hand
  uncalledReturned: Record<string, number>;
  // Players who voluntarily put money in preflop
  vpipPlayers: Set<string>;
  // Players who raised preflop
  pfrPlayers: Set<string>;
  // Players who folded preflop in this hand.
  preflopFolders: Set<string>;
  // Preflop raise events for this hand (open raise, 3-bet, etc.)
  preflopRaises: HandPreflopRaiseEvent[];
  // Last player who took the aggressive action preflop.
  lastPreflopRaiser: string | null;
  // Whether the hand reached the flop.
  reachedFlop: boolean;
  // Whether the last preflop raiser made an aggressive flop action.
  cbetMadeOnFlop: boolean;
  // Pot size immediately before the c-bet action.
  potBeforeCBet: number | null;
  // Chip amount invested by the c-bettor on the c-bet action.
  cbetAmount: number | null;
  // Flop board cards captured from the flop line.
  flopCards: [string, string, string] | null;
  // Hole cards revealed at showdown for this hand.
  shownCards: Record<string, [string, string]>;
}

/** Round a chip value to 2 decimal places to avoid floating-point drift. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function extractPlayerName(action: string): string | null {
  const m = action.match(/^"([^"]+)"/);
  return m ? m[1] : null;
}

function parseEventLine(line: string, useTab: boolean): { action: string; seqStr: string } | null {
  if (useTab) {
    const parts = line.split("\t");
    if (parts.length < 3) return null;
    return {
      action: parts[0].trim(),
      seqStr: parts[2].trim(),
    };
  }

  // CSV export is action,timestamp,sequence, but action itself can contain commas.
  // Split from the right so commas in action don't break parsing.
  const m = line.match(/^(.*),([^,]+),([^,]+)$/);
  if (!m) return null;

  let action = m[1].trim();
  const seqStr = m[3].trim();

  // Remove optional surrounding CSV quotes and unescape doubled quotes.
  if (action.startsWith('"') && action.endsWith('"') && action.length >= 2) {
    action = action.slice(1, -1).replace(/""/g, '"');
  }

  return { action, seqStr };
}

export function parsePokerLog(content: string): PlayerStats[] {
  return parsePokerLogDetailed(content).players;
}

export function parsePokerLogDetailed(content: string): PokerLogParseResult {
  const rawLines = content.split(/\r?\n/).filter((l) => l.trim() !== "");

  // Auto-detect delimiter: tab-separated or comma-separated (CSV)
  const sampleLine = rawLines.find((l) => l.includes("\t") || l.includes(",")) ?? "";
  const useTab = sampleLine.includes("\t");

  type Event = { action: string; seq: bigint };
  const events: Event[] = [];

  for (const line of rawLines) {
    const parsed = parseEventLine(line, useTab);
    if (!parsed) continue;
    const { action, seqStr } = parsed;
    try {
      events.push({ action, seq: BigInt(seqStr) });
    } catch {
      // skip malformed lines
    }
  }

  // Sort chronologically by sequence number (ascending)
  events.sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0));

  const stats: Record<string, PlayerStats> = {};
  const netMovements: Record<string, number> = {};
  const totalBuyIn: Record<string, number> = {};
  const totalCashOut: Record<string, number> = {};
  const lastKnownStack: Record<string, number> = {};
  const hasInHandBaseline: Record<string, boolean> = {};
  const preflopRaisesByPlayer: Record<string, PreflopRaiseRecord[]> = {};
  const cbetRecordsByPlayer: Record<string, CBetRecord[]> = {};
  const sawFlopHandsByPlayer: Record<string, HandReference[]> = {};
  const noFlopHandsByPlayer: Record<string, HandReference[]> = {};

  // Track action log for debugging specific hands
  const handActionLog: Record<number, { player: string; action: string; amount: number }[]> = {};

  let hand: HandState | null = null;

  function ensurePlayer(name: string) {
    if (!stats[name]) {
      stats[name] = {
        name,
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
    if (netMovements[name] === undefined) netMovements[name] = 0;
    if (hasInHandBaseline[name] === undefined) hasInHandBaseline[name] = false;
    if (preflopRaisesByPlayer[name] === undefined) preflopRaisesByPlayer[name] = [];
    if (cbetRecordsByPlayer[name] === undefined) cbetRecordsByPlayer[name] = [];
    if (sawFlopHandsByPlayer[name] === undefined) sawFlopHandsByPlayer[name] = [];
    if (noFlopHandsByPlayer[name] === undefined) noFlopHandsByPlayer[name] = [];
  }

  // Merges all accumulated data from oldName into newName (for ID changes).
  function migratePlayer(oldName: string, newName: string) {
    if (oldName === newName) return;
    ensurePlayer(newName);
    if (stats[oldName]) {
      stats[newName].handsDealt += stats[oldName].handsDealt;
      stats[newName].vpipHands += stats[oldName].vpipHands;
      stats[newName].pfrHands += stats[oldName].pfrHands;
      stats[newName].cbetHands += stats[oldName].cbetHands;
      stats[newName].cbetOpportunities += stats[oldName].cbetOpportunities;
      stats[newName].sawFlopHands += stats[oldName].sawFlopHands;
      stats[newName].aggActions += stats[oldName].aggActions;
      stats[newName].callActions += stats[oldName].callActions;
      stats[newName].handsWon += stats[oldName].handsWon;
      delete stats[oldName];
    }
    if (netMovements[oldName] !== undefined) {
      netMovements[newName] = r2((netMovements[newName] ?? 0) + netMovements[oldName]);
      delete netMovements[oldName];
    }
    if (totalBuyIn[oldName] !== undefined) {
      totalBuyIn[newName] = r2((totalBuyIn[newName] ?? 0) + totalBuyIn[oldName]);
      delete totalBuyIn[oldName];
    }
    if (totalCashOut[oldName] !== undefined) {
      totalCashOut[newName] = r2((totalCashOut[newName] ?? 0) + totalCashOut[oldName]);
      delete totalCashOut[oldName];
    }
    if (lastKnownStack[oldName] !== undefined) {
      lastKnownStack[newName] = lastKnownStack[oldName];
      delete lastKnownStack[oldName];
    }
    if (hasInHandBaseline[oldName] !== undefined) {
      hasInHandBaseline[newName] = hasInHandBaseline[oldName];
      delete hasInHandBaseline[oldName];
    }
    if (sawFlopHandsByPlayer[oldName] !== undefined) {
      sawFlopHandsByPlayer[newName] = [
        ...(sawFlopHandsByPlayer[newName] ?? []),
        ...sawFlopHandsByPlayer[oldName],
      ];
      delete sawFlopHandsByPlayer[oldName];
    }
    if (cbetRecordsByPlayer[oldName] !== undefined) {
      cbetRecordsByPlayer[newName] = [
        ...(cbetRecordsByPlayer[newName] ?? []),
        ...cbetRecordsByPlayer[oldName],
      ];
      delete cbetRecordsByPlayer[oldName];
    }
    if (noFlopHandsByPlayer[oldName] !== undefined) {
      noFlopHandsByPlayer[newName] = [
        ...(noFlopHandsByPlayer[newName] ?? []),
        ...noFlopHandsByPlayer[oldName],
      ];
      delete noFlopHandsByPlayer[oldName];
    }
  }

  function increaseBuyIn(name: string, amount: number, reason: string, handNumber: number) {
    if (amount <= 0) return;
    totalBuyIn[name] = r2((totalBuyIn[name] ?? 0) + amount);
  }

  function putIn(h: HandState, name: string, amount: number) {
    h.streetPutIn[name] = r2((h.streetPutIn[name] ?? 0) + amount);
    h.totalPutIn[name] = r2((h.totalPutIn[name] ?? 0) + amount);
  }

  // Dead blinds reduce stack and count toward net, but are not live chips for this street.
  function putInDead(h: HandState, name: string, amount: number) {
    h.totalPutIn[name] = r2((h.totalPutIn[name] ?? 0) + amount);
  }

  function resetStreet(h: HandState) {
    h.streetTarget = 0;
    h.streetPutIn = {};
  }

  function currentPotSize(h: HandState): number {
    const putIn = Object.values(h.totalPutIn).reduce((sum, n) => sum + n, 0);
    const returned = Object.values(h.uncalledReturned).reduce((sum, n) => sum + n, 0);
    return r2(putIn - returned);
  }

  function logAction(handNumber: number, player: string, action: string, amount: number) {
    if (!handActionLog[handNumber]) {
      handActionLog[handNumber] = [];
    }
    handActionLog[handNumber].push({ player, action, amount });
  }

  function finalizeHand(h: HandState) {
    for (const player of h.players) {
      const spent = h.totalPutIn[player] ?? 0;
      const gained = r2((h.collected[player] ?? 0) + (h.uncalledReturned[player] ?? 0));
      const handNet = r2(gained - spent);
      netMovements[player] = r2((netMovements[player] ?? 0) + handNet);

      // Keep lastKnownStack in sync so rebuy detection works on next hand
      if (lastKnownStack[player] !== undefined) {
        lastKnownStack[player] = r2(lastKnownStack[player] + handNet);
      }

      if (h.vpipPlayers.has(player)) stats[player].vpipHands++;
      if (h.pfrPlayers.has(player)) stats[player].pfrHands++;
      if (h.reachedFlop && h.lastPreflopRaiser === player && !h.preflopFolders.has(player)) {
        stats[player].cbetOpportunities++;
        if (h.cbetMadeOnFlop) {
          stats[player].cbetHands++;
          cbetRecordsByPlayer[player].push({
            sessionNumber: 1,
            handNumber: h.handNumber,
            handId: h.handId,
            holeCards: h.shownCards[player] ?? null,
            flopCards: h.flopCards,
            potBeforeCBet: r2(h.potBeforeCBet ?? 0),
            cbetAmount: r2(h.cbetAmount ?? 0),
          });
        }
      }
      if (!h.preflopFolders.has(player)) {
        stats[player].sawFlopHands++;
        sawFlopHandsByPlayer[player].push({ sessionNumber: 1, handNumber: h.handNumber });
      } else {
        noFlopHandsByPlayer[player].push({ sessionNumber: 1, handNumber: h.handNumber });
      }
      if ((h.collected[player] ?? 0) > 0) stats[player].handsWon++;
    }

    for (const raise of h.preflopRaises) {
      const shown = h.shownCards[raise.player] ?? null;
      preflopRaisesByPlayer[raise.player].push({
        sessionNumber: 1,
        handNumber: h.handNumber,
        handId: h.handId,
        raiseTo: r2(raise.raiseTo),
        raiseSize: r2(raise.raiseSize),
        raiseOverPrevBet: r2(raise.raiseOverPrevBet),
        isReraise: raise.preflopRaiseNumber > 1,
        preflopRaiseNumber: raise.preflopRaiseNumber,
        preflopBetLevel: raise.preflopBetLevel,
        holeCards: shown,
      });
    }

    // Check for net drift after every hand
    for (const player of h.players) {
      const net = netMovements[player] ?? 0;
      const buyIn = totalBuyIn[player] ?? 0;
      const finalStack = lastKnownStack[player] ?? 0;
      const cashOut = totalCashOut[player] ?? 0;

      const expected = finalStack + cashOut - buyIn;
      if (Math.abs(net - expected) > 0.005) {
        // Build action log for this hand and player
        const playerActions = (handActionLog[h.handNumber] ?? []).filter((a) => a.player === player);
        const actionSummary = playerActions
          .map((a) => `${a.action}(${a.amount})`)
          .join(", ");

        const spent = (h.totalPutIn[player] ?? 0);
        const gained = ((h.collected[player] ?? 0) + (h.uncalledReturned[player] ?? 0));

        throw new Error(
          `[net-drift] Parsing stopped at hand ${h.handNumber}. Player "${player}" has net drift: ` +
          `netChips=${net} but expected=${expected} (diff=${net - expected}). ` +
          `Values: final=${finalStack} cashOut=${cashOut} buyIn=${buyIn}. ` +
          `Hand accounting: spent=${spent}, gained=${gained}, net=${gained - spent}. ` +
          `Actions: ${actionSummary}. ` +
          `This indicates a parsing error in hand ${h.handNumber}.`,
        );
      }
    }
  }

  for (const { action } of events) {
    // ── Hand start ───────────────────────────────────────────────────
    const startM = action.match(/^-- starting hand #(\d+)(?: \(id: ([^)]+)\))?/);
    if (startM) {
      hand = {
        handNumber: parseInt(startM[1]),
        handId: startM[2] ?? null,
        players: [],
        sbPlayer: null,
        bbPlayer: null,
        street: "preflop",
        streetTarget: 0,
        streetPutIn: {},
        totalPutIn: {},
        collected: {},
        uncalledReturned: {},
        vpipPlayers: new Set(),
        pfrPlayers: new Set(),
        preflopFolders: new Set(),
        preflopRaises: [],
        lastPreflopRaiser: null,
        reachedFlop: false,
        cbetMadeOnFlop: false,
        potBeforeCBet: null,
        cbetAmount: null,
        flopCards: null,
        shownCards: {},
      };
      continue;
    }

    // ── Hand end ─────────────────────────────────────────────────────
    if (/^-- ending hand #\d+/.test(action)) {
      if (hand) {
        finalizeHand(hand);
        hand = null;
      }
      continue;
    }

    // ── Player ID change due to authenticated login ────────────────
    // Example: The player "Ziqi @ 9LD-cw1HsK" changed the ID from 7GjwOVHxnf to 9LD-cw1HsK because authenticated login.
    const idChangeM = action.match(
      /^The player "([^"]+)" changed the ID from (\S+) to \S+ because authenticated login\.?$/,
    );
    if (idChangeM) {
      const newName = idChangeM[1];
      const oldId = idChangeM[2];
      const atIdx = newName.lastIndexOf(" @ ");
      const basePart = atIdx >= 0 ? newName.slice(0, atIdx) : newName;
      const oldName = `${basePart} @ ${oldId}`;
      if (oldName !== newName) {
        migratePlayer(oldName, newName);
        // If the ID change fires mid-hand, patch all in-hand state so that
        // finalizeHand and subsequent actions use the new name.
        if (hand) {
          const idx = hand.players.indexOf(oldName);
          if (idx >= 0) hand.players[idx] = newName;
          for (const rec of [hand.streetPutIn, hand.totalPutIn, hand.collected, hand.uncalledReturned]) {
            if (rec[oldName] !== undefined) {
              rec[newName] = (rec[newName] ?? 0) + rec[oldName];
              delete rec[oldName];
            }
          }
          if (hand.sbPlayer === oldName) hand.sbPlayer = newName;
          if (hand.bbPlayer === oldName) hand.bbPlayer = newName;
          if (hand.vpipPlayers.has(oldName)) { hand.vpipPlayers.delete(oldName); hand.vpipPlayers.add(newName); }
          if (hand.pfrPlayers.has(oldName)) { hand.pfrPlayers.delete(oldName); hand.pfrPlayers.add(newName); }
        }
      }
      continue;
    }

    // ── Admin approves a player rejoining with a specific stack ────────
    // Example: The admin approved the player "Teddy @ ..." participation with a stack of 400.00.
    const adminApprovedM = action.match(
      /^The admin approved the player "([^"]+)" participation with a stack of ([\d.]+)\.?$/,
    );
    if (adminApprovedM) {
      const name = adminApprovedM[1];
      const stack = parseFloat(adminApprovedM[2]);
      ensurePlayer(name);
      if (lastKnownStack[name] === undefined) {
        // Player is rejoining after quitting or joining fresh — record as buy-in.
        increaseBuyIn(name, stack, "admin-approved-join", hand?.handNumber ?? -1);
        lastKnownStack[name] = stack;
      }
      continue;
    }

    // ── Player joins the table with a stack ──────────────────────────
    // Example: The player "Teddy @ ..." joined the game with a stack of 400.00.
    const joinedM = action.match(
      /^The player "([^"]+)" joined the game with a stack of ([\d.]+)\.?$/,
    );
    if (joinedM) {
      const name = joinedM[1];
      const stack = parseFloat(joinedM[2]);
      ensurePlayer(name);
      if (lastKnownStack[name] === undefined) {
        increaseBuyIn(name, stack, "joined-game", hand?.handNumber ?? -1);
        lastKnownStack[name] = stack;
      }
      continue;
    }

    // ── Admin stack adjustments (cash-out / top-up) ─────────────────
    // Example: The admin updated the player "Ben @ ..." stack from 226 to 126.
    const adminStackUpdateM = action.match(
      /^The admin updated the player "([^"]+)" stack from ([\d.]+) to ([\d.]+)\.?$/,
    );
    if (adminStackUpdateM) {
      const name = adminStackUpdateM[1];
      const fromStack = parseFloat(adminStackUpdateM[2]);
      const toStack = parseFloat(adminStackUpdateM[3]);
      const delta = toStack - fromStack;

      ensurePlayer(name);

      if (lastKnownStack[name] === undefined) {
        // Off-table stack assignment for a returning/new player.
        // Treat this as setting the player's active stack for the next hand.
        increaseBuyIn(name, toStack, "admin-stack-assignment", hand?.handNumber ?? -1);
      } else {
        if (delta < 0) {
          const cashOutAmount = -delta;
          totalCashOut[name] = r2((totalCashOut[name] ?? 0) + cashOutAmount);
        } else if (delta > 0) {
          increaseBuyIn(name, delta, "admin-stack-increase", hand?.handNumber ?? -1);
        }
      }

      // Keep stack tracker aligned with authoritative admin stack value.
      lastKnownStack[name] = toStack;
      continue;
    }

    // ── Player sits out / sits back (status only, no cash movement) ─
    const sitBackM = action.match(/^The player "([^"]+)" sit back with the stack of ([\d.]+)\.?$/);
    if (sitBackM) {
      const name = sitBackM[1];
      const stack = parseFloat(sitBackM[2]);
      ensurePlayer(name);
      // Status change only: do not change buy-in/cash-out.
      lastKnownStack[name] = stack;
      continue;
    }

    // ── Player leaves table with chips (cash out) ───────────────────
    const quitM = action.match(/^The player "([^"]+)" quits the game with a stack of ([\d.]+)\.?$/);
    if (quitM) {
      const name = quitM[1];
      const stack = parseFloat(quitM[2]);
      // Only treat as cash-out if this player is currently tracked in-session.
      if (lastKnownStack[name] !== undefined) {
        ensurePlayer(name);
        totalCashOut[name] = r2((totalCashOut[name] ?? 0) + stack);
        delete lastKnownStack[name];
      }
      continue;
    }

    const standUpM = action.match(/^The player "([^"]+)" stand up with the stack of ([\d.]+)\.?$/);
    if (standUpM) {
      const name = standUpM[1];
      const stack = parseFloat(standUpM[2]);
      ensurePlayer(name);
      if (lastKnownStack[name] === undefined && totalBuyIn[name] !== undefined) {
        // Player had previously quit (lastKnownStack was deleted) but is now
        // reappearing — record the stack as a new buy-in to avoid drift.
        increaseBuyIn(name, stack, "standup-rejoin", hand?.handNumber ?? -1);
      }
      lastKnownStack[name] = stack;
      continue;
    }

    // ── 7-2 bounty transfers (outside normal pot accounting) ────────
    // Example: "AAron ..." paid 3 for the 7-2 bounty to "Asher ..."
    const bountyPaidM = action.match(
      /^"([^"]+)" paid ([\d.]+) for the 7-2 bounty to "([^"]+)"/,
    );
    if (bountyPaidM) {
      const payer = bountyPaidM[1];
      const amount = parseFloat(bountyPaidM[2]);
      const receiver = bountyPaidM[3];

      ensurePlayer(payer);
      ensurePlayer(receiver);

      netMovements[payer] = r2((netMovements[payer] ?? 0) - amount);
      netMovements[receiver] = r2((netMovements[receiver] ?? 0) + amount);

      // Keep stack tracker aligned with non-pot chip transfers.
      if (lastKnownStack[payer] !== undefined) lastKnownStack[payer] = r2(lastKnownStack[payer] - amount);
      if (lastKnownStack[receiver] !== undefined) lastKnownStack[receiver] = r2(lastKnownStack[receiver] + amount);
      continue;
    }

    // Summary line for 7-2 bounty payout; transfers already accounted above.
    if (/^"([^"]+)" collected \d+ from the 7-2 bounty/.test(action)) {
      continue;
    }

    if (!hand) continue;

    // ── Player stacks (who's in this hand) ───────────────────────────
    const stacksM = action.match(/^Player stacks: (.+)$/);
    if (stacksM) {
      const re = /"([^"]+)" \(([\d.]+)\)/g;
      let m: RegExpExecArray | null;
      hand.players = [];
      while ((m = re.exec(stacksM[1])) !== null) {
        const name = m[1];
        const stack = parseFloat(m[2]);
        hand.players.push(name);
        ensurePlayer(name);
        stats[name].handsDealt++;

        const prevStack = lastKnownStack[name];
        if (!hasInHandBaseline[name]) {
          // Anchor accounting to the first in-hand stack snapshot. This prevents
          // pre-hand administrative events from partial logs from causing drift.
          totalBuyIn[name] = r2(stack);
          totalCashOut[name] = 0;
          netMovements[name] = 0;
          hasInHandBaseline[name] = true;
        } else if (prevStack === undefined) {
          // Player reappeared after being untracked; treat as fresh table buy-in.
          increaseBuyIn(name, stack, "rejoin-stack", hand.handNumber);
        } else if (stack > prevStack) {
          const delta = stack - prevStack;
          increaseBuyIn(name, delta, "stack-jump-rebuy", hand.handNumber);
        }
        lastKnownStack[name] = stack;
      }
      continue;
    }

    // ── Street transitions ───────────────────────────────────────────
    if (/^Flop:/.test(action)) {
      const flopM = action.match(/^Flop:\s*\[([^\]]+)\]/);
      if (flopM) {
        const cards = flopM[1].trim().split(/\s+/).slice(0, 3);
        if (cards.length === 3) {
          hand.flopCards = [cards[0], cards[1], cards[2]];
        }
      }
      hand.street = "flop";
      hand.reachedFlop = true;
      hand.cbetMadeOnFlop = false;
      resetStreet(hand);
      continue;
    }
    if (/^Turn:/.test(action)) {
      hand.street = "turn";
      resetStreet(hand);
      continue;
    }
    if (/^River:/.test(action)) {
      hand.street = "river";
      resetStreet(hand);
      continue;
    }

    // ── Blind posts (NOT voluntary for VPIP) ─────────────────────────
    const sbM = action.match(/^"([^"]+)" posts a small blind of ([\d.]+)/);
    if (sbM) {
      hand.sbPlayer = sbM[1];
      const amount = parseFloat(sbM[2]);
      putIn(hand, sbM[1], amount);
      logAction(hand.handNumber, sbM[1], "small-blind", amount);
      hand.streetTarget = Math.max(hand.streetTarget, hand.streetPutIn[sbM[1]] ?? 0);
      continue;
    }

    const missingSbM = action.match(/^"([^"]+)" posts a missing small blind of ([\d.]+)/);
    if (missingSbM) {
      const name = missingSbM[1];
      const amount = parseFloat(missingSbM[2]);
      putInDead(hand, name, amount);
      logAction(hand.handNumber, name, "missing-small-blind", amount);
      continue;
    }

    const bbM = action.match(/^"([^"]+)" posts a big blind of ([\d.]+)/);
    if (bbM) {
      hand.bbPlayer = bbM[1];
      const amount = parseFloat(bbM[2]);
      putIn(hand, bbM[1], amount);
      logAction(hand.handNumber, bbM[1], "big-blind", amount);
      hand.streetTarget = Math.max(hand.streetTarget, hand.streetPutIn[bbM[1]] ?? 0);
      continue;
    }

    const missingBbM = action.match(/^"([^"]+)" posts a missing big blind of ([\d.]+)/);
    if (missingBbM) {
      const name = missingBbM[1];
      const amount = parseFloat(missingBbM[2]);
      putIn(hand, name, amount);
      logAction(hand.handNumber, name, "missing-big-blind", amount);
      hand.streetTarget = Math.max(hand.streetTarget, hand.streetPutIn[name] ?? 0);
      continue;
    }

    const missedBbM = action.match(/^"([^"]+)" posts a missed big blind of ([\d.]+)/);
    if (missedBbM) {
      const name = missedBbM[1];
      const amount = parseFloat(missedBbM[2]);
      putIn(hand, name, amount);
      logAction(hand.handNumber, name, "missed-big-blind", amount);
      hand.streetTarget = Math.max(hand.streetTarget, hand.streetPutIn[name] ?? 0);
      continue;
    }

    // ── Fold ─────────────────────────────────────────────────────────
    const foldM = action.match(/^"([^"]+)" folds/);
    if (foldM) {
      if (hand.street === "preflop") {
        hand.preflopFolders.add(foldM[1]);
      }
      continue;
    }

    // Straddle counts as voluntary.
    // "posts a straddle of X" uses raise-to semantics: X is the call price (total on street),
    // so if the player already has chips in (e.g. SB), only charge the delta.
    const straddleM = action.match(/^"([^"]+)" posts a straddle of ([\d.]+)/);
    if (straddleM) {
      const straddlePlayer = straddleM[1];
      const straddleTo = parseFloat(straddleM[2]);
      const alreadyIn = hand.streetPutIn[straddlePlayer] ?? 0;
      const additional = Math.max(0, straddleTo - alreadyIn);
      hand.streetPutIn[straddlePlayer] = straddleTo;
      hand.totalPutIn[straddlePlayer] = r2((hand.totalPutIn[straddlePlayer] ?? 0) + additional);
      hand.streetTarget = Math.max(hand.streetTarget, straddleTo);
      if (hand.street === "preflop") hand.vpipPlayers.add(straddlePlayer);
      continue;
    }

    // Bomb pot: everyone forced to post — skip VPIP for whole hand by not adding them
    // (They get added to totalPutIn via a "posts X for bomb pot" style line)
    const bombM = action.match(/^"([^"]+)" posts ([\d.]+) for the bomb pot/);
    if (bombM) {
      putIn(hand, bombM[1], parseFloat(bombM[2]));
      hand.streetTarget = Math.max(hand.streetTarget, hand.streetPutIn[bombM[1]] ?? 0);
      // NOT voluntary — do not add to vpipPlayers
      continue;
    }

    // Bomb pot bet variant: "posts a bet of X (bomb pot bet)"
    const bombBetM = action.match(/^"([^"]+)" posts a bet of ([\d.]+) \(bomb pot bet\)/);
    if (bombBetM) {
      const name = bombBetM[1];
      const amount = parseFloat(bombBetM[2]);
      putIn(hand, name, amount);
      logAction(hand.handNumber, name, "bomb-pot-bet", amount);
      hand.streetTarget = Math.max(hand.streetTarget, hand.streetPutIn[name] ?? 0);
      // NOT voluntary — do not add to vpipPlayers
      continue;
    }

    // Bomb pot call variant: "calls X (bomb pot bet)"
    const bombCallM = action.match(/^"([^"]+)" calls ([\d.]+) \(bomb pot bet\)/);
    if (bombCallM) {
      const name = bombCallM[1];
      const amount = parseFloat(bombCallM[2]);
      putIn(hand, name, amount);
      logAction(hand.handNumber, name, "bomb-pot-call", amount);
      // NOT voluntary — do not add to vpipPlayers
      continue;
    }

    // ── Call ─────────────────────────────────────────────────────────
    // "calls X" may represent either:
    // 1) call-to total X on this street, or
    // 2) add X chips now.
    // We resolve by checking which interpretation matches current street target.
    // "calls X" or "calls X and is all in"
    const callM = action.match(/^"([^"]+)" calls ([\d.]+)/);
    if (callM) {
      const name = callM[1];
      const callValue = parseFloat(callM[2]);
      const alreadyIn = hand.streetPutIn[name] ?? 0;
      const callToTotal = Math.max(alreadyIn, callValue);
      const finalIfToTotal = callToTotal;
      const finalIfAdd = alreadyIn + callValue;

      let chosenFinal = finalIfToTotal;
      let callMode: "to-total" | "add-amount" = "to-total";
      const target = hand.streetTarget;

      if (target > 0) {
        const toTotalMatches = finalIfToTotal === target;
        const addMatches = finalIfAdd === target;

        if (addMatches && !toTotalMatches) {
          chosenFinal = finalIfAdd;
          callMode = "add-amount";
        } else if (!addMatches && toTotalMatches) {
          chosenFinal = finalIfToTotal;
          callMode = "to-total";
        } else if (!addMatches && !toTotalMatches) {
          // Fallback: prefer the interpretation that does not overshoot target.
          if (finalIfAdd > target && finalIfToTotal <= target) {
            chosenFinal = finalIfToTotal;
            callMode = "to-total";
          } else if (finalIfToTotal > target && finalIfAdd <= target) {
            chosenFinal = finalIfAdd;
            callMode = "add-amount";
          }
        }
      }

      const additional = Math.max(0, chosenFinal - alreadyIn);
      hand.streetPutIn[name] = chosenFinal;
      hand.totalPutIn[name] = (hand.totalPutIn[name] ?? 0) + additional;
      logAction(hand.handNumber, name, `call-to-${callValue}`, additional);
      if (hand.street === "preflop") hand.vpipPlayers.add(name);
      ensurePlayer(name);
      stats[name].callActions++;
      continue;
    }

    // ── Bet ──────────────────────────────────────────────────────────
    // "bets X" or "bets X and is all in" or "bets and is all in with X"
    const betM =
      action.match(/^"([^"]+)" bets ([\d.]+)/) ??
      action.match(/^"([^"]+)" bets and is all in with ([\d.]+)/);
    if (betM) {
      const name = betM[1];
      const amount = parseFloat(betM[2]);
      const potBeforeAction = currentPotSize(hand);
      putIn(hand, name, amount);
      logAction(hand.handNumber, name, "bet", amount);
      hand.streetTarget = Math.max(hand.streetTarget, hand.streetPutIn[name] ?? 0);
      if (hand.street === "preflop") {
        hand.vpipPlayers.add(name);
        hand.pfrPlayers.add(name);
        hand.lastPreflopRaiser = name;
      }
      if (hand.street === "flop" && hand.lastPreflopRaiser === name) {
        if (!hand.cbetMadeOnFlop) {
          hand.cbetMadeOnFlop = true;
          hand.potBeforeCBet = potBeforeAction;
          hand.cbetAmount = amount;
        }
      }
      ensurePlayer(name);
      stats[name].aggActions++;
      continue;
    }

    // ── Raise ────────────────────────────────────────────────────────
    // "raises to X" (total on street) or "raises and is all in with X"
    const raiseToM =
      action.match(/^"([^"]+)" raises to ([\d.]+)(?: and go all in)?/) ??
      action.match(/^"([^"]+)" raises and is all in with ([\d.]+)/) ??
      action.match(/^"([^"]+)" raises and go all in with ([\d.]+)/);
    if (raiseToM) {
      const name = raiseToM[1];
      const raiseTo = parseFloat(raiseToM[2]);
      const prevTarget = hand.streetTarget;
      const alreadyIn = hand.streetPutIn[name] ?? 0;
      const additional = Math.max(0, raiseTo - alreadyIn);
      const potBeforeAction = currentPotSize(hand);
      const raiseOverPrevBet = Math.max(0, raiseTo - prevTarget);
      hand.streetPutIn[name] = raiseTo;
      hand.streetTarget = Math.max(hand.streetTarget, raiseTo);
      hand.totalPutIn[name] = (hand.totalPutIn[name] ?? 0) + additional;
      logAction(hand.handNumber, name, `raise-to-${raiseTo}`, additional);
      if (hand.street === "preflop") {
        const preflopRaiseNumber = hand.preflopRaises.length + 1;
        const preflopBetLevel = preflopRaiseNumber + 1; // First raise is a 2-bet (open raise)
        hand.vpipPlayers.add(name);
        hand.pfrPlayers.add(name);
        hand.lastPreflopRaiser = name;
        hand.preflopRaises.push({
          player: name,
          raiseTo,
          raiseSize: additional,
          raiseOverPrevBet,
          preflopRaiseNumber,
          preflopBetLevel,
        });
      }
      if (hand.street === "flop" && hand.lastPreflopRaiser === name) {
        if (!hand.cbetMadeOnFlop) {
          hand.cbetMadeOnFlop = true;
          hand.potBeforeCBet = potBeforeAction;
          hand.cbetAmount = additional;
        }
      }
      ensurePlayer(name);
      stats[name].aggActions++;
      continue;
    }

    // ── Showdown hole cards ─────────────────────────────────────────
    const showsM = action.match(/^"([^"]+)" shows a ([^,]+),\s*([^.]+)\.?$/);
    if (showsM) {
      const name = showsM[1];
      const c1 = showsM[2].trim();
      const c2 = showsM[3].trim();
      hand.shownCards[name] = [c1, c2];
      continue;
    }

    // ── Collected from pot ───────────────────────────────────────────
    const collectedM = action.match(/^"([^"]+)" collected ([\d.]+) from pot/);
    if (collectedM) {
      const name = collectedM[1];
      const amount = parseFloat(collectedM[2]);
      hand.collected[name] = (hand.collected[name] ?? 0) + amount;
      logAction(hand.handNumber, name, "collected", amount);
      continue;
    }

    // ── Uncalled bet returned ────────────────────────────────────────
    const uncalledM = action.match(/^Uncalled bet of ([\d.]+) returned to "([^"]+)"/);
    if (uncalledM) {
      const name = uncalledM[2];
      const amount = parseFloat(uncalledM[1]);
      hand.uncalledReturned[name] =
        (hand.uncalledReturned[name] ?? 0) + amount;
      logAction(hand.handNumber, name, "uncalled-returned", amount);
      continue;
    }
  }

  // If log was cut off before the last "-- ending hand --", the hand never
  // completed — return all chips to their owners before finalizing.
  if (hand) {
    for (const player of hand.players) {
      const putIn = hand.totalPutIn[player] ?? 0;
      hand.uncalledReturned[player] = (hand.uncalledReturned[player] ?? 0) + putIn;
    }
    finalizeHand(hand);
  }

  // Apply net movements, buy-in, final stack, and cash out to stats
  for (const name of Object.keys(stats)) {
    stats[name].netChips = netMovements[name] ?? 0;
    stats[name].buyIn = totalBuyIn[name] ?? 0;
    stats[name].finalStack = lastKnownStack[name] ?? 0;
    stats[name].cashOut = totalCashOut[name] ?? 0;
  }

  return {
    players: Object.values(stats).sort((a, b) => b.netChips - a.netChips),
    preflopRaisesByPlayer,
    cbetRecordsByPlayer,
    sawFlopHandsByPlayer,
    noFlopHandsByPlayer,
  };
}
