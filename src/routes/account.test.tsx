import { flush } from 'solid-js';
import { captureArtifact } from '~/testing/capture';
import { query } from '@solidjs/router';
import '@solidjs/diagnostics/vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import type { AccountData } from '~/data/account';
import { renderAt } from '~/testing/render';

// The account page through the real router, with the server functions
// replaced by router queries and actions over this in-memory account, so an
// action revalidates getAccount the way it does in the app.
const store = vi.hoisted(() => ({ account: undefined as unknown as AccountData }));

vi.mock('~/data/session', async () => {
  const { action, query } = await import('@solidjs/router');
  return {
    getCurrentUser: query(async () => null, 'current-user'),
    signInAgain: action(async () => {}, 'sign-in-again'),
  };
});
vi.mock('~/data/account', async () => {
  const { action, query } = await import('@solidjs/router');
  const done = async () => {};
  return {
    getAccount: query(async () => structuredClone(store.account), 'account'),
    revokeSession: action(async (id: string, _form: FormData) => {
      store.account.sessions = store.account.sessions!.filter((session) => session.id !== id);
    }, 'revoke-session'),
    renameMe: action(done, 'rename-me'),
    revokeOtherSessions: action(done, 'revoke-other-sessions'),
    deleteAccount: action(done, 'delete-account'),
  };
});

const session = (id: string, userAgent: string, isCurrent = false) => ({
  id,
  createdAt: new Date('2026-10-11T12:00:00Z'),
  ipAddress: '10.0.0.1',
  userAgent,
  isCurrent,
});

beforeEach(() => {
  store.account = {
    user: {
      name: 'Maija',
      email: 'maija@example.com',
      image: null,
      createdAt: new Date('2026-10-01T12:00:00Z'),
      isAdmin: false,
    },
    providers: ['github'],
    sessions: [
      session('s1', 'Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/130.0', true),
      session('s2', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1'),
    ],
  };
});

// globals: false, so testing-library can't unmount between tests itself.
// The query cache outlives a render; each test starts from its own account.
afterEach(() => {
  cleanup();
  query.clear();
});

const renderAccount = () => renderAt('/account');

const devices = () => screen.getByRole('region', { name: 'Signed-in devices' });

describe('/account', () => {
  test('lists the devices, and signs another one out', async () => {
    renderAccount();
    expect(await screen.findByText('Firefox, Linux')).toBeInTheDocument();
    expect(within(devices()).getByText('This device')).toBeInTheDocument();

    const { artifact } = await captureArtifact(
      async () => {
        fireEvent.click(within(devices()).getByRole('button', { name: 'Sign out' }));
        await waitFor(() => expect(screen.queryByText('Safari, iOS')).not.toBeInTheDocument());
        flush();
      },
      { scenario: 'account-revoke-session' },
    );
    expect(artifact).toHaveNoDiagnostics();
    // This device stays, and with one device left there is nothing to sign
    // out elsewhere.
    expect(screen.getByText('Firefox, Linux')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign out all other devices' }),
    ).not.toBeInTheDocument();
  });

  test('asks to sign in again when the session is too old to list devices', async () => {
    store.account.sessions = null;
    renderAccount();
    expect(await screen.findByText(/Sign in again to see your devices/)).toBeInTheDocument();
    expect(within(devices()).getByRole('button', { name: 'Sign in again' })).toBeInTheDocument();
    expect(within(devices()).queryByRole('list')).not.toBeInTheDocument();
  });

  test('names the provider to sign in again with when the account has several', async () => {
    store.account.sessions = null;
    store.account.providers = ['google', 'github'];
    renderAccount();
    expect(await screen.findByText(/Sign in again to see your devices/)).toBeInTheDocument();
    expect(
      within(devices()).getByRole('button', { name: 'Sign in again with Google' }),
    ).toBeInTheDocument();
    expect(
      within(devices()).getByRole('button', { name: 'Sign in again with GitHub' }),
    ).toBeInTheDocument();
  });
});
