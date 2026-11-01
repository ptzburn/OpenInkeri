import { Loading, flush } from 'solid-js';
import { captureArtifact } from '~/testing/capture';
import '@solidjs/diagnostics/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { Router } from '~/router';

// The users pages through the real router, with the server functions
// replaced: getUsers answers from this list, filtered the way the server's
// @ rule does, with fresh objects each time like the real server. A test can
// hold its answers back by setting `gate.wait`.
const { getUsers, gate } = vi.hoisted(() => {
  const gate: { wait?: Promise<void> } = {};
  const people = [
    { id: 'u1', name: 'Milan', email: 'milan@example.com', isAdmin: true },
    { id: 'u2', name: 'Maija', email: 'maija@example.com', isAdmin: false },
  ].map((user) => ({ ...user, image: null, banned: false, createdAt: new Date(0) }));
  const getUsers = vi.fn(async (search: string) => {
    await gate.wait;
    const field = search.includes('@') ? 'email' : 'name';
    const users = people
      .filter((user) => user[field].toLowerCase().includes(search.toLowerCase()))
      .map((user) => ({ ...user }));
    return { users, total: users.length };
  });
  return { getUsers, gate };
});

vi.mock('~/data/users', () => ({ getUsers, getUser: vi.fn() }));
vi.mock('~/data/session', () => ({ getCurrentUser: vi.fn(async () => null) }));

function renderAt(url: string) {
  window.history.replaceState(null, '', url);
  return render(() => (
    <Router>{(props) => <Loading fallback="Loading">{props.children}</Loading>}</Router>
  ));
}

const rowNames = (container: HTMLElement) =>
  [...container.querySelectorAll('nav .list-row .font-medium')].map((el) => el.textContent);

// globals: false, so testing-library can't unmount between tests itself.
afterEach(() => {
  cleanup();
  getUsers.mockReset(); // also back to the answers above
  delete gate.wait;
});

describe('/users', () => {
  test('lists every user, then filters them by name as you type', async () => {
    // Mounted outside the capture: the first render is the server's in the
    // app, while here the route module loads behind the spinner first.
    const { container } = renderAt('/users');
    await waitFor(() => expect(rowNames(container)).toEqual(['Milan', 'Maija']));
    const milanRow = container.querySelector('nav .list-row');
    const input = screen.getByRole('searchbox', { name: 'Search users' });

    const { artifact } = await captureArtifact(
      async () => {
        fireEvent.input(input, { target: { value: 'mil' } });
        await waitFor(() => expect(rowNames(container)).toEqual(['Milan']));
        flush();
      },
      { scenario: 'users-search' },
    );
    expect(artifact).toHaveNoDiagnostics();

    // Searched once, after the pause, with the URL and the box in step.
    expect(getUsers).toHaveBeenLastCalledWith('mil');
    expect(getUsers.mock.calls.filter(([search]) => search === 'mil')).toHaveLength(1);
    expect(window.location.search).toBe('?q=mil');
    expect(input).toHaveValue('mil');
    // Keyed by id: Milan's row survived the new search's new objects.
    expect(container.querySelector('nav .list-row')).toBe(milanRow);
  });

  test('typing on while a search loads keeps every character', async () => {
    const { container } = renderAt('/users');
    await waitFor(() => expect(rowNames(container)).toHaveLength(2));
    const input = screen.getByRole('searchbox');
    input.focus();

    // "mi" goes out and its answer is held back...
    let answer!: () => void;
    gate.wait = new Promise((resolve) => (answer = resolve));
    fireEvent.input(input, { target: { value: 'mi' } });
    await waitFor(() => expect(getUsers).toHaveBeenLastCalledWith('mi'));
    // ...while the user types on; then it arrives.
    fireEvent.input(input, { target: { value: 'mil' } });
    answer();
    await waitFor(() => expect(window.location.search).toBe('?q=mi'));
    flush();
    expect(input).toHaveValue('mil');
    await waitFor(() => expect(window.location.search).toBe('?q=mil'));
  });

  test('a search with an @ looks at emails', async () => {
    const { container } = renderAt('/users');
    await waitFor(() => expect(rowNames(container)).toHaveLength(2));
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'maija@' } });
    await waitFor(() => expect(rowNames(container)).toEqual(['Maija']));
  });

  test('starts from ?q and says when nothing matches', async () => {
    renderAt('/users?q=zzz');
    expect(await screen.findByText('No users match “zzz”.')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('zzz');
  });

  test('renders without a list when the read redirects (the server side of a signed-out visit)', async () => {
    // On the server, getUsers' redirect resolves the read to undefined.
    getUsers.mockImplementation(async () => undefined as never);
    const { container } = renderAt('/users');
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(rowNames(container)).toEqual([]);
  });

  test('leaving before the pause ends cancels the search', async () => {
    const { container, unmount } = renderAt('/users');
    await waitFor(() => expect(rowNames(container)).toHaveLength(2));
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'mil' } });
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(window.location.search).toBe('');
  });
});
