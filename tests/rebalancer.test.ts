import { describe, it, expect } from 'vitest';
import { computeActions, checkRiskTriggers } from '../shared/rebalancer';
import type { Mirror } from '../shared/etoro-types';
import type { Allocation } from '../shared/scorer';

const mockMirrors: Mirror[] = [
  {
    mirrorId: 1, cid: 100, parentCid: 200,
    stopLossPercentage: 10,
    initialInvestment: 1000, availableAmount: 500, isPaused: false,
    positions: [{ amount: 500, pnL: 50, instrumentId: 1 }],
  },
  {
    mirrorId: 2, cid: 101, parentCid: 201,
    stopLossPercentage: 5,
    initialInvestment: 2000, availableAmount: 200, isPaused: false,
    positions: [
      { amount: 1000, pnL: -300, instrumentId: 3 },
      { amount: 500, pnL: -100, instrumentId: 4 },
    ],
  },
  {
    mirrorId: 3, cid: 102, parentCid: 202,
    stopLossPercentage: 8,
    initialInvestment: 500, availableAmount: 200, isPaused: false,
    positions: [{ amount: 300, pnL: 150, instrumentId: 5 }],
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
