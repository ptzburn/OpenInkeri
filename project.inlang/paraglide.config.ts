// Paraglide's compiler options, read by both paraglideVitePlugin
// (vite.config.ts) and the `paraglide-js compile` CLI (`pnpm check` runs it
// first, since src/paraglide is generated and git-ignored).
import { defineConfig } from '@inlang/paraglide-js';

export default defineConfig({
  outdir: './src/paraglide',
  // No URL prefixes: the locale comes from the PARAGLIDE_LOCALE cookie
  // (written by setLocale), then Accept-Language, then the base locale.
  // Only strategies the server can read on the first request, so SSR and
  // hydration agree.
  strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
  emitTsDeclarations: true,
});
