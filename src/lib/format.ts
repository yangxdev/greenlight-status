/** "2026-10-03T10:00:00.000Z" → "2026-10-03 10:00 UTC". Fixed zone so every visitor reads the same time. */
export function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const text = date.toISOString();
  return `${text.slice(0, 10)} ${text.slice(11, 16)} UTC`;
}
