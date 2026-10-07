import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { renderWithStore } from '../../test/render.tsx';
import { makeProject, makeStatus, OWNER, VISITOR } from '../../test/status.ts';
import Board from './Board.tsx';

const ready = (data = makeStatus()) => ({ status: 'ready' as const, data, error: null });

function renderBoard(data = makeStatus(), me = VISITOR, path = '/') {
  return renderWithStore(
    <MemoryRouter initialEntries={[path]}>
      <Board />
    </MemoryRouter>,
    { preloadedState: { status: ready(data), session: { status: 'ready', me } } },
  );
}

const PROJECTS = [
  makeProject({
    number: 1,
    name: 'opt-out-log',
    attention: null,
    states: ['live'],
    current: 'observer',
  }),
  makeProject({ number: 3, name: 'agent-spend-cap', attention: null, states: ['archived'] }),
  makeProject({ number: 5, name: 'greenlight-status' }),
];

describe('Board', () => {
  it('shows every active project as a tile linking to its detail, and who needs you', () => {
    renderBoard(makeStatus({ projects: PROJECTS }));
    const list = screen.getAllByRole('list').find((l) => l.tagName === 'UL') as HTMLElement;
    const links = within(list).getAllByRole('link');
    // Needs-you first; the archived one is hidden under "Active".
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/p/5', '/p/1']);
    // In the header's count and on the Board stage, where the approve gate is.
    expect(screen.getAllByText('1 need you')).toHaveLength(2);
    expect(screen.getAllByRole('img', { name: 'Waiting for you: approve' }).length).toBeGreaterThan(
      0,
    );
  });

  it('shows the tokens each stage and each project used, with the breakdown in the stage drawer', async () => {
    const user = userEvent.setup();
    const usage = {
      input: 120_000,
      output: 45_000,
      cacheRead: 3_900_000,
      cacheWrite: 210_000,
      turns: 80,
      costUsd: 4.1235,
      runs: 2,
    };
    const status = makeStatus({ projects: [makeProject({ usage })] });
    status.stages = status.stages.map((s) => (s.id === 'factory' ? { ...s, usage } : s));
    renderBoard(status);
    expect(screen.getByText('Tokens: last 30 days')).toBeInTheDocument();
    const strip = screen.getByRole('list', { name: 'Pipeline stages' });
    // 120k + 45k + 3.9M + 210k
    expect(within(strip).getByText('4.3M tokens')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /greenlight-status/ })).toHaveTextContent(
      '4.3M tokens',
    );

    await user.click(within(strip).getByRole('button', { name: /Factory/ }));
    const drawer = screen.getByRole('dialog', { name: 'Factory' });
    expect(within(drawer).getByText('Usage since 2026-09-03')).toBeInTheDocument();
    expect(within(drawer).getByText('3.9M')).toBeInTheDocument();
    expect(within(drawer).getByText('2 (80 turns)')).toBeInTheDocument();
    expect(within(drawer).getByText('$4.12')).toBeInTheDocument();
  });

  it('shows no token figures before any run recorded them', () => {
    renderBoard(makeStatus({ projects: PROJECTS }));
    expect(screen.queryByText(/tokens/i)).not.toBeInTheDocument();
  });

  it('filters and searches', async () => {
    const user = userEvent.setup();
    renderBoard(makeStatus({ projects: PROJECTS }));
    await user.click(screen.getByRole('button', { name: 'Archived 1' }));
    expect(screen.getByRole('heading', { name: 'agent-spend-cap' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'opt-out-log' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Active 2' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'zzz');
    expect(screen.getByText('Nothing matches')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('heading', { name: 'opt-out-log' })).toBeInTheDocument();
  });

  it('opens a stage to show its recent runs', async () => {
    const user = userEvent.setup();
    const data = makeStatus();
    const scout = data.stages[0];
    if (scout) {
      scout.workflowUrl = 'https://github.com/yangxdev/greenlight/actions/workflows/scout.yml';
      scout.runs = [
        {
          at: '2026-10-03T06:00:00Z',
          status: 'failure',
          title: 'Scout',
          url: 'https://github.com/r/1',
        },
      ];
    }
    renderBoard(data);
    const strip = screen.getByRole('list', { name: 'Pipeline stages' });
    expect(within(strip).getByText('4h')).toBeInTheDocument();
    await user.click(within(strip).getByRole('button', { name: /Scout/ }));
    const dialog = screen.getByRole('dialog', { name: 'Scout' });
    expect(within(dialog).getByRole('link', { name: 'Scout' })).toHaveAttribute(
      'href',
      'https://github.com/r/1',
    );
    expect(within(dialog).getByRole('link', { name: 'All runs on GitHub' })).toBeInTheDocument();
  });

  it('opens the Board stage to show what needs you there, linking to each', async () => {
    const user = userEvent.setup();
    const live = makeProject({
      number: 1,
      name: 'opt-out-log',
      attention: null,
      states: ['live'],
      current: 'observer',
      changes: [
        {
          number: 10,
          name: 'Move opt-out-log to the app layout',
          url: 'https://github.com/yangxdev/greenlight/issues/10',
          states: ['idea'],
          closed: false,
          current: 'board',
          attention: 'approve',
          updatedAt: '2026-10-02T10:00:00.000Z',
        },
      ],
    });
    renderBoard(makeStatus({ projects: [live] }));
    const strip = screen.getByRole('list', { name: 'Pipeline stages' });
    await user.click(within(strip).getByRole('button', { name: /Board/ }));
    const dialog = screen.getByRole('dialog', { name: 'Board' });
    expect(within(dialog).getByRole('heading', { name: 'Waiting for you' })).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: 'Move opt-out-log to the app layout' }),
    ).toHaveAttribute('href', '/p/10');
    expect(within(dialog).getByText('#10 · change to opt-out-log')).toBeInTheDocument();
    expect(within(dialog).getByRole('img', { name: 'Approve' })).toBeInTheDocument();
  });

  it('offers "New idea" to the owner only', () => {
    const { unmount } = renderBoard(makeStatus(), VISITOR);
    expect(screen.queryByRole('button', { name: 'New idea' })).not.toBeInTheDocument();
    unmount();
    renderBoard(makeStatus(), OWNER);
    expect(screen.getByRole('button', { name: 'New idea' })).toBeInTheDocument();
  });

  it('CH13: offers "Quick note" beside "New idea" to the owner only, and opens its drawer', async () => {
    const user = userEvent.setup();
    const { unmount } = renderBoard(makeStatus(), VISITOR);
    expect(screen.queryByRole('button', { name: 'Quick note' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Jot it down' })).not.toBeInTheDocument();
    unmount();
    renderBoard(makeStatus(), OWNER);
    expect(screen.getByRole('button', { name: 'New idea' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Quick note' }));
    expect(screen.getByRole('dialog', { name: 'Jot it down' })).toBeInTheDocument();
  });

  it('explains a refused sign-in, and the stale copy', () => {
    renderBoard(makeStatus({ stale: true }), VISITOR, '/?signin=denied');
    expect(screen.getByText(/Only the pipeline’s owner can sign in/)).toBeInTheDocument();
    expect(screen.getByText(/last copy we have/)).toBeInTheDocument();
  });
});
