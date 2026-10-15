import type { CoordinateStatus, PlaceKind } from '~/lib/place-kinds';
import { m } from '~/paraglide/messages.js';

// The place options as the villages pages name them.
export const kindLabels: Record<PlaceKind, () => string> = {
  village: m.place_kind_village,
  manor: m.place_kind_manor,
  church: m.place_kind_church,
  town: m.place_kind_town,
  region: m.place_kind_region,
  other: m.place_kind_other,
};

export const statusLabels: Record<CoordinateStatus, () => string> = {
  verified: m.place_status_verified,
  approximate: m.place_status_approximate,
  unknown: m.place_status_unknown,
};
