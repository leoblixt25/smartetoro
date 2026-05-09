export interface Position {
  positionId?: number;
  cid?: number;
  instrumentId?: number;
  symbol?: string;
  openRate?: number;
  openDateTime?: string;
  isBuy?: boolean;
  leverage?: number;
  amount: number;
  units?: number;
  pnL?: number;
  mirrorId?: number;
  parentPositionId?: number;
  takeProfitRate?: number;
  stopLossRate?: number;
  stopLossVersion?: number;
  isTslEnabled?: boolean;
  initialAmountInDollars?: number;
  totalFees?: number;
  orderId?: number;
  orderType?: number;
  isSettled?: boolean;
  initialUnits?: number;
  isPartiallyAltered?: boolean;
  unitsBaseValueDollars?: number;
  isDiscounted?: boolean;
  openPositionActionType?: number;
  settlementTypeId?: number;
  isDetached?: boolean;
  openConversionRate?: number;
  pnlVersion?: number;
  totalExternalFees?: number;
  totalExternalTaxes?: number;
  isNoTakeProfit?: boolean;
  isNoStopLoss?: boolean;
  lotCount?: number;
  closeRate?: number;
  closeConversionRate?: number;
  timestamp?: string;
}

export interface Mirror {
  mirrorId: number;
  cid?: number;
  parentCid?: number;
  stopLossPercentage?: number;
  isPaused?: boolean;
  copyExistingPositions?: boolean;
  availableAmount?: number;
  stopLossAmount?: number;
  initialInvestment?: number;
  depositSummary?: number;
  withdrawalSummary?: number;
  positions: Position[];
  parentUsername?: string;
  closedPositionsNetProfit?: number;
  startedCopyDate?: string;
  pendingForClosure?: boolean;
  parentMirrors?: unknown[];
  mirrorCalculationType?: number;
  mirrorStatusId?: number;
  ordersForOpen?: OrderForOpen[];
  ordersForClose?: OrderForClose[];
  ordersForCloseMultiple?: OrderForCloseMultiple[];
}

export interface OrderForOpen {
  orderId?: number;
  orderType?: number;
  statusId?: number;
  cid?: number;
  openDateTime?: string;
  lastUpdate?: string;
  instrumentId?: number;
  amount: number;
  amountInUnits?: number;
  isBuy?: boolean;
  leverage?: number;
  stopLossRate?: number;
  takeProfitRate?: number;
  isTslEnabled?: boolean;
  isDiscounted?: boolean;
  mirrorId?: number;
  frozenAmount?: number;
  totalExternalCosts?: number;
  isNoTakeProfit?: boolean;
  isNoStopLoss?: boolean;
  lotCount?: number;
  openPositionActionType?: number;
}

export interface Order {
  orderId?: number;
  cid?: number;
  openDateTime?: string;
  instrumentId?: number;
  isBuy?: boolean;
  takeProfitRate?: number;
  stopLossRate?: number;
  rate?: number;
  amount: number;
  leverage?: number;
  units?: number;
  isTslEnabled?: boolean;
  executionType?: number;
  isDiscounted?: boolean;
  isNoTakeProfit?: boolean;
  isNoStopLoss?: boolean;
}

export interface OrderForClose {
  orderId?: number;
  orderType?: number;
  statusId?: number;
  cid?: number;
  openDateTime?: string;
  lastUpdate?: string;
  instrumentId?: number;
  unitsToDeduct?: number;
  lotsToDeduct?: number;
  positionId?: number;
}

export interface OrderForCloseMultiple {
  orderId?: number;
  orderType?: number;
  statusId?: number;
  cid?: number;
  openDateTime?: string;
  lastUpdate?: string;
  instrumentId?: number;
  unitsToDeduct?: number;
  lotsToDeduct?: number;
  pendingClosePositionIds?: number[];
}

export interface PortfolioResponse {
  clientPortfolio: {
    positions: Position[];
    credit: number;
    mirrors: Mirror[];
    unrealizedPnL?: number;
    orders?: Order[];
    ordersForOpen?: OrderForOpen[];
    ordersForClose?: OrderForClose[];
    ordersForCloseMultiple?: OrderForCloseMultiple[];
    bonusCredit?: number;
    accountCurrencyId?: number;
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
