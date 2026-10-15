import { cleanup, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { Router } from '~/router';

import Sidebar from './sidebar';

vi.mock('~/lib/account', () => ({
  getCurrentUser: vi.fn(async () => ({
    id: 'u1',
    name: 'Milan',
    email: 'milan@example.com',
    image: null,
    isAdmin: true,
  })),
  signOut: vi.fn(),
}));

vi.mock('~/lib/theme', () => ({
  themes: ['light', 'dark'],
  getTheme: vi.fn(async () => 'light'),
  saveTheme: vi.fn(),
}));

function renderAt(url: string) {
  window.history.replaceState(null, '', url);
  render(() => <Router>{() => <Sidebar />}</Router>);
}

const link = (name: string) => screen.findByRole('link', { name });

afterEach(cleanup);

describe('<Sidebar />', () => {
  test('Places stays active on both tabs and the edit pages', async () => {
    for (const url of ['/places/villages', '/places/parishes', '/places/villages/1/edit']) {
      renderAt(url);
      const places = await link('Places');
      expect(places).toHaveAttribute('href', '/places/villages');
      await waitFor(() => expect(places).toHaveClass('menu-active'));
      cleanup();
    }
    renderAt('/records');
    expect(await link('Places')).not.toHaveClass('menu-active');
  });

  test('Users stays active on a user page, and Home does not', async () => {
    renderAt('/users/u1');
    await waitFor(async () => expect(await link('Users')).toHaveAttribute('data-active'));
    expect(await link('Home')).not.toHaveAttribute('data-active');
  });

  test('Home is active on the home page only', async () => {
    renderAt('/');
    await waitFor(async () => expect(await link('Home')).toHaveAttribute('data-active'));
    expect(await link('Users')).not.toHaveAttribute('data-active');
  });
});
