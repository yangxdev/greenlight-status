import { screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { CriticRow, StatusResponse } from '../../../shared/api.ts';
import { renderWithStore } from '../../test/render.tsx';
import { makeStatus } from '../../test/status.ts';
import Ideas from './Ideas.tsx';

const renderIdeas = (data: StatusResponse) =>
  renderWithStore(
    <MemoryRouter>
      <Ideas />
    </MemoryRouter>,
    { preloadedState: { status: { status: 'ready', data, error: null } } },
  );

const row = (name: string, total: number, verdict = ''): CriticRow => ({
  name,
  pain: 4,
  competition: 3,
  mvp: 5,
  reach: total - 12,
  total,
  verdict,
});

const BLOB = 'https://github.com/yangxdev/greenlight/blob/main/analysis';

const sample = makeStatus({
  runs: [
    {
      date: '2026-10-02',
      file: '2026-10-02-critic.md',
      url: `${BLOB}/2026-10-02-critic.md`,
      rows: [row('Newer idea', 14, 'File it.'), row('Near miss', 13, 'Needs a buyer.')],
    },
    {
      date: '2026-10-01',
      file: '2026-10-01-critic.md',
      url: `${BLOB}/2026-10-01-critic.md`,
      rows: [row('Older idea', 12)],
    },
  ],
  watchlist: [
    {
      name: 'Watched thing',
      bestScore: 13,
      bestScoreDate: '2026-09-30',
      lastEvidence: 'Two forum posts',
      problem: 'slow',
      needs: 'a paying user',
    },
  ],
});

describe('Ideas', () => {
  it('AC24: lists the newer run first, each row with scores, total and verdict', () => {
    renderIdeas(sample);
    const names = screen
      .getAllByRole('heading', { level: 4 })
      .map((h) => h.textContent)
      .filter((t) => t !== 'Watched thing');
    expect(names).toEqual(['Newer idea', 'Near miss', 'Older idea']);
    const item = screen.getByText('Newer idea').closest('li');
    expect(item).not.toBeNull();
    const within_ = within(item as HTMLElement);
    expect(within_.getByText('Pain 4 · Competition 3 · MVP 5 · Reach 2')).toBeInTheDocument();
    expect(within_.getByText('14/20')).toBeInTheDocument();
    expect(within_.getByText('File it.')).toBeInTheDocument();
  });

  it('AC25: states the threshold and marks only filed rows', () => {
    const { unmount } = renderIdeas(sample);
    expect(screen.getByText(/total of 14 or more/)).toBeInTheDocument();
    expect(screen.getAllByText('filed')).toHaveLength(1);
    expect(
      within(screen.getByText('Newer idea').closest('li') as HTMLElement).getByText('filed'),
    ).toBeInTheDocument();
    unmount();

    renderIdeas({ ...sample, filedThreshold: 13 });
    expect(screen.getByText(/total of 13 or more/)).toBeInTheDocument();
    expect(screen.getAllByText('filed')).toHaveLength(2);
  });

  it('AC26: shows a watchlist entry, or the empty message', () => {
    const { unmount } = renderIdeas(sample);
    const item = within(screen.getByText('Watched thing').closest('li') as HTMLElement);
    expect(item.getByText('13/20')).toBeInTheDocument();
    expect(item.getByText('2026-09-30')).toBeInTheDocument();
    expect(item.getByText('Two forum posts')).toBeInTheDocument();
    expect(item.getByText('Needs: a paying user')).toBeInTheDocument();
    unmount();

    renderIdeas({ ...sample, watchlist: [] });
    expect(screen.getByText('The watchlist is empty')).toBeInTheDocument();
  });

  it('AC27: row links point at the source files and carry noopener', () => {
    renderIdeas(sample);
    const run = screen.getByRole('link', { name: 'Newer idea' });
    expect(run).toHaveAttribute('href', `${BLOB}/2026-10-02-critic.md`);
    expect(run.getAttribute('rel')).toContain('noopener');
    const watch = screen.getByRole('link', { name: 'Watched thing' });
    expect(watch).toHaveAttribute('href', sample.watchlistUrl);
    expect(watch.getAttribute('rel')).toContain('noopener');
  });

  it('shows the empty run state', () => {
    renderIdeas(makeStatus());
    expect(screen.getByText('No Ideas run yet')).toBeInTheDocument();
  });
});
