import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { renderWithStore } from '../../test/render.tsx';
import { makeDetail, makeStatus, makeSteps, mockApi, OWNER, VISITOR } from '../../test/status.ts';
import Project from './Project.tsx';

function renderProject(me = OWNER) {
  return renderWithStore(
    <MemoryRouter initialEntries={['/p/5']}>
      <Routes>
        <Route path="/p/:number" element={<Project />} />
      </Routes>
    </MemoryRouter>,
    { preloadedState: { session: { status: 'ready', me } } },
  );
}

const READY = makeDetail({
  states: ['blueprint-ready'],
  attention: 'blueprint-ok',
  current: 'reviewer',
  steps: makeSteps(5, 'waiting'),
  productRepo: 'yangxdev/greenlight-status',
  blueprintUrl: 'https://github.com/yangxdev/greenlight-status/blob/main/blueprint.md',
  events: [
    {
      stage: 'architect',
      at: '2026-10-03T14:49:15Z',
      author: 'github-actions[bot]',
      text: '**Architect:** blueprint ready.\n\n- Task 1: Types',
      url: 'https://github.com/c/1',
    },
    {
      stage: null,
      at: '2026-10-03T15:00:00Z',
      author: 'someone',
      text: 'Looks good <script>alert(1)</script>',
      url: 'https://github.com/c/2',
    },
  ],
});

describe('Project', () => {
  it("shows each stage's reports, the idea, and the discussion as plain text", async () => {
    mockApi({ '/api/projects/5': READY, '/api/status': makeStatus() });
    renderProject(VISITOR);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'greenlight-status' }),
    ).toBeInTheDocument();
    const stages = screen.getByRole('region', { name: 'Stages' });
    expect(within(stages).getByText('Task 1: Types')).toBeInTheDocument();
    expect(within(stages).getAllByText('Waiting for you')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Idea' })).toHaveTextContent('Nobody reads GitHub.');
    const discussion = screen.getByRole('region', { name: 'Discussion' });
    expect(discussion).toHaveTextContent('Looks good <script>alert(1)</script>');
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByRole('link', { name: /blueprint/ })).toHaveAttribute(
      'href',
      READY.blueprintUrl,
    );
    // A visitor gets no actions.
    expect(screen.queryByRole('button', { name: 'Start the build' })).not.toBeInTheDocument();
  });

  it('lets the owner start the build, then rereads the project', async () => {
    const user = userEvent.setup();
    const { sent, spy } = mockApi({ '/api/projects/5': READY, '/api/status': makeStatus() });
    renderProject();
    await user.click(await screen.findByRole('button', { name: 'Start the build' }));
    expect(sent).toEqual([
      { method: 'POST', path: '/api/projects/5/actions', body: { action: 'blueprint-ok' } },
    ]);
    await waitFor(() =>
      expect(spy.mock.calls.filter(([url]) => url === '/api/projects/5')).toHaveLength(2),
    );
  });

  it('keeps the gate button busy until the project is reread, then drops it', async () => {
    const user = userEvent.setup();
    const routes: Record<string, unknown> = {
      '/api/projects/5': READY,
      '/api/status': makeStatus(),
    };
    const { sent, spy } = mockApi(routes);
    renderProject();
    const start = await screen.findByRole('button', { name: 'Start the build' });

    // The reread after the action hangs until released, and then answers with the new state.
    let release!: () => void;
    const reread = new Promise<void>((resolve) => (release = resolve));
    const serve = spy.getMockImplementation()!;
    spy.mockImplementation(async (input, init) => {
      if (String(input) === '/api/projects/5') {
        await reread;
        return Response.json(
          makeDetail({ states: ['building'], attention: null, current: 'factory' }),
        );
      }
      return serve(input, init);
    });

    await user.click(start);
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Start the build' })).not.toBeInTheDocument();

    release();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Sending…' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Start the build' })).not.toBeInTheDocument();
  });

  it('asks before archiving, and shows GitHub refusing', async () => {
    const user = userEvent.setup();
    const { sent } = mockApi(
      { '/api/projects/5': READY },
      {
        '/api/projects/5/actions': Response.json(
          { error: 'GitHub refused: Resource not accessible by integration' },
          { status: 502 },
        ),
      },
    );
    renderProject();
    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    expect(sent).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Archive and close' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Resource not accessible');
  });

  it('posts a comment from the owner', async () => {
    const user = userEvent.setup();
    const { sent } = mockApi({ '/api/projects/5': READY });
    renderProject();
    await user.type(await screen.findByLabelText('Comment'), 'Cut task 3.');
    await user.click(screen.getByRole('button', { name: 'Comment' }));
    expect(sent[0]).toEqual({
      method: 'POST',
      path: '/api/projects/5/comments',
      body: { body: 'Cut task 3.' },
    });
  });

  it('says so when the issue is not a project', async () => {
    mockApi({});
    renderProject();
    expect(await screen.findByText('Could not open this project')).toBeInTheDocument();
  });
});

describe('changes on the project page', () => {
  const LIVE = makeDetail({
    states: ['live'],
    attention: null,
    current: 'observer',
    changes: [
      {
        number: 12,
        name: 'Move to the app layout',
        url: '',
        states: ['blueprint-ready'],
        closed: false,
        current: 'reviewer',
        attention: 'blueprint-ok',
        updatedAt: '',
      },
      {
        number: 9,
        name: 'Add search',
        url: '',
        states: ['shipped'],
        closed: true,
        current: 'publisher',
        attention: null,
        updatedAt: '',
      },
    ],
  });

  it("lists a live product's changes and files a new one under it", async () => {
    const user = userEvent.setup();
    const { sent } = mockApi(
      { '/api/projects/5': LIVE, '/api/status': makeStatus() },
      {
        '/api/projects/5/changes': Response.json(
          { number: 14, url: 'https://github.com/x/14' },
          { status: 201 },
        ),
      },
    );
    renderProject();
    const pane = await screen.findByRole('region', { name: 'Changes' });
    expect(within(pane).getByRole('link', { name: '#12 Move to the app layout' })).toHaveAttribute(
      'href',
      '/p/12',
    );
    expect(within(pane).getByRole('img', { name: 'Waiting for you' })).toBeInTheDocument();
    expect(within(pane).getByRole('img', { name: 'Shipped' })).toBeInTheDocument();

    await user.click(within(pane).getByRole('button', { name: 'Request a change' }));
    const dialog = screen.getByRole('dialog', { name: 'Request a change' });
    await user.click(within(dialog).getByRole('button', { name: 'File change' }));
    expect(within(dialog).getByText('Say what should change.')).toBeInTheDocument();
    expect(sent).toHaveLength(0);
    await user.type(within(dialog).getByLabelText('Title'), 'Dark mode first');
    await user.type(
      within(dialog).getByLabelText('What should change'),
      'Open in dark on dark systems.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'File change' }));
    expect(sent[0]).toMatchObject({
      path: '/api/projects/5/changes',
      body: { title: 'Dark mode first', change: 'Open in dark on dark systems.', approve: false },
    });
  });

  it('offers no change requests before the product is live, nor to visitors', async () => {
    mockApi({ '/api/projects/5': READY });
    renderProject();
    const pane = await screen.findByRole('region', { name: 'Changes' });
    expect(pane).toHaveTextContent('once the product is live');
    expect(
      within(pane).queryByRole('button', { name: 'Request a change' }),
    ).not.toBeInTheDocument();
  });

  it("a change's page names its product and its spec", async () => {
    mockApi({
      '/api/projects/5': makeDetail({
        kind: 'change',
        parent: 1,
        name: 'Move to the app layout',
        productRepo: 'yangxdev/opt-out-log',
        blueprintUrl: 'https://github.com/yangxdev/opt-out-log/blob/main/changes/5.md',
      }),
    });
    renderProject(VISITOR);
    expect(await screen.findByRole('link', { name: '#1' })).toHaveAttribute('href', '/p/1');
    expect(screen.getByText(/change #5/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /change spec/ })).toHaveAttribute(
      'href',
      'https://github.com/yangxdev/opt-out-log/blob/main/changes/5.md',
    );
    expect(screen.queryByRole('region', { name: 'Changes' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Request' })).toBeInTheDocument();
  });
});
