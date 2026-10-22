import { Loading } from 'solid-js';
import { captureArtifact } from '@solidjs/diagnostics';
import { query } from '@solidjs/router';
import '@solidjs/diagnostics/vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import type { AuthProvider } from '~/lib/auth-providers';
import { Router } from '~/router';

// The sign-in page through the real router, with the server functions
// replaced by a router query over the offered providers.
const store = vi.hoisted(() => ({ providers: [] as AuthProvider[] }));

vi.mock('~/data/session', async () => {
  const { action, query } = await import('@solidjs/router');
  return {
    getCurrentUser: query(async () => null, 'current-user'),
    getSignInProviders: query(async () => store.providers, 'sign-in-providers'),
    signIn: action(async (_provider: AuthProvider, _form: FormData) => {}, 'sign-in'),
  };
});

// globals: false, so testing-library can't unmount between tests itself.
afterEach(() => {
  cleanup();
  query.clear();
});

function renderSignIn(search = '') {
  window.history.replaceState(null, '', `/sign-in${search}`);
  return render(() => (
    <Router>{(props) => <Loading fallback="Loading">{props.children}</Loading>}</Router>
  ));
}

describe('/sign-in', () => {
  test('offers a button for each configured provider, in order', async () => {
    store.providers = ['google', 'vk', 'github'];
    const { artifact } = await captureArtifact(
      async () => {
        renderSignIn();
        await screen.findByRole('button', { name: 'Continue with Google' });
      },
      { scenario: 'sign-in-providers' },
    );
    expect(artifact).toHaveNoDiagnostics();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Continue with Google',
      'Continue with VK',
      'Continue with GitHub',
    ]);
  });

  test('leaves out providers without credentials', async () => {
    store.providers = ['github'];
    renderSignIn();
    expect(await screen.findByRole('button', { name: 'Continue with GitHub' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
  });

  test('explains an email taken by another sign-in method', async () => {
    store.providers = ['vk', 'github'];
    renderSignIn('?error=account_not_linked');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An account with this email address already exists',
    );
  });

  test('says when the provider shared no email address', async () => {
    store.providers = ['vk', 'github'];
    renderSignIn('?error=unable_to_get_user_info');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The service did not share your email address',
    );
  });

  test('tells a banned user so', async () => {
    store.providers = ['github'];
    renderSignIn('?error=BANNED_USER');
    expect(await screen.findByRole('alert')).toHaveTextContent('This account is banned.');
  });

  test('falls back to a general message for other codes', async () => {
    store.providers = ['github'];
    renderSignIn('?error=invalid_code');
    expect(await screen.findByRole('alert')).toHaveTextContent('Signing in did not complete.');
  });
});
