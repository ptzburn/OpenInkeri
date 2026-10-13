import { defineRelations } from 'drizzle-orm';

import { authRelations } from './auth-schema';
import * as schema from './schema';

// Relations v2: one definition for the whole schema, with generated parts
// (better-auth's authRelations) spread after it.
export const relations = {
  ...defineRelations(schema, () => ({})),
  ...authRelations,
};
