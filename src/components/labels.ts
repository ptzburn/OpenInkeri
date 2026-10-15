// Every fixed option the pages show, in the reader's language: one map per
// option list (src/lib/record-kinds.ts, src/lib/place-kinds.ts, the roles the
// edit form edits). Each map is a Record over the list's type, so an option
// added without its label fails the type check here.
import type { EditedRole } from '~/data/records';
import type { CoordinateStatus, PlaceKind } from '~/lib/place-kinds';
import type { BaptismLocation, RecordKind, RecordStatus, Sex } from '~/lib/record-kinds';
import { m } from '~/paraglide/messages.js';

type Labels<T extends string> = Record<T, () => string>;

export const recordKindLabels: Labels<RecordKind> = {
  baptisms: m.records_kind_baptisms,
  marriages: m.records_kind_marriages,
  deaths: m.records_kind_deaths,
  households: m.records_kind_households,
  taxpayers: m.records_kind_taxpayers,
};

export const recordStatusLabels: Labels<RecordStatus> = {
  ok: m.record_edit_status_ok,
  lost: m.record_edit_status_lost,
  illegible: m.record_edit_status_illegible,
};

export const baptismLocationLabels: Labels<BaptismLocation> = {
  pastorate: m.record_edit_location_pastorate,
  church: m.record_edit_location_church,
  chapel: m.record_edit_location_chapel,
  village: m.record_edit_location_village,
  home: m.record_edit_location_home,
  other: m.record_edit_location_other,
};

export const sexLabels: Labels<Sex> = {
  male: m.record_edit_sex_male,
  female: m.record_edit_sex_female,
};

export const editedRoleLabels: Labels<EditedRole> = {
  child: m.records_col_child,
  father: m.records_col_father,
  mother: m.records_col_mother,
};

export const placeKindLabels: Labels<PlaceKind> = {
  village: m.place_kind_village,
  manor: m.place_kind_manor,
  church: m.place_kind_church,
  town: m.place_kind_town,
  region: m.place_kind_region,
  other: m.place_kind_other,
};

export const coordinateStatusLabels: Labels<CoordinateStatus> = {
  verified: m.place_status_verified,
  approximate: m.place_status_approximate,
  unknown: m.place_status_unknown,
};
