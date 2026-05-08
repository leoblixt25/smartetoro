import { EtoroClient } from './etoro-client';
import { evaluateTrackers, allocateCapital, type Allocation } from './scorer';
import type { UserPrefs } from './types';
import type { Mirror } from './etoro-types';
import type { SentimentResult } from './sentiment';
import { capitalMultiplier } from './sentiment';

export interface RebalanceResult {
  allocations: Allocation[];
  actions: RebalanceAction[];
  riskTriggers: RiskTrigger[];
  totalInvested: number;
  remainingCash: number;
}

export interface RebalanceAction {
  type: 'open' | 'close' | 'hold';
  username: string;
  amount: number;
}

export interface RiskTrigger {
  type: 'tp' | 'sl';
  username: string;
  mirrorId: number;
  pnlPercent: number;
  threshold: number;
}

export async function executeRebalance(
  client: EtoroClient,
  prefs: UserPrefs,
  sentiment?: SentimentResult
): Promise<RebalanceResult> {
  const portfolio = await client.getPortfolio(prefs.environment);
  const mirrors = portfolio.clientPortfolio.mirrors;
  const availableCash = portfolio.clientPortfolio.credit;

  const totalInvested = mirrors.reduce(
    (s, m) => s + m.positions.reduce((a, p) => a + p.amount, 0),
    0
  );
  const rawCapital = totalInvested + availableCash;
  const multiplier = sentiment ? capitalMultiplier(sentiment) : 1.0;
  const totalCapital = Math.floor(rawCapital * multiplier * 100) / 100;

  const riskTriggers = checkRiskTriggers(mirrors, prefs);
  const scored = evaluateTrackers(mirrors, prefs);
  const allocations = allocateCapital(scored, prefs.traderCount, totalCapital);

  const actions = computeActions(mirrors, allocations, prefs, riskTriggers);
  return { allocations, actions, riskTriggers, totalInvested, remainingCash: totalCapital - totalInvested };
}

export function checkRiskTriggers(mirrors: Mirror[], prefs: UserPrefs): RiskTrigger[] {
  const triggers: RiskTrigger[] = [];

  for (const mirror of mirrors) {
    const mirrorPnl = calcMirrorPnl(mirror);
    const name = `mirror-${mirror.mirrorID}`;

    if (prefs.tpPercent > 0 && mirrorPnl >= prefs.tpPercent) {
      triggers.push({ type: 'tp', username: name, mirrorId: mirror.mirrorID, pnlPercent: mirrorPnl, threshold: prefs.tpPercent });
    }

    if (prefs.slPercent > 0 && mirrorPnl <= -prefs.slPercent) {
      triggers.push({ type: 'sl', username: name, mirrorId: mirror.mirrorID, pnlPercent: mirrorPnl, threshold: prefs.slPercent });
    }
  }

  return triggers;
}

function calcMirrorPnl(mirror: Mirror): number {
  const totalPl = mirror.positions.reduce((s, p) => s + p.pl, 0);
  const totalInvested = mirror.positions.reduce((s, p) => s + p.amount, 0) || 1;
  return (totalPl / totalInvested) * 100;
}

export function computeActions(
  mirrors: Mirror[],
  allocations: Allocation[],
  prefs: UserPrefs,
  riskTriggers: RiskTrigger[] = []
): RebalanceAction[] {
  const actions: RebalanceAction[] = [];
  const targetNames = new Set(allocations.map((a) => a.username));
  const triggeredNames = new Set(riskTriggers.map((t) => t.username));

  for (const mirror of mirrors) {
    const name = `mirror-${mirror.mirrorID}`;
    if (triggeredNames.has(name)) {
      actions.push({ type: 'close', username: name, amount: 0 });
    } else if (!targetNames.has(name)) {
      actions.push({ type: 'close', username: name, amount: 0 });
    } else {
      actions.push({ type: 'hold', username: name, amount: 0 });
    }
  }

  for (const alloc of allocations) {
    const existing = mirrors.find((m) => `mirror-${m.mirrorID}` === alloc.username);
    if (!existing) {
      actions.push({ type: 'open', username: alloc.username, amount: alloc.usdAmount });
    }
  }

  return actions;
}
