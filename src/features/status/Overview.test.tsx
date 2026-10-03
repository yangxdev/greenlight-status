import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { StatusResponse } from '../../../shared/api.ts';
import { renderWithStore } from '../../test/render.tsx';
import { makeStatus } from '../../test/status.ts';
import Overview from './Overview.tsx';
import type { StatusState } from './statusSlice.ts';

const renderOverview = (status: StatusState) =>
  renderWithStore(
    <MemoryRouter>
      <Overview />
    </MemoryRouter>,
    { preloadedState: { status } },
  );

const ready = (data: StatusResponse): StatusState => ({ status: 'ready', data, error: null });

const row = (name: string, total: number) => ({
  name,
  pain: 3,
  competition: 3,
  mvp: 3,
  reach: 3,
  total,
  verdict: '',
});

const sample = makeStatus({
  ideas: [
    { number: 1, name: 'A', states: ['idea'], url: 'u1' },
    { number: 2, name: 'B', states: ['idea'], url: 'u2' },
    { number: 3, name: 'C', states: ['live', 'stuck'], url: 'u3' },
  ],
  runs: [
    {
      date: '2026-10-02',
      file: '2026-10-02-critic.md',
      url: 'https://github.com/yangxdev/greenlight/blob/main/analysis/2026-10-02-critic.md',
      rows: [row('a', 15), row('b', 14), row('c', 13), row('d', 9)],
    },
  ],
  live: [
    {
      issue: 3,
      name: 'Waypoint',
      issueUrl: 'https://github.com/yangxdev/greenlight/issues/3',
      liveUrl: 'https://waypoint.workers.dev',
      verdict: 'keep',
      reason: 'People use it.',
    },
    {
      issue: 4,
      name: 'Tallybook',
      issueUrl: 'https://github.com/yangxdev/greenlight/issues/4',
      liveUrl: null,
      verdict: 'improve',
      reason: 'Needs a faster start.',
    },
  ],
});

describe('Overview', () => {
  it('AC19: shows skeletons and no counts while loading with no data', () => {
    renderOverview({ status: 'loading', data: null, error: null });
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText('approved')).not.toBeInTheDocument();
  });

  it('AC20: shows the headline, one stat per state and the latest run', () => {
    renderOverview(ready(sample));
    expect(
      screen.getByRole('heading', { level: 1, name: 'What the pipeline did, in public.' }),
    ).toBeInTheDocument();
    const stat = (caption: string) => screen.getByText(caption).previousElementSibling;
    expect(stat('idea')).toHaveTextContent('2');
    expect(stat('live')).toHaveTextContent('1');
    expect(stat('stuck')).toHaveTextContent('1');
    expect(stat('approved')).toHaveTextContent('0');
    const grid = screen.getByText('idea').parentElement?.parentElement;
    expect(Array.from(grid?.children ?? []).map((c) => c.lastElementChild?.textContent)).toEqual([
      'idea',
      'approved',
      'blueprint-ready',
      'blueprint-ok',
      'building',
      'live',
      'stuck',
      'archived',
    ]);

    const details = within(screen.getByRole('region', { name: 'The newest Ideas run in numbers' }));
    expect(details.getByText('2026-10-02')).toBeInTheDocument();
    expect(details.getByText('Scored').nextElementSibling).toHaveTextContent('4');
    expect(details.getByText('Filed').nextElementSibling).toHaveTextContent('2');
    expect(details.getByText('Rejected').nextElementSibling).toHaveTextContent('2');
  });

  it('AC21: links live products and shows verdict and reason; empty states', () => {
    const { unmount } = renderOverview(ready(sample));
    expect(screen.getByRole('link', { name: 'Waypoint' })).toHaveAttribute(
      'href',
      'https://waypoint.workers.dev',
    );
    expect(screen.getByRole('link', { name: 'Tallybook' })).toHaveAttribute(
      'href',
      'https://github.com/yangxdev/greenlight/issues/4',
    );
    expect(screen.getByText('keep')).toBeInTheDocument();
    expect(screen.getByText('Needs a faster start.')).toBeInTheDocument();
    unmount();

    renderOverview(ready(makeStatus({ live: [], runs: [] })));
    expect(screen.getByText('Nothing live yet')).toBeInTheDocument();
    expect(screen.getByText('No Ideas run yet')).toBeInTheDocument();
  });

  it('AC22: shows the stale note only when stale, and Updated in a time element', () => {
    const { unmount } = renderOverview(ready({ ...sample, stale: true }));
    expect(
      screen.getByText('GitHub did not answer, so this is the last copy we have.'),
    ).toBeInTheDocument();
    const time = screen.getByText('2026-10-03 10:00 UTC');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('datetime', sample.fetchedAt);
    expect(screen.getByText(/Updated/)).toBeInTheDocument();
    unmount();

    renderOverview(ready(sample));
    expect(screen.queryByText(/last copy we have/)).not.toBeInTheDocument();
  });

  it('AC23: shows the server message on failure and Try again refetches', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json({ error: 'GitHub is not answering right now.' }, { status: 503 }),
      );
    renderOverview({ status: 'error', data: null, error: 'GitHub is not answering right now.' });
    expect(screen.getByRole('alert')).toHaveTextContent('GitHub is not answering right now.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(spy).toHaveBeenCalledWith('/api/status', expect.anything());
  });
});
