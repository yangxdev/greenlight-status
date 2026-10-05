import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { renderWithStore } from '../../test/render.tsx';
import { makeStatus, mockApi } from '../../test/status.ts';
import { NewIdeaDrawer } from './NewIdeaDrawer.tsx';
import { repoSlug } from './slug.ts';

function renderDrawer() {
  return renderWithStore(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<NewIdeaDrawer open onClose={() => undefined} />} />
        <Route path="/p/:number" element={<p>project page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NewIdeaDrawer', () => {
  it('names the repo the way the Architect will', () => {
    expect(repoSlug('[idea] Glossary Guard!')).toBe('glossary-guard');
    expect(repoSlug('a'.repeat(50))).toHaveLength(40);
  });

  it('points at the missing required fields instead of sending', async () => {
    const user = userEvent.setup();
    const { sent } = mockApi({});
    renderDrawer();
    await user.click(screen.getByRole('button', { name: 'File idea' }));
    expect(screen.getByText('Give it a name.')).toBeInTheDocument();
    expect(screen.getByText('List the smallest thing that proves it.')).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('files the idea, approved if asked, and opens its page', async () => {
    const user = userEvent.setup();
    const { sent } = mockApi(
      { '/api/status': makeStatus() },
      {
        '/api/ideas': Response.json(
          { number: 12, url: 'https://github.com/x/12' },
          { status: 201 },
        ),
      },
    );
    renderDrawer();
    await user.type(screen.getByLabelText('Name'), 'Glossary Guard');
    expect(screen.getByText('Becomes the product repo: glossary-guard')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Problem'), 'Translators mix up glossaries.');
    await user.type(screen.getByLabelText('Target users'), 'Freelance translators');
    await user.type(screen.getByLabelText('MVP in one day'), '- Upload a glossary');
    await user.click(screen.getByRole('checkbox', { name: /Approve it now/ }));
    await user.click(screen.getByRole('button', { name: 'File and approve' }));
    expect(await screen.findByText('project page')).toBeInTheDocument();
    expect(sent[0]).toMatchObject({
      path: '/api/ideas',
      body: { title: 'Glossary Guard', users: 'Freelance translators', approve: true },
    });
  });
});
