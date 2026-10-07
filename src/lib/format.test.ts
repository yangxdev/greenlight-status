import { describe, expect, it } from 'vitest';
import { formatTokens, formatUsd } from './format.ts';

describe('formatTokens', () => {
  it('shortens counts to k and M', () => {
    expect([950, 12_345, 840_000, 999_600, 3_940_000, 12_400_000].map(formatTokens)).toEqual([
      '950',
      '12.3k',
      '840k',
      '1M',
      '3.9M',
      '12.4M',
    ]);
  });
});

describe('formatUsd', () => {
  it('rounds to cents, and says when a cost is under one', () => {
    expect([4.1235, 0, 0.004].map(formatUsd)).toEqual(['$4.12', '$0.00', '<$0.01']);
  });
});
