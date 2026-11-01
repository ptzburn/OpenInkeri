import { flush } from 'solid-js';
import { captureArtifact } from '~/testing/capture';
import '@solidjs/diagnostics/vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { ToastProvider, useToast } from './toaster';

function Trigger() {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast('Parish Hevaa deleted.')}>
      Delete
    </button>
  );
}

function renderToaster() {
  render(() => (
    <ToastProvider>
      <Trigger />
    </ToastProvider>
  ));
  return screen.getByRole('status');
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('toaster', () => {
  test('shows a toast until it is closed', async () => {
    const region = renderToaster();
    expect(region).toBeEmptyDOMElement();

    const { artifact } = await captureArtifact(
      async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        flush();
        expect(region).toHaveTextContent('Parish Hevaa deleted.');
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        flush();
      },
      { scenario: 'toast-close' },
    );
    expect(region).toBeEmptyDOMElement();
    expect(artifact).toHaveNoDiagnostics();
  });

  test('closes itself after five seconds', () => {
    vi.useFakeTimers();
    const region = renderToaster();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    flush();

    vi.advanceTimersByTime(4900);
    flush();
    expect(region).toHaveTextContent('Parish Hevaa deleted.');
    vi.advanceTimersByTime(100);
    flush();
    expect(region).toBeEmptyDOMElement();
  });
});
