import type { ParentProps } from 'solid-js';
import { HydrationScript } from '@solidjs/web';
import { env } from 'virtual:env/client';

import { getLocale } from './paraglide/runtime.js';

// The document shell (the index.html replacement), wired up via the
// `start.document` option in vite.config.ts; it must render the full <html>
// and ships no client JS. <HydrationScript /> is stripped from the
// prerendered shell in client mode and activates under `ssr: true`. Remove
// the option and this file to fall back to the plugin's built-in shell.
export default function Document(props: ParentProps) {
  return (
    <html lang={getLocale()}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <title>{env.VITE_APP_NAME}</title>
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
