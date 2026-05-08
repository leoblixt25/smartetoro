export interface SentimentResult {
  score: number;
  label: 'bullish' | 'neutral' | 'bearish';
  articlesAnalyzed: number;
  timestamp: string;
}

const BULLISH_WORDS = [
  'surge', 'rally', 'bullish', 'growth', 'gain', 'profit', 'upgrade',
  'outperform', 'boom', 'recovery', 'breakthrough', 'positive', 'momentum',
  'opportunity', 'innovation', 'expansion', 'record', 'strong', 'rise',
  'green', 'optimistic', 'upside', 'bull market',
];

const BEARISH_WORDS = [
  'plunge', 'crash', 'bearish', 'decline', 'loss', 'downgrade', 'recession',
  'inflation', 'volatile', 'uncertainty', 'risk', 'slowdown', 'crisis',
  'downturn', 'sell-off', 'correction', 'negative', 'weak', 'fall',
  'red', 'pessimistic', 'downside', 'bear market', 'tariff', 'default',
];

function scoreHeadline(headline: string): number {
  const lower = headline.toLowerCase();
  let score = 0;
  for (const word of BULLISH_WORDS) {
    if (lower.includes(word)) score += 1;
  }
  for (const word of BEARISH_WORDS) {
    if (lower.includes(word)) score -= 1;
  }
  return score;
}

function computeLabel(avgScore: number): SentimentResult['label'] {
  if (avgScore > 0.3) return 'bullish';
  if (avgScore < -0.3) return 'bearish';
  return 'neutral';
}

export function analyzeSentiment(headlines: string[]): SentimentResult {
  if (!headlines || headlines.length === 0) {
    return { score: 0, label: 'neutral', articlesAnalyzed: 0, timestamp: new Date().toISOString() };
  }

  const totalScore = headlines.reduce((s, h) => s + scoreHeadline(h), 0);
  const avgScore = totalScore / headlines.length;

  return {
    score: Math.max(-1, Math.min(1, avgScore / 3)),
    label: computeLabel(avgScore),
    articlesAnalyzed: headlines.length,
    timestamp: new Date().toISOString(),
  };
}

export function capitalMultiplier(sentiment: SentimentResult): number {
  if (sentiment.label === 'bullish') return 1.0;
  if (sentiment.label === 'bearish') return 0.5;
  return 0.75;
}
