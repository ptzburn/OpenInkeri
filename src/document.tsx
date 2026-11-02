import type { ParentProps } from 'solid-js';
import { HydrationScript } from '@solidjs/web';
import { env } from 'virtual:solid-env/client';

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
        {/* The mark (src/components/logo.tsx): SVG where browsers take it,
            the .ico (16, 32, 48 px) elsewhere, and a full-bleed square for
            iOS home screens, which round it themselves. */}
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <title>{env.VITE_APP_NAME}</title>
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
