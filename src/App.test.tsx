import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App.tsx';
import { renderWithStore } from './test/render.tsx';
import { makeStatus, mockApi, VISITOR } from './test/status.ts';

afterEach(() => window.history.pushState({}, '', '/'));

describe('App', () => {
  it('opens on the board, switches screens without a reload, and reads the board once', async () => {
    const { spy } = mockApi({ '/api/status': makeStatus(), '/api/me': VISITOR });
    window.history.pushState({}, '', '/');
    renderWithStore(<App />);

    const header = screen.getByRole('banner');
    expect(within(header).getByText('greenlight-status')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: 'Pipeline' })).toBeInTheDocument();
    expect(screen.getByText('No ideas yet')).toBeInTheDocument();

    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0] as HTMLElement;
    await userEvent.click(within(nav).getByRole('link', { name: 'ideas' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Ideas' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/ideas');

    await userEvent.click(within(nav).getByRole('link', { name: 'pipeline' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Pipeline' })).toBeInTheDocument();
    expect(spy.mock.calls.filter(([url]) => url === '/api/status')).toHaveLength(1);
  });

  it('offers sign-in when the dashboard has it, returning to the current screen', async () => {
    mockApi({ '/api/status': makeStatus(), '/api/me': VISITOR });
    window.history.pushState({}, '', '/ideas');
    renderWithStore(<App />);
    const signIn = await screen.findByRole('link', { name: 'Sign in' });
    expect(signIn).toHaveAttribute('href', '/api/auth/login?return=%2Fideas');
  });

  it('shows no sign-in when the dashboard has none', async () => {
    mockApi({
      '/api/status': makeStatus(),
      '/api/me': { signInAvailable: false, login: null, owner: false },
    });
    renderWithStore(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Pipeline' });
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });
});
