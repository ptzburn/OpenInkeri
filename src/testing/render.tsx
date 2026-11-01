// The route tests' page: the app's router at a URL, with its server
// functions mocked by the test, under a Loading boundary like the app's
// and, for the pages with forms, the toaster their saves report to.
import { Loading } from 'solid-js';
import { render } from '@solidjs/testing-library';

import { ToastProvider } from '~/components/toaster';
import { Router } from '~/router';

/** Renders the app's router at `url`; `toasts` adds the ToastProvider the edit forms need. */
export function renderAt(url: string, options: { toasts?: boolean } = {}) {
  window.history.replaceState(null, '', url);
  return render(() => (
    <Router>
      {(props) =>
        options.toasts ? (
          <ToastProvider>
            <Loading fallback="Loading">{props.children}</Loading>
          </ToastProvider>
        ) : (
          <Loading fallback="Loading">{props.children}</Loading>
        )
      }
    </Router>
  ));
}
