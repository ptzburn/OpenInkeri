// captureArtifact for this suite: the reactive diagnostics as they are, with
// a compute-time budget fit for the tests' machine. The engine's 8 ms per
// scope (HOT_SCOPE_TIME) is half a browser frame; jsdom renders a page in
// tens of milliseconds where a browser takes a few, and GitHub's runners
// take twice that again, so a whole form opening tripped it at random. The
// budget here is 100 ms: a scope spending that much in one second is still
// a finding, a big page rendering once is not. The engine keeps the
// strictest budget any holder asks for, so this goes on each capture.
import { captureArtifact as capture } from '@solidjs/diagnostics';

type CaptureOptions = NonNullable<Parameters<typeof capture>[1]>;

export const HOT_TIME = { budgetMs: 100, windowMs: 1000 };

/** As @solidjs/diagnostics' captureArtifact, with HOT_TIME as the compute budget unless the options say otherwise. */
export function captureArtifact<T>(scenario: () => T | Promise<T>, options: CaptureOptions = {}) {
  const attribution = options.attribution ?? true;
  return capture(scenario, {
    ...options,
    attribution:
      attribution === false
        ? false
        : { hotTime: HOT_TIME, ...(typeof attribution === 'object' ? attribution : {}) },
  });
}
