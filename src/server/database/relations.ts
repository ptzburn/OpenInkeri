import { defineRelations } from 'drizzle-orm';

import { authRelations } from './auth-schema';
import * as schema from './schema';

// Relations v2: one definition for the whole schema, with generated parts
// (better-auth's authRelations) spread after it.
export const relations = {
  ...defineRelations(schema, (r) => ({
    parish: {
      places: r.many.place({ from: r.parish.id, to: r.place.parishId }),
      sources: r.many.source({ from: r.parish.id, to: r.source.parishId }),
    },
    place: {
      parish: r.one.parish({ from: r.place.parishId, to: r.parish.id }),
      aliases: r.many.placeAlias({ from: r.place.id, to: r.placeAlias.placeId }),
      records: r.many.record({ from: r.place.id, to: r.record.placeId }),
    },
    placeAlias: {
      place: r.one.place({ from: r.placeAlias.placeId, to: r.place.id, optional: false }),
    },
    source: {
      parish: r.one.parish({ from: r.source.parishId, to: r.parish.id }),
      sections: r.many.sourceSection({ from: r.source.id, to: r.sourceSection.sourceId }),
      records: r.many.record({ from: r.source.id, to: r.record.sourceId }),
    },
    sourceSection: {
      source: r.one.source({ from: r.sourceSection.sourceId, to: r.source.id, optional: false }),
      records: r.many.record({ from: r.sourceSection.id, to: r.record.sectionId }),
    },
    record: {
      source: r.one.source({ from: r.record.sourceId, to: r.source.id, optional: false }),
      section: r.one.sourceSection({ from: r.record.sectionId, to: r.sourceSection.id }),
      place: r.one.place({ from: r.record.placeId, to: r.place.id }),
      baptism: r.one.recordBaptism({ from: r.record.id, to: r.recordBaptism.recordId }),
      death: r.one.recordDeath({ from: r.record.id, to: r.recordDeath.recordId }),
      holding: r.one.recordHolding({ from: r.record.id, to: r.recordHolding.recordId }),
      personas: r.many.persona({ from: r.record.id, to: r.persona.recordId }),
    },
    recordBaptism: {
      record: r.one.record({ from: r.recordBaptism.recordId, to: r.record.id, optional: false }),
      officiant: r.one.clergy({ from: r.recordBaptism.officiantId, to: r.clergy.id }),
      locationPlace: r.one.place({ from: r.recordBaptism.locationPlaceId, to: r.place.id }),
    },
    recordDeath: {
      record: r.one.record({ from: r.recordDeath.recordId, to: r.record.id, optional: false }),
      cause: r.one.term({ from: r.recordDeath.causeTermId, to: r.term.id }),
    },
    recordHolding: {
      record: r.one.record({ from: r.recordHolding.recordId, to: r.record.id, optional: false }),
      estate: r.one.place({ from: r.recordHolding.estatePlaceId, to: r.place.id }),
    },
    persona: {
      record: r.one.record({ from: r.persona.recordId, to: r.record.id, optional: false }),
      person: r.one.person({ from: r.persona.personId, to: r.person.id }),
      birthplace: r.one.place({ from: r.persona.birthplaceId, to: r.place.id }),
      relation: r.one.term({
        from: r.persona.relationTermId,
        to: r.term.id,
        alias: 'persona_relation',
      }),
      rank: r.one.term({ from: r.persona.rankTermId, to: r.term.id, alias: 'persona_rank' }),
      civilStatus: r.one.term({
        from: r.persona.civilStatusTermId,
        to: r.term.id,
        alias: 'persona_civil_status',
      }),
    },
    person: {
      personas: r.many.persona({ from: r.person.id, to: r.persona.personId }),
    },
  })),
  ...authRelations,
};
