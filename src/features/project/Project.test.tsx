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
