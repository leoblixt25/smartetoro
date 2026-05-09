import { describe, it, expect } from 'vitest';
import { computeActions, checkRiskTriggers } from '../shared/rebalancer';
import type { Mirror } from '../shared/etoro-types';
import type { Allocation } from '../shared/scorer';

const mockMirrors: Mirror[] = [
  {
    mirrorID: 1, cid: 100, parentCID: 200,
    stopLossPercentage: 10, stopLossAmount: 500,
    initialInvestment: 1000, availableAmount: 1150, isPaused: false,
    positions: [{ instrumentId: 1, symbol: 'AAPL', amount: 500, units: 10, pl: 50, plPercent: 10 }],
  },
  {
    mirrorID: 2, cid: 101, parentCID: 201,
    stopLossPercentage: 5, stopLossAmount: 800,
    initialInvestment: 2000, availableAmount: 1300, isPaused: false,
    positions: [
      { instrumentId: 3, symbol: 'TSLA', amount: 1000, units: 20, pl: -300, plPercent: -30 },
      { instrumentId: 4, symbol: 'MSFT', amount: 500, units: 8, pl: -100, plPercent: -20 },
    ],
  },
  {
    mirrorID: 3, cid: 102, parentCID: 202,
    stopLossPercentage: 8, stopLossAmount: 300,
    initialInvestment: 500, availableAmount: 650, isPaused: false,
    positions: [{ instrumentId: 5, symbol: 'AAPL', amount: 300, units: 5, pl: 90, plPercent: 30 }],
  },
];

const prefs = { traderCount: 2, tpPercent: 20, slPercent: 15, rebalanceHours: 4, environment: 'demo' as const };

describe('checkRiskTriggers', () => {
  it('detects take-profit when PnL exceeds TP threshold', () => {
    const triggers = checkRiskTriggers(mockMirrors, prefs);
    const tp = triggers.find((t) => t.type === 'tp');
    expect(tp).toBeDefined();
    expect(tp!.mirrorId).toBe(3);
  });

  it('detects stop-loss when PnL drops below SL threshold', () => {
    const triggers = checkRiskTriggers(mockMirrors, prefs);
    const sl = triggers.find((t) => t.type === 'sl');
    expect(sl).toBeDefined();
    expect(sl!.mirrorId).toBe(2);
  });

  it('returns empty when thresholds are 0 (disabled)', () => {
    const disabled = { ...prefs, tpPercent: 0, slPercent: 0 };
    expect(checkRiskTriggers(mockMirrors, disabled)).toHaveLength(0);
  });
});

describe('computeActions', () => {
  it('closes mirrors not in the allocation plan', () => {
    const allocations: Allocation[] = [
      { username: 'mirror-1', usdAmount: 500, pnlPercent: 5, score: 0.8 },
    ];
    const actions = computeActions(mockMirrors, allocations, prefs);
    expect(actions.find((a) => a.type === 'close')!.username).toBe('mirror-2');
  });

  it('opens new positions for new allocations', () => {
    const allocations: Allocation[] = [
      { username: 'new-trader', usdAmount: 1000, pnlPercent: 0, score: 0.9 },
    ];
    const actions = computeActions(mockMirrors, allocations, prefs);
    expect(actions.find((a) => a.type === 'open')!.username).toBe('new-trader');
  });

  it('holds existing mirrors that remain in the plan', () => {
    const allocations: Allocation[] = [
      { username: 'mirror-1', usdAmount: 500, pnlPercent: 5, score: 0.8 },
      { username: 'mirror-2', usdAmount: 500, pnlPercent: 3, score: 0.6 },
    ];
    const actions = computeActions(mockMirrors, allocations, prefs);
    expect(actions.filter((a) => a.type === 'hold')).toHaveLength(2);
    expect(actions.filter((a) => a.type === 'open')).toHaveLength(0);
    expect(actions.filter((a) => a.type === 'close')).toHaveLength(1);
  });

  it('closes risk-triggered mirrors even if in allocation plan', () => {
    const riskTriggers = [
      { type: 'tp' as const, username: 'mirror-1', mirrorId: 1, pnlPercent: 25, threshold: 20 },
    ];
    const allocations: Allocation[] = [
      { username: 'mirror-1', usdAmount: 500, pnlPercent: 5, score: 0.8 },
      { username: 'mirror-2', usdAmount: 500, pnlPercent: 3, score: 0.6 },
    ];
    const actions = computeActions(mockMirrors, allocations, prefs, riskTriggers);
    expect(actions.find((a) => a.type === 'close' && a.username === 'mirror-1')).toBeDefined();
  });
});
