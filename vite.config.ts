import { fileURLToPath } from 'node:url';
import { fileRoutes } from 'filesystem-routing/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig, lazyPlugins } from 'vite-plus';
import solid from '@solidjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import solidV2 from 'eslint-plugin-solid/configs/v2';

export default defineConfig({
  // Generated on every dev/build start by the Solid and routing plugins.
  fmt: { singleQuote: true, ignorePatterns: ['solid-env.d.ts', 'file-routes.d.ts'] },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }, 'eslint-plugin-solid'],
    ignorePatterns: ['**/*.gen.*', 'dist'],
    settings: solidV2.settings,
    rules: { ...solidV2.rules, 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
  },
  // Turnkey streaming SSR: no index.html and no entry files — the plugin
  // generates the entries around src/app.tsx, wrapped in src/document.tsx.
  // `vite build` emits client assets to dist/client and the request handler
  // to dist/server, plus the Node server (dist/server/node.js) `npm start` runs.
  plugins: lazyPlugins(() => [
    // Tailwind v4 + DaisyUI: configured from CSS (src/app.css), no JS config file.
    tailwindcss(),
    solid({
      start: {
        middleware: './src/middleware.ts',
        // Only src/app.* is probed in lowercase; the document needs an explicit path.
        document: './src/document.tsx',
        // Emit dist/server/node.js: a ready-to-run Node server (static
        // assets + the handler). Other platforms import dist/server/server.js.
        node: true,
        // Typed env is on by convention: ./env.ts is probed automatically.
        // (Set `env: false` here to opt out.)
      },
      // Set to false for a static shell + API server: pages render on the
      // client while server functions, sessions, and API routes keep working.
      ssr: true,
      // Dev-only: capture control at /__solid/diagnostics (see CLAUDE.md).
      diagnostics: true,
      // The configure module runs in the handler graph before any dispatch —
      // it registers the router's single-flight collector.
      serverFunctions: { configure: './src/server-config.ts' },
      // `extensions` makes @solidjs/vite-plugin also compile the `?pick=` route
      // modules the fileRoutes plugin emits (their ids end in a query string).
      extensions: ['.jsx', '.tsx'],
    }),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    fileRoutes({ httpMethods: true, types: true }),
  ]),
  server: {
    port: 3060,
    host: true,
  },
  test: {
    globals: false,
    setupFiles: ['./vitest-setup.ts'],
    // Two projects because they need different halves of the framework:
    // component tests run in a DOM against the browser build, server-runtime
    // tests (the session suite) run in node against the real server build.
    projects: [
      {
        extends: true,
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
        },
      },
      {
        extends: true,
        test: {
          name: 'server',
          // environment:'node' projects get the server posture from the
          // plugin automatically (server conditions, framework inlined).
          environment: 'node',
          include: ['src/server/**/*.test.ts'],
          alias: [
            // Tests run outside the turnkey server: the plugin's env module
            // is stubbed with the same contract (live process.env reads).
            {
              find: 'virtual:env/server',
              replacement: fileURLToPath(new URL('./vitest-env-server-stub.ts', import.meta.url)),
            },
          ],
        },
      },
    ],
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,
  },
});
