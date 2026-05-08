export interface Position {
  positionId: number;
  instrumentId: number;
  symbol: string;
  openRate: number;
  currentRate: number;
  amount: number;
  units: number;
  pl: number;
  plPercent: number;
  createdAt: string;
}

export interface MirrorPosition {
  instrumentId: number;
  symbol: string;
  amount: number;
  units: number;
  pl: number;
  plPercent: number;
  positionId?: number;
}

export interface Mirror {
  mirrorID: number;
  cid: number;
  parentCID: number;
  stopLossPercentage: number;
  stopLossAmount: number;
  initialInvestment: number;
  availableAmount: number;
  isPaused: boolean;
  positions: MirrorPosition[];
}

export interface PortfolioResponse {
  clientPortfolio: {
    positions: Position[];
    credit: number;
    mirrors: Mirror[];
  };
}

export interface TraderProfile {
  cid: number;
  username: string;
  fullName?: string;
  isPopularInvestor: boolean;
  riskScore?: number;
  copiers: number;
  copyCount: number;
}

export interface Instrument {
  instrumentId: number;
  symbol: string;
  displayName: string;
  exchange: string;
  instrumentType: string;
}

export interface EtoroConfig {
  apiKey: string;
  userKey: string;
  environment: 'demo' | 'real';
}
