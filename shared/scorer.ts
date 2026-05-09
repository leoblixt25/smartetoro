import type { UserPrefs } from './types';
import type { Mirror } from './etoro-types';

export interface TrackerScore {
  username: string;
  mirrorId: number;
  allocatedUsd: number;
  currentValue: number;
  pnlPercent: number;
  consistencyScore: number;
  riskScore: number;
  totalScore: number;
}

interface ScoringWeights {
  profitWeight: number;
  consistencyWeight: number;
  riskPenalty: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  profitWeight: 0.5,
  consistencyWeight: 0.3,
  riskPenalty: 0.2,
};

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

export function evaluateTrackers(
  mirrors: Mirror[],
  prefs: UserPrefs,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): TrackerScore[] {
  if (!mirrors || mirrors.length === 0) return [];

  const scores: TrackerScore[] = mirrors.map((m) => {
    const positions = m.positions ?? [];
    const totalAmount = positions.reduce((s, p) => s + (p.amount || 0), 0);
    const totalPl = positions.reduce((s, p) => s + (p.pl || 0), 0);
    const currentVal = totalAmount + totalPl;
    const pnlPercent = totalAmount > 0 ? (totalPl / totalAmount) * 100 : 0;

    const returns = positions.map((p) => p.plPercent || 0);
    const mean = returns.reduce((s, v) => s + v, 0) / returns.length || 0;
    const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length || 0;
    const stdDev = Math.sqrt(variance);
    const consistencyScore = Math.max(0, 100 - stdDev);

    const riskScore = m.stopLossPercentage > 0
      ? Math.min(10, m.stopLossPercentage / 2)
      : 5;

    return {
      username: `mirror-${m.mirrorID}`,
      mirrorId: m.mirrorID,
      allocatedUsd: totalAmount,
      currentValue: currentVal,
      pnlPercent,
      consistencyScore,
      riskScore,
      totalScore: 0,
    };
  });

  const pnlValues = scores.map((s) => s.pnlPercent);
  const pnlMin = Math.min(...pnlValues);
  const pnlMax = Math.max(...pnlValues);

  const consistencyValues = scores.map((s) => s.consistencyScore);
  const consMin = Math.min(...consistencyValues);
  const consMax = Math.max(...consistencyValues);

  const riskValues = scores.map((s) => s.riskScore);
  const riskMin = Math.min(...riskValues);
  const riskMax = Math.max(...riskValues);

  for (const s of scores) {
    const normProfit = normalize(s.pnlPercent, pnlMin, pnlMax);
    const normConsistency = normalize(s.consistencyScore, consMin, consMax);
    const normRisk = 1 - normalize(s.riskScore, riskMin, riskMax);

    s.totalScore =
      normProfit * weights.profitWeight +
      normConsistency * weights.consistencyWeight +
      normRisk * weights.riskPenalty;
  }

  return scores.sort((a, b) => b.totalScore - a.totalScore);
}

export interface Allocation {
  username: string;
  usdAmount: number;
  pnlPercent: number;
  score: number;
}

export function allocateCapital(
  scored: TrackerScore[],
  count: number,
  totalCapital: number,
  minAllocation = 50,
  maxAllocationPct = 0.4
): Allocation[] {
  if (!scored) return [];
  const selected = scored.slice(0, Math.min(count, scored.length));
  if (selected.length === 0 || totalCapital <= 0) return [];

  const totalScore = selected.reduce((s, t) => s + t.totalScore, 0);
  if (totalScore === 0) {
    const equal = Math.floor((totalCapital / selected.length) * 100) / 100;
    return selected.map((s) => ({ username: s.username, usdAmount: equal, pnlPercent: s.pnlPercent, score: s.totalScore }));
  }

  const maxAllocation = totalCapital * maxAllocationPct;
  let allocated = selected.map((s) => ({
    username: s.username,
    usdAmount: Math.max(minAllocation, Math.min((s.totalScore / totalScore) * totalCapital, maxAllocation)),
    pnlPercent: s.pnlPercent,
    score: s.totalScore,
  }));

  const used = allocated.reduce((s, a) => s + a.usdAmount, 0);
  const leftover = totalCapital - used;
  if (leftover > 0) {
    const active = allocated.filter((a) => a.usdAmount < maxAllocation);
    const activeScore = active.reduce((s, a) => s + a.score, 0);
    if (activeScore > 0) {
      for (const a of active) {
        const extra = (a.score / activeScore) * leftover;
        a.usdAmount = Math.min(a.usdAmount + extra, maxAllocation);
      }
    }
  }

  const finalUsed = allocated.reduce((s, a) => s + a.usdAmount, 0);
  if (finalUsed > totalCapital) {
    const ratio = totalCapital / finalUsed;
    for (const a of allocated) a.usdAmount = Math.floor(a.usdAmount * ratio * 100) / 100;
  }

  return allocated.sort((a, b) => b.score - a.score);
}
