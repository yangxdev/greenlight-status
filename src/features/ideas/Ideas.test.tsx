import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithStore } from '../../test/render.tsx';
import { makeStatus } from '../../test/status.ts';
import Ideas from './Ideas.tsx';

const row = (name: string, total: number) => ({
  name,
  pain: 4,
  competition: 3,
  mvp: 4,
  reach: 3,
  total,
  verdict: '',
});

describe('Ideas', () => {
  it('lists scored cards newest run first, marks the filed ones, and switches to the watchlist', async () => {
    const user = userEvent.setup();
    const data = makeStatus({
      runs: [
        {
          date: '2026-10-02',
          file: '2026-10-02-critic.md',
          url: 'https://github.com/a',
          rows: [row('Alpha', 15)],
        },
        {
          date: '2026-10-01',
          file: '2026-10-01-critic.md',
          url: 'https://github.com/b',
          rows: [row('Beta', 13)],
        },
      ],
      watchlist: [
        {
          name: 'Gamma',
          bestScore: 13,
          bestScoreDate: '2026-09-30',
          lastEvidence: 'a thread',
          problem: '',
          needs: 'a buyer',
        },
      ],
    });
    renderWithStore(<Ideas />, {
      preloadedState: { status: { status: 'ready', data, error: null } },
    });
    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(['Alpha', 'Beta']);
    expect(screen.getAllByText('filed')).toHaveLength(1);
    expect(screen.getByText(/total of 14 or more/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Watchlist 1' }));
    expect(screen.getByText('Needs: a buyer')).toBeInTheDocument();
  });
});
