/**
 * eToro Execution Bridge
 * =======================
 * 
 * eToro does not provide a public REST API for copy-trading execution
 * (Start Copy, Stop Copy, Add Funds, Remove Funds). To automate these
 * actions, we use a headless browser approach.
 * 
 * Architecture:
 * ┌──────────────┐     webhook      ┌──────────────────┐
 * │ Cron Worker  │ ──────────────>  │ Executor Service │
 * │ (CF Workers) │                  │ (VPS / Railway)  │
 * └──────────────┘                  │ Playwright +     │
 *       ^                          │ eToro web app    │
 *       │ state:close-queue         └──────────────────┘
 *       │ KV read                         │
 *       └─────────────────────────────────┘
 * 
 * Flow:
 * 1. Cron Worker computes a Close Queue and writes to KV
 * 2. Cron Worker sends webhook POST to Executor Service URL
 * 3. Executor Service reads Close Queue from KV (or receives in payload)
 * 4. Executor opens headless browser, logs into eToro, executes actions
 * 5. Executor writes results back to KV (state:execution-results)
 * 6. Dashboard reads results on next render
 * 
 * Security:
 * - Executor Service requires a shared secret (EXECUTOR_SECRET) in webhook header
 * - eToro credentials stored as environment variables, never in code
 * - KV access uses a Cloudflare API token scoped to the eda-config namespace
 * - All browser sessions are ephemeral (no persistent cookies/cache)
 */

// ─── Types ────────────────────────────────────────────────────────────

export interface ExecutorAction {
  type: 'start-copy' | 'stop-copy' | 'add-funds' | 'remove-funds';
  mirrorId?: number;
  /** eToro username of the Popular Investor to copy/stop */
  traderUsername?: string;
  /** Amount in account currency (EUR/USD) */
  amount?: number;
  /** For start-copy: leverage (default 1) */
  leverage?: number;
}

export interface ExecutorRequest {
  actions: ExecutorAction[];
  /** KV read token (scoped) so executor can read close-queue directly */
  kvReadToken?: string;
  /** KV namespace ID */
  kvNamespaceId?: string;
  /** Callback URL for execution results */
  callbackUrl?: string;
}

export interface ExecutorResult {
  success: boolean;
  action: ExecutorAction;
  /** Browser screenshot URL for debugging */
  screenshotUrl?: string;
  error?: string;
  timestamp: string;
}

// ─── Playwright Action Templates ──────────────────────────────────────
// These are the actual browser automation sequences for each eToro action.
// They run inside the Executor Service (NOT Cloudflare Workers).

/**
 * Template: Stop Copy (close a mirror)
 * 
 * await page.goto('https://www.etoro.com/portfolio/');
 * await page.waitForSelector('[data-testid="mirror-table"]');
 * // Find the row for the target trader
 * const row = page.locator(`tr:has-text("${traderUsername}")`);
 * await row.locator('button:has-text("Stop Copy")').click();
 * await page.locator('button:has-text("Close")').click();
 * await page.waitForSelector('text=Position closed successfully');
 */

/**
 * Template: Start Copy (open a new mirror)
 * 
 * await page.goto(`https://www.etoro.com/people/${traderUsername}`);
 * await page.waitForSelector('button:has-text("Copy")');
 * await page.locator('button:has-text("Copy")').first().click();
 * await page.fill('input[name="investmentAmount"]', String(amount));
 * // Set leverage if needed
 * if (leverage > 1) {
 *   await page.fill('input[name="leverage"]', String(leverage));
 * }
 * await page.locator('button:has-text("Open Position")').click();
 * await page.waitForSelector('text=Position opened');
 */

/**
 * Template: Add Funds to an existing copy
 * 
 * await page.goto('https://www.etoro.com/portfolio/');
 * await page.waitForSelector('[data-testid="mirror-table"]');
 * const row = page.locator(`tr:has-text("${traderUsername}")`);
 * await row.locator('button:has-text("Add Funds")').click();
 * await page.fill('input[name="amount"]', String(amount));
 * await page.locator('button:has-text("Confirm")').click();
 */

/**
 * Template: Remove Funds from an existing copy
 * 
 * await page.goto('https://www.etoro.com/portfolio/');
 * await page.waitForSelector('[data-testid="mirror-table"]');
 * const row = page.locator(`tr:has-text("${traderUsername}")`);
 * await row.locator('button:has-text("Remove Funds")').click();
 * await page.fill('input[name="amount"]', String(amount));
 * await page.locator('button:has-text("Confirm")').click();
 */

// ─── Executor HTTP Handler (runs on VPS, not CF Workers) ──────────────
// Uncomment and deploy on a Node.js server with Playwright installed.
//
// import express from 'express';
// import { chromium } from 'playwright';
//
// app.post('/execute', async (req, res) => {
//   const secret = req.headers['x-executor-secret'];
//   if (secret !== process.env.EXECUTOR_SECRET) {
//     return res.status(401).json({ error: 'Unauthorized' });
//   }
//   const { actions } = req.body;
//   const results = [];
//   const browser = await chromium.launch({ headless: true });
//   const page = await browser.newPage();
//   try {
//     await page.goto('https://www.etoro.com/login');
//     await page.fill('input[name="username"]', process.env.ETORO_USERNAME);
//     await page.fill('input[name="password"]', process.env.ETORO_PASSWORD);
//     await page.click('button[type="submit"]');
//     await page.waitForURL('https://www.etoro.com/portfolio');
//     for (const action of actions) {
//       try {
//         switch (action.type) {
//           case 'stop-copy': /* use stop-copy template */ break;
//           case 'start-copy': /* use start-copy template */ break;
//         }
//         results.push({ success: true, action, timestamp: new Date().toISOString() });
//       } catch (e) {
//         results.push({ success: false, action, error: String(e), timestamp: new Date().toISOString() });
//       }
//     }
//   } finally { await browser.close(); }
//   res.json({ results });
// });

// ─── Cloudflare Worker Webhook Trigger ────────────────────────────────
// This runs inside the Cron Worker to trigger the Executor Service.

export async function triggerExecutor(
  executorUrl: string,
  kvReadToken: string,
  kvNamespaceId: string,
  actions: ExecutorAction[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(executorUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-executor-secret': kvReadToken,
      },
      body: JSON.stringify({
        actions,
        kvReadToken,
        kvNamespaceId,
      } satisfies ExecutorRequest),
    });
    if (!res.ok) {
      return { ok: false, error: `Executor returned ${res.status}` };
    }
    const data = await res.json() as { results: ExecutorResult[] };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
