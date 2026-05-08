export interface UserPrefs {
  traderCount: number;
  tpPercent: number;
  slPercent: number;
  rebalanceHours: number;
  environment: 'demo' | 'real';
}

export interface AllocatorState {
  activeTraders: TraderAllocation[];
  totalInvested: number;
  availableCash: number;
  lastRebalance: string;
  nextRebalance: string;
}

export interface TraderAllocation {
  username: string;
  instrumentId: number;
  allocatedUsd: number;
  currentValue: number;
  pnlPercent: number;
  status: 'active' | 'closing' | 'pending';
}

export interface AllocationPlan {
  timestamp: string;
  allocations: { username: string; usdAmount: number; score: number; pnlPercent: number }[];
  reason: string;
}
