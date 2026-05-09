import { EtoroClient } from './etoro-client';
import { evaluateTrackers, allocateCapital, type Allocation } from './scorer';
import type { UserPrefs } from './types';
import type { Mirror, PortfolioResponse, OrderForOpen, Order } from './etoro-types';
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

/* ── Official eToro formulas ── */

/** Total Invested = Σ(positions[i].amount)
 *                 + Σ(mirrors[i].positions[j].amount)
 *                 + Σ(mirrors[i].availableAmount - mirrors[i].closedPositionsNetProfit)
 *                 + Σ(ordersForOpen[i].amount where mirrorID = 0)
 *                 + Σ(orders[i].amount)
 *                 + Σ(ordersForOpen[i].totalExternalCosts where mirrorID = 0)
 */
export function calcTotalInvested(portfolio: PortfolioResponse): number {
  const cp = portfolio.clientPortfolio;

  const positionsAmount = cp.positions.reduce((s, p) => s + (p.amount || 0), 0);

  let mirrorsPosAmount = 0;
  let mirrorsAdjustedAmount = 0;
  for (const m of cp.mirrors) {
    mirrorsPosAmount += (m.positions ?? []).reduce((s, p) => s + (p.amount || 0), 0);
    mirrorsAdjustedAmount += (m.availableAmount || 0) - (m.closedPositionsNetProfit || 0);
  }

  const manualOrders = (cp.ordersForOpen ?? [])
    .filter((o) => o.mirrorId === 0 || o.mirrorId === undefined);
  const ordersForOpenAmount = manualOrders.reduce((s, o) => s + (o.amount || 0), 0);
  const externalCosts = manualOrders.reduce((s, o) => s + (o.totalExternalCosts || 0), 0);

  const ordersAmount = (cp.orders ?? []).reduce((s, o) => s + (o.amount || 0), 0);

  return positionsAmount + mirrorsPosAmount + mirrorsAdjustedAmount
       + ordersForOpenAmount + ordersAmount + externalCosts;
}

/** Available Cash = credit - (Σ(ordersForOpen[i].amount where mirrorID = 0) + Σ(orders[i].amount)) */
export function calcAvailableCash(portfolio: PortfolioResponse): number {
  const cp = portfolio.clientPortfolio;
  const manualOrders = (cp.ordersForOpen ?? [])
    .filter((o) => o.mirrorId === 0 || o.mirrorId === undefined);
  const ordersForOpenAmount = manualOrders.reduce((s, o) => s + (o.amount || 0), 0);
  const ordersAmount = (cp.orders ?? []).reduce((s, o) => s + (o.amount || 0), 0);
  return cp.credit - (ordersForOpenAmount + ordersAmount);
}

/** Unrealized/Realized PnL = portfolio.unrealizedPnL + Σ(mirrors[i].closedPositionsNetProfit) */
export function calcTotalPnL(portfolio: PortfolioResponse): number {
  const cp = portfolio.clientPortfolio;
  const openPnL = cp.unrealizedPnL || 0;
  const closedPnL = cp.mirrors.reduce((s, m) => s + (m.closedPositionsNetProfit || 0), 0);
  return openPnL + closedPnL;
}

/** Equity = Available Cash + Total Invested + Total PnL */
export function calcEquity(portfolio: PortfolioResponse): number {
  return calcAvailableCash(portfolio) + calcTotalInvested(portfolio) + calcTotalPnL(portfolio);
}

/* ── Mirror-level helpers ── */

export function calcMirrorCurrentValue(mirror: Mirror): number {
  const positions = mirror?.positions ?? [];
  const totalAmount = positions.reduce((s, p) => s + (p.amount || 0), 0);
  const totalPnL = positions.reduce((s, p) => s + (p.pnL || 0), 0);
  const cashPortion = mirror?.availableAmount || 0;
  return cashPortion + totalAmount + totalPnL;
}

export function calcMirrorPnL(mirror: Mirror): number {
  const invested = mirror?.initialInvestment || 0;
  if (invested <= 0) return 0;
  const totalEquity = calcMirrorCurrentValue(mirror);
  return ((totalEquity - invested) / invested) * 100;
}

export function calcMirrorInvested(mirror: Mirror): number {
  return mirror?.initialInvestment || 0;
}

/* ── Orchestration ── */

export async function executeRebalance(
  client: EtoroClient,
  prefs: UserPrefs,
  sentiment?: SentimentResult,
  existingPortfolio?: PortfolioResponse
): Promise<RebalanceResult> {
  const portfolio = existingPortfolio ?? await client.getPortfolio(prefs.environment);
  const mirrors = portfolio.clientPortfolio.mirrors;

  const totalInvested = calcTotalInvested(portfolio);
  const availableCash = calcAvailableCash(portfolio);
  const totalPnL = calcTotalPnL(portfolio);
  const currentPortfolioValue = calcEquity(portfolio);
  const rawCapital = currentPortfolioValue;
  const multiplier = sentiment ? capitalMultiplier(sentiment) : 1.0;
  const totalCapital = Math.floor(rawCapital * multiplier * 100) / 100;

  const riskTriggers = checkRiskTriggers(mirrors, prefs);
  const scored = evaluateTrackers(mirrors, prefs);
  const allocations = allocateCapital(scored, prefs.traderCount, totalCapital);

  const actions = computeActions(mirrors, allocations, prefs, riskTriggers);
  const closeQueue = buildCloseQueue(mirrors, allocations, riskTriggers);
  const totalPnlPercent = totalInvested > 0 ? ((currentPortfolioValue - totalInvested) / totalInvested) * 100 : 0;
  const remainingCash = availableCash;
  return { allocations, actions, riskTriggers, totalInvested, currentPortfolioValue, remainingCash, totalPnlPercent, portfolio };
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
    const name = `mirror-${mirror.mirrorId}`;
    if (triggeredNames.has(name)) {
      const trigger = riskTriggers.find(t => t.username === name);
      queue.push({ mirrorId: mirror.mirrorId, reason: trigger!.type, pnlPercent: trigger!.pnlPercent });
    } else if (!targetNames.has(name)) {
      queue.push({ mirrorId: mirror.mirrorId, reason: 'removed', pnlPercent: calcMirrorPnL(mirror) });
    }
  }
  return queue;
}

export function checkRiskTriggers(mirrors: Mirror[], prefs: UserPrefs): RiskTrigger[] {
  const triggers: RiskTrigger[] = [];
  if (!mirrors) return triggers;

  for (const mirror of mirrors) {
    const mirrorPnl = calcMirrorPnL(mirror);
    const name = `mirror-${mirror.mirrorId}`;

    if (prefs.tpPercent > 0 && mirrorPnl >= prefs.tpPercent) {
      triggers.push({ type: 'tp', username: name, mirrorId: mirror.mirrorId, pnlPercent: mirrorPnl, threshold: prefs.tpPercent });
    }

    if (prefs.slPercent > 0 && mirrorPnl <= -prefs.slPercent) {
      triggers.push({ type: 'sl', username: name, mirrorId: mirror.mirrorId, pnlPercent: mirrorPnl, threshold: prefs.slPercent });
    }
  }

  return triggers;
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
    const name = `mirror-${mirror.mirrorId}`;
    if (triggeredNames.has(name)) {
      actions.push({ type: 'close', username: name, amount: 0 });
    } else if (!targetNames.has(name)) {
      actions.push({ type: 'close', username: name, amount: 0 });
    } else {
      actions.push({ type: 'hold', username: name, amount: 0 });
    }
  }

  for (const alloc of allocations) {
    const existing = mirrors.find((m) => `mirror-${m.mirrorId}` === alloc.username);
    if (!existing) {
      actions.push({ type: 'open', username: alloc.username, amount: alloc.usdAmount });
    }
  }

  return actions;
}
