import { describe, it, expect } from 'vitest';
import { evaluateTrackers, allocateCapital } from '../shared/scorer';
import type { Mirror } from '../shared/etoro-types';

const mockMirrors: Mirror[] = [
  {
    mirrorID: 1,
    cid: 100,
    parentCID: 200,
    stopLossPercentage: 10,
    stopLossAmount: 500,
    initialInvestment: 1000,
    availableAmount: 80,
    isPaused: false,
    positions: [
      { instrumentId: 1, symbol: 'AAPL', amount: 500, units: 10, pl: 50, plPercent: 10 },
      { instrumentId: 2, symbol: 'GOOGL', amount: 500, units: 5, pl: 30, plPercent: 6 },
    ],
  },
  {
    mirrorID: 2,
    cid: 101,
    parentCID: 201,
    stopLossPercentage: 5,
    stopLossAmount: 800,
    initialInvestment: 2000,
    availableAmount: 300,
    isPaused: false,
    positions: [
      { instrumentId: 3, symbol: 'TSLA', amount: 1000, units: 20, pl: -100, plPercent: -10 },
      { instrumentId: 4, symbol: 'MSFT', amount: 1000, units: 15, pl: 200, plPercent: 20 },
    ],
  },
];

const defaultPrefs = {
  traderCount: 2,
  tpPercent: 20,
  slPercent: 15,
  rebalanceHours: 4,
  environment: 'demo' as const,
};

describe('evaluateTrackers', () => {
  it('returns scores sorted by total descending', () => {
    const result = evaluateTrackers(mockMirrors, defaultPrefs);
    expect(result).toHaveLength(2);
    expect(result[0].totalScore).toBeGreaterThanOrEqual(result[1].totalScore);
  });

  it('computes pnlPercent correctly', () => {
    const result = evaluateTrackers(mockMirrors, defaultPrefs);
    const mirror0 = result.find((m) => m.mirrorId === 1);
    expect(mirror0).toBeDefined();
    expect(mirror0!.pnlPercent).toBeCloseTo(16, 0);
  });

  it('returns empty array for no mirrors', () => {
    expect(evaluateTrackers([], defaultPrefs)).toEqual([]);
  });

  it('assigns risk scores based on stopLossPercentage', () => {
    const result = evaluateTrackers(mockMirrors, defaultPrefs);
    const lowRisk = result.find((m) => m.mirrorId === 2);
    const highRisk = result.find((m) => m.mirrorId === 1);
    expect(lowRisk!.riskScore).toBeLessThan(highRisk!.riskScore);
  });
});

describe('allocateCapital', () => {
  const scored = evaluateTrackers(mockMirrors, defaultPrefs);

  it('selects the top N traders by score', () => {
    const result = allocateCapital(scored, 1, 1000);
    expect(result).toHaveLength(1);
  });

  it('distributes capital across selected traders', () => {
    const result = allocateCapital(scored, 2, 2000);
    expect(result).toHaveLength(2);
    expect(result.reduce((s, a) => s + a.usdAmount, 0)).toBeLessThanOrEqual(2000);
  });

  it('handles selecting more traders than available', () => {
    const result = allocateCapital(scored, 10, 1000);
    expect(result).toHaveLength(2);
  });

  it('respects max allocation percentage', () => {
    const result = allocateCapital(scored, 2, 10000, 50, 0.3);
    for (const a of result) {
      expect(a.usdAmount).toBeLessThanOrEqual(3000);
    }
  });

  it('returns empty for zero capital', () => {
    expect(allocateCapital(scored, 2, 0)).toEqual([]);
  });
});
