import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithStore } from '../../test/render.tsx';
import { mockApi } from '../../test/status.ts';
import { QuickNoteDrawer } from './QuickNoteDrawer.tsx';

const URL_21 = 'https://github.com/yangxdev/greenlight/issues/21';
const filed = () => ({
  '/api/notes': Response.json({ number: 21, url: URL_21 }, { status: 201 }),
});

describe('QuickNoteDrawer', () => {
  it('CH9: opens on Idea with empty fields and one primary button', () => {
    renderWithStore(<QuickNoteDrawer open onClose={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Idea' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Evidence' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByLabelText('Note')).toHaveValue('');
    expect(screen.getByLabelText('Links')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'File note' })).toBeInTheDocument();
    expect(screen.getByText(/Idea: the problem and what you'd build/)).toBeInTheDocument();
    expect(screen.getByText('One per line. The thread or post itself.')).toBeInTheDocument();
  });

  it('CH10: asks for the note instead of sending an empty one', async () => {
    const user = userEvent.setup();
    const { sent } = mockApi({});
    renderWithStore(<QuickNoteDrawer open onClose={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'File note' }));
    expect(screen.getByText('Write the note first.')).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('CH11: files an idea note and links the issue', async () => {
    const user = userEvent.setup();
    const { sent } = mockApi({}, filed());
    renderWithStore(<QuickNoteDrawer open onClose={() => undefined} />);
    await user.type(screen.getByLabelText('Note'), 'Bike shops keep paper cards');
    await user.type(screen.getByLabelText('Links'), 'https://a.example');
    await user.click(screen.getByRole('button', { name: 'File note' }));
    expect(
      await screen.findByText('The Scribe turns it into an idea card in about a minute.'),
    ).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      path: '/api/notes',
      body: { kind: 'Idea', note: 'Bike shops keep paper cards', links: 'https://a.example' },
    });
    const link = screen.getByRole('link', { name: 'Issue #21' });
    expect(link).toHaveAttribute('href', URL_21);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('CH11: says evidence goes to the field notes', async () => {
    const user = userEvent.setup();
    const { sent } = mockApi({}, filed());
    renderWithStore(<QuickNoteDrawer open onClose={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'Evidence' }));
    await user.type(screen.getByLabelText('Note'), '“I still use paper”, a shop owner');
    await user.click(screen.getByRole('button', { name: 'File note' }));
    expect(await screen.findByText('Added to the field notes in about a minute.')).toBeVisible();
    expect(sent[0]).toMatchObject({ body: { kind: 'Evidence' } });
  });

  it('CH12: keeps the note on an error, and "Write another" gives an empty form', async () => {
    const user = userEvent.setup();
    const { sent } = mockApi(
      {},
      { '/api/notes': Response.json({ error: 'GitHub refused: nope' }, { status: 502 }) },
    );
    renderWithStore(<QuickNoteDrawer open onClose={() => undefined} />);
    await user.type(screen.getByLabelText('Note'), 'Keep me');
    await user.click(screen.getByRole('button', { name: 'File note' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('GitHub refused: nope');
    expect(screen.getByLabelText('Note')).toHaveValue('Keep me');
    expect(screen.getByRole('button', { name: 'File note' })).toBeEnabled();
    expect(sent).toHaveLength(1);

    mockApi({}, filed());
    await user.click(screen.getByRole('button', { name: 'Evidence' }));
    await user.click(screen.getByRole('button', { name: 'File note' }));
    await screen.findByRole('link', { name: 'Issue #21' });
    await user.click(screen.getByRole('button', { name: 'Write another' }));
    expect(screen.getByLabelText('Note')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Idea' })).toHaveAttribute('aria-pressed', 'true');
  });
});
