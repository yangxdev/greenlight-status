/** "2026-10-03T10:00:00.000Z" → "2026-10-03 10:00 UTC". Fixed zone so every visitor reads the same time. */
export function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const text = date.toISOString();
  return `${text.slice(0, 10)} ${text.slice(11, 16)} UTC`;
}

/**
 * How long before `reference` something happened: "now", "12m", "5h", "3d", then the date. Measured against the
 * document's own fetchedAt, not the clock, so a cached page reads the same for everyone and tests are stable.
 */
export function ago(iso: string | null, reference: string): string {
  if (!iso) return '';
  const then = Date.parse(iso);
  const now = Date.parse(reference);
  if (Number.isNaN(then) || Number.isNaN(now)) return '';
  const minutes = Math.max(0, Math.round((now - then) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d`;
  return new Date(then).toISOString().slice(0, 10);
}

/** 950 → "950", 12_345 → "12.3k", 840_000 → "840k", 3_900_000 → "3.9M": token counts at a glance. */
export function formatTokens(n: number): string {
  const short = (value: number, unit: string) =>
    `${value >= 100 ? Math.round(value) : Number(value.toFixed(1))}${unit}`;
  if (n < 1000) return String(Math.round(n));
  if (n < 999_500) return short(n / 1000, 'k');
  return short(n / 1_000_000, 'M');
}

/** 3.1234 → "$3.12", 0.004 → "<$0.01". */
export function formatUsd(n: number): string {
  if (n > 0 && n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}
