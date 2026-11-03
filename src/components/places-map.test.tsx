import { describe, expect, test } from 'vite-plus/test';

import type { PlaceMarker } from '~/data/places';
import { parishMarkers } from './places-map';

// Two parishes' localities: Губаницы's church is Горки; Кобрино has none set.
const at = (id: number, parishId: number | null, latitude: number, longitude: number) =>
  ({
    id,
    name: { ru: `Пункт ${id}`, fi: null },
    latitude,
    longitude,
    parishId,
    parish: null,
    church: null,
  }) satisfies PlaceMarker;
const located: PlaceMarker[] = [
  { ...at(1, 5, 59.5, 29.5), church: { id: 5, name: { ru: 'Губаницы', fi: 'Hevaa' } } },
  at(2, 5, 59.6, 29.6),
  at(3, 7, 59.0, 30.0),
  at(4, 7, 59.2, 30.4),
  at(5, 7, 59.4, 30.2),
];
const parishes = [
  { id: 5, nameRu: 'Губаницы', nameFi: 'Hevaa' },
  { id: 7, nameRu: 'Кобрино', nameFi: 'Koprina' },
  { id: 9, nameRu: 'Курляндия', nameFi: null },
];

describe('parishMarkers', () => {
  test('puts a parish at its church, else amid its localities, else nowhere', () => {
    const [gubanitsy, kobrino, ...rest] = parishMarkers(located, parishes);
    // At its church: the church locality itself.
    expect(gubanitsy).toBe(located[0]);
    // Amid its localities (the median of each coordinate), named for the
    // parish and drawn as its church, keyed apart from the localities.
    expect(kobrino).toEqual({
      id: -7,
      name: { ru: 'Кобрино', fi: 'Koprina' },
      latitude: 59.2,
      longitude: 30.2,
      parishId: 7,
      parish: { ru: 'Кобрино', fi: 'Koprina' },
      church: { id: 7, name: { ru: 'Кобрино', fi: 'Koprina' } },
      estimated: true,
    });
    // Nothing located: not on the map.
    expect(rest).toEqual([]);
  });

  test('two localities put their parish halfway between them, not on one', () => {
    const [kobrino] = parishMarkers(located.slice(2, 4), [parishes[1]]);
    expect(kobrino.latitude).toBeCloseTo(59.1);
    expect(kobrino.longitude).toBeCloseTo(30.2);
  });
});
