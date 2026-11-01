import { Show, createMemo } from 'solid-js';

import type { QueryData } from '~/lib/query-data';
import { FIELD_MAX } from '~/lib/field-limits';
import {
  DeleteSection,
  FormActions,
  Select,
  TextArea,
  TextInput,
  useFormDone,
  useFormErrors,
} from '~/components/form-fields';
import { sexLabels } from '~/components/labels';
import { useToast } from '~/components/toaster';
import { deletePerson, getPersonEdit, savePerson } from '~/data/people';
import { PARTIAL_DATE_PATTERN, formatPartialDate, localName, namesOf } from '~/lib/format';
import { sexes } from '~/lib/record-kinds';
import { m } from '~/paraglide/messages.js';

/**
 * The admin's form for one person: their names, sex, birth and death dates
 * and a note, the summary their page shows above the mentions. It posts to
 * the savePerson action (and works before JavaScript loads); a save
 * redirects to the person's page with a toast, and Cancel goes to
 * `cancelHref`. A save the server refuses keeps the form as typed, says why
 * and marks the fields at fault. Below it, the Delete section: the person's
 * mentions stay in their records, unlinked.
 */
export default function PersonEditForm(props: { id: number; cancelHref: string }) {
  const person = createMemo(
    (): Promise<QueryData<typeof getPersonEdit>> => getPersonEdit(props.id),
    { name: 'person-edit' },
  );
  const isThisForm = (form: FormData) => form.get('id') === String(props.id);
  // This form's refused saves (the latest shown, its fields marked).
  const { error, invalid } = useFormErrors(savePerson, isThisForm);
  const toast = useToast();
  useFormDone(savePerson, isThisForm, (form) => {
    const posted = (field: string) => {
      const value = form.get(field);
      return (typeof value === 'string' && value.trim()) || null;
    };
    toast(m.person_saved({ name: localName({ ru: posted('nameRu'), fi: posted('nameFi') }) }));
  });

  return (
    // Keyed: each fresh read of the person gets a fresh form.
    <Show when={person()} keyed fallback={<p>{m.person_missing()}</p>}>
      {(p) => (
        <>
          {/* While a save is in flight the router marks the form aria-busy. */}
          <form method="post" action={savePerson} class="group flex max-w-3xl flex-col gap-6">
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="version" value={p.version} />

            <div class="grid gap-x-4 sm:grid-cols-2">
              <TextInput
                name="nameRu"
                label={m.form_name_ru()}
                value={p.nameRu}
                maxlength={FIELD_MAX.line}
                invalid={invalid('nameRu')}
              />
              <TextInput
                name="nameFi"
                label={m.form_name_fi()}
                value={p.nameFi}
                maxlength={FIELD_MAX.line}
                invalid={invalid('nameFi')}
              />
              <Select
                name="sex"
                label={m.record_edit_sex()}
                value={p.sex}
                none={m.form_none()}
                options={sexes.map((s) => ({ value: s, label: sexLabels[s]() }))}
                invalid={invalid('sex')}
              />
              <span />
              <TextInput
                name="birthDate"
                label={m.records_col_born()}
                value={formatPartialDate(p.birthDate)}
                pattern={PARTIAL_DATE_PATTERN}
                inputmode="numeric"
                maxlength={FIELD_MAX.line}
                hint={m.record_edit_date_hint()}
                invalid={invalid('birthDate')}
              />
              <TextInput
                name="deathDate"
                label={m.records_col_died()}
                value={formatPartialDate(p.deathDate)}
                pattern={PARTIAL_DATE_PATTERN}
                inputmode="numeric"
                maxlength={FIELD_MAX.line}
                hint={m.record_edit_date_hint()}
                invalid={invalid('deathDate')}
              />
              <TextArea
                name="note"
                label={m.form_note()}
                value={p.note}
                rows={4}
                maxlength={FIELD_MAX.text}
                invalid={invalid('note')}
                class="sm:col-span-2"
              />
            </div>

            <FormActions
              error={error()}
              cancelHref={props.cancelHref}
              class="border-t border-base-300 pt-4"
            />
          </form>
          <DeleteSection
            action={deletePerson}
            id={p.id}
            version={p.version}
            title={m.person_delete()}
            text={m.person_delete_text({ count: p.mentions })}
            inUse={undefined}
            deleted={m.person_deleted({ name: localName(namesOf(p)) })}
          />
        </>
      )}
    </Show>
  );
}
