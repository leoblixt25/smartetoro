import { describe, it, expect } from 'vitest';
import { analyzeSentiment, capitalMultiplier } from '../shared/sentiment';

describe('analyzeSentiment', () => {
  it('returns bullish for positive headlines', () => {
    const result = analyzeSentiment(['Stock market surges to new records', 'Strong economic growth continues']);
    expect(result.label).toBe('bullish');
    expect(result.score).toBeGreaterThan(0);
  });

  it('returns bearish for negative headlines', () => {
    const result = analyzeSentiment(['Market crashes amid recession fears', 'Tech stocks plunge on inflation concerns']);
    expect(result.label).toBe('bearish');
    expect(result.score).toBeLessThan(0);
  });

  it('returns neutral for mixed headlines', () => {
    const result = analyzeSentiment(['Markets open mixed today', 'Federal reserve holds rates steady']);
    expect(result.label).toBe('neutral');
  });

  it('handles empty input', () => {
    const result = analyzeSentiment([]);
    expect(result.score).toBe(0);
    expect(result.label).toBe('neutral');
    expect(result.articlesAnalyzed).toBe(0);
  });
});

describe('capitalMultiplier', () => {
  it('returns 1.0 for bullish', () => {
    expect(capitalMultiplier({ score: 0.5, label: 'bullish', articlesAnalyzed: 5, timestamp: '' })).toBe(1.0);
  });

  it('returns 0.5 for bearish', () => {
    expect(capitalMultiplier({ score: -0.5, label: 'bearish', articlesAnalyzed: 5, timestamp: '' })).toBe(0.5);
  });

  it('returns 0.75 for neutral', () => {
    expect(capitalMultiplier({ score: 0, label: 'neutral', articlesAnalyzed: 5, timestamp: '' })).toBe(0.75);
  });
});
