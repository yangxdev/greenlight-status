import { STAGES, type StageId, type TokenUsage } from '../../shared/api.ts';

const STAGE_IDS = new Set<string>(STAGES.map((s) => s.id));
const MARKER = /<!--\s*greenlight:usage\s+([^<>]*?)\s*-->/g;
const FIELD = /([a-z_]+)=(\S+)/g;

function count(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * The usage markers in one comment or file, one per stage. A workflow appends its markers after everything else,
 * so the last one for a stage is the real one: a marker inside text an agent wrote (a review, a summary) comes
 * earlier and loses. Stages outside the ten (the Scribe) are left out.
 */
export function parseUsage(text: string): Map<StageId, TokenUsage> {
  const found = new Map<StageId, TokenUsage>();
  for (const m of text.matchAll(MARKER)) {
    const fields = new Map<string, string>();
    for (const f of (m[1] ?? '').matchAll(FIELD)) fields.set(f[1] ?? '', f[2] ?? '');
    const stage = fields.get('stage');
    if (!stage || !STAGE_IDS.has(stage)) continue;
    found.set(stage as StageId, {
      input: count(fields.get('in')),
      output: count(fields.get('out')),
      cacheRead: count(fields.get('cache_read')),
      cacheWrite: count(fields.get('cache_write')),
      turns: count(fields.get('turns')),
      costUsd: count(fields.get('cost')),
      runs: 1,
    });
  }
  return found;
}

export function addUsage(a: TokenUsage | null | undefined, b: TokenUsage): TokenUsage {
  if (!a) return { ...b };
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    turns: a.turns + b.turns,
    costUsd: a.costUsd + b.costUsd,
    runs: a.runs + b.runs,
  };
}

/** Per-stage totals over several comments or files. Only pass text from trusted authors. */
export function sumUsage(texts: Iterable<string>): Map<StageId, TokenUsage> {
  const totals = new Map<StageId, TokenUsage>();
  for (const text of texts) {
    for (const [stage, usage] of parseUsage(text))
      totals.set(stage, addUsage(totals.get(stage), usage));
  }
  return totals;
}

/** Every stage's figures as one total, or null when there are none. */
export function totalUsage(byStage: Iterable<TokenUsage | null>): TokenUsage | null {
  let total: TokenUsage | null = null;
  for (const usage of byStage) if (usage) total = addUsage(total, usage);
  return total;
}
