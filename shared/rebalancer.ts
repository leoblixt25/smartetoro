import { EtoroClient } from './etoro-client';
import { evaluateTrackers, allocateCapital, type Allocation } from './scorer';
import type { UserPrefs } from './types';
import type { Mirror, PortfolioResponse } from './etoro-types';
import type { SentimentResult } from './sentiment';
import { capitalMultiplier } from './sentiment';

export interface RebalanceResult {
  allocations: Allocation[];
  actions: RebalanceAction[];
  riskTriggers: RiskTrigger[];
  totalInvested: number;
  currentPortfolioValue: number;
  remainingCash: number;
  totalPnlPercent: number;
  portfolio: PortfolioResponse;
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

export interface CloseInstruction {
  mirrorId: number;
  reason: 'tp' | 'sl' | 'removed';
  pnlPercent: number;
}

export async function executeRebalance(
  client: EtoroClient,
  prefs: UserPrefs,
  sentiment?: SentimentResult,
  existingPortfolio?: PortfolioResponse
): Promise<RebalanceResult> {
  const portfolio = existingPortfolio ?? await client.getPortfolio(prefs.environment);
  const mirrors = portfolio.clientPortfolio.mirrors;
  const availableCash = portfolio.clientPortfolio.credit;

  const totalInvested = mirrors.reduce((s, m) => s + calcMirrorInvested(m), 0);
  const currentPortfolioValue = mirrors.reduce((s, m) => s + calcMirrorCurrentValue(m), 0);
  const rawCapital = currentPortfolioValue + availableCash;
  const multiplier = sentiment ? capitalMultiplier(sentiment) : 1.0;
  const totalCapital = Math.floor(rawCapital * multiplier * 100) / 100;

  const riskTriggers = checkRiskTriggers(mirrors, prefs);
  const scored = evaluateTrackers(mirrors, prefs);
  const allocations = allocateCapital(scored, prefs.traderCount, totalCapital);

  const actions = computeActions(mirrors, allocations, prefs, riskTriggers);
  const closeQueue = buildCloseQueue(mirrors, allocations, riskTriggers);
  const totalPnlPercent = totalInvested > 0 ? ((currentPortfolioValue - totalInvested) / totalInvested) * 100 : 0;
  return { allocations, actions, riskTriggers, totalInvested, currentPortfolioValue, remainingCash: availableCash, totalPnlPercent, portfolio };
}

export function buildCloseQueue(
  mirrors: Mirror[],
  allocations: Allocation[],
  riskTriggers: RiskTrigger[] = []
): CloseInstruction[] {
  const queue: CloseInstruction[] = [];
  const targetNames = new Set(allocations?.map((a) => a.username) ?? []);
  const triggeredNames = new Set(riskTriggers?.map((t) => t.username) ?? []);

  for (const mirror of mirrors) {
    const name = `mirror-${mirror.mirrorID}`;
    if (triggeredNames.has(name)) {
      const trigger = riskTriggers.find(t => t.username === name);
      queue.push({ mirrorId: mirror.mirrorID, reason: trigger!.type, pnlPercent: trigger!.pnlPercent });
    } else if (!targetNames.has(name)) {
      queue.push({ mirrorId: mirror.mirrorID, reason: 'removed', pnlPercent: calcMirrorPnl(mirror) });
    }
  }
  return queue;
}

export function checkRiskTriggers(mirrors: Mirror[], prefs: UserPrefs): RiskTrigger[] {
  const triggers: RiskTrigger[] = [];
  if (!mirrors) return triggers;

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

export function calcMirrorPnl(mirror: Mirror): number {
  const positions = mirror?.positions ?? [];
  const totalAmount = positions.reduce((s, p) => s + (p.amount || 0), 0);
  const totalPl = positions.reduce((s, p) => s + (p.pl || 0), 0);
  if (totalAmount <= 0) return 0;
  return (totalPl / totalAmount) * 100;
}

export function calcMirrorCurrentValue(mirror: Mirror): number {
  const positions = mirror?.positions ?? [];
  const totalAmount = positions.reduce((s, p) => s + (p.amount || 0), 0);
  const totalPl = positions.reduce((s, p) => s + (p.pl || 0), 0);
  return totalAmount + totalPl;
}

export function calcMirrorInvested(mirror: Mirror): number {
  return mirror?.initialInvestment || 0;
}

export function computeActions(
  mirrors: Mirror[],
  allocations: Allocation[],
  prefs: UserPrefs,
  riskTriggers: RiskTrigger[] = []
): RebalanceAction[] {
  const actions: RebalanceAction[] = [];
  const targetNames = new Set(allocations?.map((a) => a.username) ?? []);
  const triggeredNames = new Set(riskTriggers?.map((t) => t.username) ?? []);
  if (!mirrors) return actions;

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
