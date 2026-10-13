import { defineRelations } from 'drizzle-orm';

import * as schema from './schema';

// Relations v2: one definition for the whole schema. Generated parts (e.g.
// better-auth's authRelations) are spread after it in ./index.ts.
export const relations = defineRelations(schema, () => ({}));
