/** The Architect's rule for the product repo's name (architect.yml), so the preview matches what it creates. */
export function repoSlug(title: string): string {
  return title
    .replace(/^\[idea\]\s*/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}
