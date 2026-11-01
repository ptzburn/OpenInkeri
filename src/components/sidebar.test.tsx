import { flush } from 'solid-js';
import { captureArtifact } from '@solidjs/diagnostics';
import '@solidjs/diagnostics/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { Router } from '~/router';

import Sidebar from './sidebar';

vi.mock('~/data/session', () => ({
  getCurrentUser: vi.fn(async () => ({
    id: 'u1',
    name: 'Milan',
    email: 'milan@example.com',
    image: null,
    isAdmin: true,
  })),
  signOut: vi.fn(),
}));

vi.mock('~/data/theme', () => ({
  themes: ['light', 'dark'],
  getTheme: vi.fn(async () => 'light'),
  saveTheme: vi.fn(),
}));

function renderAt(url: string, collapsed = false, onToggle = () => {}) {
  window.history.replaceState(null, '', url);
  render(() => <Router>{() => <Sidebar collapsed={collapsed} onToggle={onToggle} />}</Router>);
}

const link = (name: string) => screen.findByRole('link', { name });

afterEach(cleanup);

describe('<Sidebar />', () => {
  // The capture is a click once the sidebar has rendered: in the app the
  // server renders it with the user already read, so a first mount in
  // jsdom (its spinner flashing while the mocked read resolves) isn't what
  // anyone sees.
  test('following a link causes no diagnostics', async () => {
    renderAt('/');
    const records = await link('Records');
    await waitFor(() => expect(records).not.toHaveAttribute('data-active'));
    const { artifact } = await captureArtifact(
      async () => {
        fireEvent.click(records);
        await waitFor(() => expect(records).toHaveAttribute('data-active'));
        flush();
      },
      { scenario: 'sidebar-navigate' },
    );
    expect(artifact).toHaveNoDiagnostics();
  });

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

  test('the fold button says what it does and tells the app; folded links keep their names as tips', async () => {
    let toggles = 0;
    renderAt('/', false, () => toggles++);
    const fold = screen.getByRole('button', { name: 'Collapse menu' });
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    expect(fold).toHaveAttribute('aria-controls', 'app-nav');
    fireEvent.click(fold);
    expect(toggles).toBe(1);
    cleanup();

    renderAt('/', true);
    expect(screen.getByRole('button', { name: 'Expand menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(await link('Records')).toHaveAttribute('data-tip', 'Records');
    expect(await link('Home')).toHaveClass('sidebar-collapsed:tooltip');
  });
});
