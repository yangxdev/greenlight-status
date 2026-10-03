import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App.tsx';
import { renderWithStore } from './test/render.tsx';
import { makeStatus } from './test/status.ts';

describe('App', () => {
  it('shows the overview and the header identity, and fetches the status once', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(makeStatus()));
    renderWithStore(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText('greenlight-status', { selector: 'header span' })).toBeInTheDocument();
    expect(
      screen.getByText('greenlight pipeline log', { selector: 'header span' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Nothing live yet')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
