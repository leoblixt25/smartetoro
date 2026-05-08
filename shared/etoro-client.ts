import type { PortfolioResponse, TraderProfile, Instrument, EtoroConfig } from './etoro-types';

function uuid(): string {
  return crypto.randomUUID();
}

export interface OrderResult {
  positionId: number;
  orderId: number;
}

export class EtoroClient {
  private base: string;
  private apiKey: string;
  private userKey: string;

  constructor(config: EtoroConfig) {
    this.base = 'https://public-api.etoro.com/api/v1';
    this.apiKey = config.apiKey;
    this.userKey = config.userKey;
  }

  private headers(): Record<string, string> {
    return {
      'x-request-id': uuid(),
      'x-api-key': this.apiKey,
      'x-user-key': this.userKey,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(path: string, opts?: { method?: string; body?: unknown }): Promise<T> {
    const url = `${this.base}${path}`;
    const res = await fetch(url, {
      method: opts?.method ?? 'GET',
      headers: this.headers(),
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`eToro API ${res.status}: ${res.statusText} — ${body}`);
    }
    return res.json<T>();
  }

  async getPortfolio(environment: 'demo' | 'real'): Promise<PortfolioResponse> {
    return this.request<PortfolioResponse>(`/trading/info/${environment}/pnl`);
  }

  async searchTraders(query: string): Promise<TraderProfile[]> {
    const raw = await this.request<{ users: TraderProfile[] }>(
      `/user-info/people?q=${encodeURIComponent(query)}`
    );
    return raw.users ?? [];
  }

  async searchInstruments(query: string): Promise<Instrument[]> {
    const raw = await this.request<{ instruments: Instrument[] }>(
      `/market-data/search?q=${encodeURIComponent(query)}`
    );
    return raw.instruments ?? [];
  }

  async openPosition(
    environment: 'demo' | 'real',
    instrumentId: number,
    amount: number,
    isBuy: boolean,
    opts?: { takeProfitRate?: number; stopLossRate?: number }
  ): Promise<OrderResult> {
    return this.request<OrderResult>(
      `/trading/execution/${environment}/market-open-orders/by-amount`,
      {
        method: 'POST',
        body: {
          InstrumentID: instrumentId,
          Amount: amount,
          IsBuy: isBuy,
          TakeProfitRate: opts?.takeProfitRate ?? 0,
          StopLossRate: opts?.stopLossRate ?? 0,
        },
      }
    );
  }

  async closePosition(
    environment: 'demo' | 'real',
    positionId: number,
    unitsToDeduct?: number
  ): Promise<{ token: string }> {
    return this.request<{ token: string }>(
      `/trading/execution/${environment}/market-close-orders/positions/${positionId}`,
      {
        method: 'POST',
        body: unitsToDeduct ? { UnitsToDeduct: unitsToDeduct } : {},
      }
    );
  }
}

export function createEtoroClient(config: EtoroConfig): EtoroClient {
  return new EtoroClient(config);
}
