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
