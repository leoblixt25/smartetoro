export interface UserPrefs {
  traderCount: number;
  tpPercent: number;
  slPercent: number;
  rebalanceHours: number;
  environment: 'demo' | 'real';
  currency?: string;
}

export interface AllocatorState {
  activeTraders: TraderAllocation[];
  totalInvested: number;
  currentPortfolioValue: number;
  availableCash: number;
  totalPnlPercent: number;
  currency: string;
  lastRebalance: string;
  nextRebalance: string;
}

export interface TraderAllocation {
  username: string;
  traderName?: string;
  instrumentId: number;
  allocated: number;
  currentValue: number;
  pnlPercent: number;
  status: 'active' | 'closing' | 'pending';
}

export interface AllocationPlan {
  timestamp: string;
  allocations: { username: string; usdAmount: number; score: number; pnlPercent: number }[];
  reason: string;
}
