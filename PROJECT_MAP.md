# EDA — eToro Dynamic Allocator

## TECH_STACK
- Frontend: Cloudflare Pages (vanilla JS SPA)
- API: Cloudflare Pages Functions (TypeScript)
- Engine: Cloudflare Workers Cron Triggers
- Storage: Cloudflare KV (config, state, cache)
- CI/CD: GitHub Actions → wrangler deploy
- External: eToro Public API v1.158.0, NewsAPI (optional)
- Runtime: Node 22.14, wrangler 4.90, vitest 4.1.5

## SYSTEM_FLOW
```
User Config → KV (user:prefs)
       ↓
Cron Trigger (every N hours) → Fetch Portfolio + Mirrors via eToro API
       ↓
Fetch News → Sentiment Analysis → Sentiment Multiplier
       ↓
Scorer → evaluateTrackers() → rank by profit/consistency/risk
       ↓
Allocator → allocateCapital() → proportional distribution
       ↓
Rebalancer → computeActions() → determine open/close/hold
       ↓
Execute via eToro Trading API → close underperformers, open new positions
       ↓
Store state → KV (state:current, state:last-plan, state:last-actions)
       ↓
Dashboard Refresh → displays live allocation + config
```

## ARCHITECTURE
```
/eda/
├── public/                    # Cloudflare Pages static assets (SPA)
├── functions/api/             # Pages Functions (API endpoints)
│   ├── status.ts              # Health check + current state
│   ├── config.ts              # User preferences CRUD
│   ├── portfolio.ts           # eToro portfolio proxy
│   ├── traders.ts             # Popular Investor search
│   ├── sentiment.ts           # News sentiment analysis
│   └── rebalance.ts           # Manual rebalance trigger
├── workers/allocator/         # Cron-triggered allocation engine
│   ├── wrangler.jsonc
│   └── src/index.ts
├── shared/                    # Shared modules
│   ├── types.ts               # UserPrefs, AllocatorState, AllocationPlan
│   ├── etoro-types.ts         # eToro API response types
│   ├── etoro-client.ts        # eToro HTTP client (auth, CRUD, trading)
│   ├── scorer.ts              # Tracker evaluation + capital allocation
│   ├── rebalancer.ts          # Rebalance orchestration + TP/SL
│   └── sentiment.ts           # Keyword-based news sentiment analysis
├── tests/                     # Vitest test suite (23 tests)
├── wrangler.jsonc             # Pages project config
└── .github/workflows/         # CI/CD deploy workflows
```

## ORPHANS & PENDING
- [DONE] M1: Project scaffold (wrangler, dirs, basic Page + Worker)
- [DONE] M2: eToro API client (auth + portfolio read + trader search)
- [DONE] M3: Tracker evaluation engine (profit/consistency/risk scoring)
- [DONE] M4: Proportional capital allocation algorithm
- [DONE] M5: Trade execution client (open/close positions via eToro API)
- [DONE] M6: TP/SL monitoring and auto-close triggers
- [DONE] M7: News sentiment integration with capital multiplier
- [DONE] M8: Dashboard UI (status, config, manual rebalance)
- [DONE] M9: Cron-based periodic execution with sentiment
- [DONE] M10: CI/CD pipeline (GitHub Actions → Cloudflare)
- [DONE] News API provider — graceful fallback when no API key configured
- [DONE] eToro API rate limits — documented in docs/eda-deploy.md
- [DONE] Demo vs Real environment switching — dropdown on dashboard
- [DONE] Production secrets setup — documented in docs/eda-deploy.md
- [DONE] eToro demo account setup instructions — documented in docs/eda-deploy.md
- [DONE] Error handling audit — all 6 endpoints have try/catch, shared modules have null guards
