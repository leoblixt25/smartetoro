# EDA Deployment Guide

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/)
- [eToro account](https://www.etoro.com/) (verified)
- [NewsAPI key](https://newsapi.org/) (optional, for sentiment)

## Step 1: eToro API Setup

1. Log in to eToro → Settings → Trading
2. Scroll to "API Key Management" → **Create New Key**
3. Configure:
   - **Key Name**: `eda-allocator`
   - **Environment**: `Demo` (start here)
   - **Permissions**: `Read` + `Write`
   - **IPS Whitelist**: optional
4. Copy **Public API Key** (x-api-key) and **User Key** (x-user-key)

> **Rate Limits:** eToro API v1.158.0 includes rate limit headers. Trading endpoints: ~10 req/min. Market data: ~30 req/min. Portfolio info: ~30 req/min. The allocator runs every 4h (well within limits).

## Step 2: Local Development

```bash
# Install dependencies
npm install

# Create local secrets file
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your eToro keys:
#   ETORO_API_KEY=your-public-api-key
#   ETORO_USER_KEY=your-user-key
#   NEWS_API_KEY=your-newsapi-key (optional)

# Run locally
npm run dev
# → http://localhost:8788
```

## Step 3: Production Deploy

```bash
# 1. Create KV namespace
npx wrangler kv namespace create eda-config
# → Copy the ID, update wrangler.jsonc

# 2. Set secrets
npx wrangler secret put ETORO_API_KEY
npx wrangler secret put ETORO_USER_KEY
npx wrangler secret put NEWS_API_KEY  # optional

# 3. Deploy Pages (API + dashboard)
npm run deploy

# 4. Deploy cron allocator
npm run deploy:allocator
```

Or push to GitHub → CI/CD deploys automatically.

## Step 4: Verify

1. Open your Cloudflare Pages URL
2. Check dashboard loads (green "API ok" badge)
3. Navigate to Settings → select `Demo` environment
4. Click **Manual Rebalance** to test
5. Monitor logs: `npx wrangler tail eda-allocator`

## Switching to Real Trading

1. Create a second eToro API key with `Real` environment
2. Update secrets with the real key
3. Dashboard → Config → Environment → `Real`
4. Start with small amounts to verify
