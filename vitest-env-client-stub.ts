// Test stub for the plugin's `virtual:env/client` module (aliased in
// vite.config.ts's test block). The plugin validates the whole schema before
// serving either env module, so component tests would need the server
// secrets (absent in CI). This validates only the client half, from the same
// schema and the same VITE_ variables.
import * as v from 'valibot';

import schema from './env';

export const env = v.parse(v.object(schema.client), {
  VITE_APP_NAME: import.meta.env.VITE_APP_NAME,
});
export default env;
