import type { TokenUsage } from '../../../shared/api.ts';
import type { Detail } from '../../components/ui/index.ts';
import { formatTokens, formatUsd } from '../../lib/format.ts';

/** Every token a run read or wrote: fresh input, cache reads and writes, and output. */
export const totalTokens = (u: TokenUsage) => u.input + u.output + u.cacheRead + u.cacheWrite;

/** "1.2M tokens" */
export const tokensLabel = (u: TokenUsage) => `${formatTokens(totalTokens(u))} tokens`;

const runs = (n: number) => `${n} ${n === 1 ? 'run' : 'runs'}`;

/** "1.2M tokens · 1.1M from cache · 3 runs · $4.10 at API prices": one line under a stage. */
export function usageLine(u: TokenUsage): string {
  return [
    tokensLabel(u),
    `${formatTokens(u.cacheRead)} from cache`,
    runs(u.runs),
    `${formatUsd(u.costUsd)} at API prices`,
  ].join(' · ');
}

/** The full breakdown, for a `DetailList`. */
export function usageDetails(u: TokenUsage): Detail[] {
  return [
    { label: 'Tokens', value: formatTokens(totalTokens(u)) },
    { label: 'Fresh input', value: formatTokens(u.input) },
    { label: 'Read from cache', value: formatTokens(u.cacheRead) },
    { label: 'Written to cache', value: formatTokens(u.cacheWrite) },
    { label: 'Output', value: formatTokens(u.output) },
    { label: 'Runs', value: `${u.runs} (${u.turns} turns)` },
    { label: 'At API prices', value: formatUsd(u.costUsd) },
  ];
}
