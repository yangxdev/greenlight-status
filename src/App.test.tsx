import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App.tsx';
import { renderWithStore } from './test/render.tsx';
import { makeStatus } from './test/status.ts';

describe('App', () => {
  it('AC28: the nav switches screens without a reload and the header shows the identity', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(makeStatus()));
    window.history.pushState({}, '', '/');
    renderWithStore(<App />);

    expect(screen.getByText('greenlight-status', { selector: 'header span' })).toBeInTheDocument();
    expect(
      screen.getByText('greenlight pipeline log', { selector: 'header span' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'What the pipeline did, in public.',
    );
    expect(await screen.findByText('Nothing live yet')).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'Main' });
    await userEvent.click(nav.querySelector('a[href="/ideas"]') as HTMLElement);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Every idea, scored.');
    expect(window.location.pathname).toBe('/ideas');
    expect(await screen.findByText('The watchlist is empty')).toBeInTheDocument();

    await userEvent.click(nav.querySelector('a[href="/"]') as HTMLElement);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'What the pipeline did, in public.',
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
