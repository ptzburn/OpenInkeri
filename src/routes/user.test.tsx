import { Loading, flush } from 'solid-js';
import { captureArtifact } from '~/testing/capture';
import { query } from '@solidjs/router';
import '@solidjs/diagnostics/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { Router } from '~/router';

// One user's page through the real router, with the server functions
// replaced by router queries and actions over this in-memory user, so an
// action revalidates getUser the way it does in the app.
interface ShownUser {
  id: string;
  name: string;
  email: string;
  image: null;
  banned: boolean;
  banReason: string | null;
  createdAt: Date;
  isAdmin: boolean;
  isMe: boolean;
}
const store = vi.hoisted(() => ({
  user: undefined as unknown as ShownUser,
  failNext: false,
  signedOut: [] as string[],
}));

vi.mock('~/data/session', async () => {
  const { query } = await import('@solidjs/router');
  return { getCurrentUser: query(async () => null, 'current-user') };
});
vi.mock('~/data/users', async () => {
  const { action, query } = await import('@solidjs/router');
  // Each action edits the stored user, or fails once when asked to.
  const change = (name: string, edit: (form: FormData) => void) =>
    action(async (id: string, form: FormData) => {
      if (store.failNext) {
        store.failNext = false;
        throw new Error('That did not work. Try again.');
      }
      expect(id).toBe(store.user.id);
      edit(form);
      return true;
    }, name);
  return {
    getUsers: query(async () => ({ users: [], total: 0 }), 'users'),
    getUser: query(async (id: string) => (id === store.user.id ? { ...store.user } : null), 'user'),
    makeAdmin: change('make-admin', () => (store.user.isAdmin = true)),
    removeAdmin: change('remove-admin', () => (store.user.isAdmin = false)),
    banUser: change('ban-user', (form) => {
      store.user.banned = true;
      store.user.banReason = (form.get('reason') as string | null) || null;
    }),
    unbanUser: change('unban-user', () => {
      store.user.banned = false;
      store.user.banReason = null;
    }),
    signOutUser: change('sign-out-user', () => store.signedOut.push(store.user.id)),
  };
});

beforeEach(() => {
  store.user = {
    id: 'u2',
    name: 'Maija',
    email: 'maija@example.com',
    image: null,
    banned: false,
    banReason: null,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    isAdmin: false,
    isMe: false,
  };
  store.failNext = false;
  store.signedOut = [];
});

// globals: false, so testing-library can't unmount between tests itself.
afterEach(() => {
  cleanup();
  query.clear();
});

function renderUser() {
  window.history.replaceState(null, '', '/users/u2');
  return render(() => (
    <Router>{(props) => <Loading fallback="Loading">{props.children}</Loading>}</Router>
  ));
}

describe('/users/:id administration', () => {
  test('makes a user an admin, then takes it back', async () => {
    renderUser();
    const make = await screen.findByRole('button', { name: 'Make admin' });
    const { artifact } = await captureArtifact(
      async () => {
        fireEvent.click(make);
        await screen.findByRole('button', { name: 'Remove admin rights' });
        flush();
      },
      { scenario: 'user-make-admin' },
    );
    expect(artifact).toHaveNoDiagnostics();
    expect(screen.getByText('Admin')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove admin rights' }));
    expect(await screen.findByRole('button', { name: 'Make admin' })).toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  test('bans with a reason, then unbans', async () => {
    renderUser();
    fireEvent.input(await screen.findByRole('textbox', { name: 'Reason (optional)' }), {
      target: { value: 'Spam' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ban' }));
    expect(await screen.findByText('This user is banned: Spam')).toBeInTheDocument();
    expect(screen.getByText('Banned')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Unban' }));
    expect(await screen.findByRole('button', { name: 'Ban' })).toBeInTheDocument();
    expect(screen.queryByText('Banned')).not.toBeInTheDocument();
  });

  test('signs a user out on all devices and says so', async () => {
    renderUser();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out on all devices' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Signed out on all devices.');
    expect(store.signedOut).toEqual(['u2']);
  });

  test('shows why an action failed', async () => {
    store.failNext = true;
    renderUser();
    fireEvent.click(await screen.findByRole('button', { name: 'Make admin' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Make admin' })).toBeInTheDocument();
  });

  test('offers none of it on your own page', async () => {
    store.user.isMe = true;
    store.user.isAdmin = true;
    renderUser();
    expect(await screen.findByText('You')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Administration' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove admin rights' })).not.toBeInTheDocument();
  });
});
