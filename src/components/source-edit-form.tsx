import { For, Show, createMemo } from 'solid-js';

import type { QueryData } from '~/lib/query-data';
import { FIELD_MAX } from '~/lib/field-limits';
import { localName } from '~/lib/format';
import {
  DeleteSection,
  FieldError,
  FormActions,
  Select,
  TextArea,
  TextInput,
  ariaInvalid,
  useFormDone,
  useFormErrors,
} from '~/components/form-fields';
import { recordKindLabels, sourceLanguageLabels } from '~/components/labels';
import { type Lookup, LookupField, lookupOf } from '~/components/lookup-field';
import { NewParishFields } from '~/components/new-row-fields';
import { useToast } from '~/components/toaster';
import { getParishOptions } from '~/data/parishes';
import { type SourceEditData, deleteSource, getSourceEdit, saveSource } from '~/data/sources';
import { recordKinds, sourceLanguages } from '~/lib/record-kinds';
import { m } from '~/paraglide/messages.js';

// What a new source's form starts from: a baptism register in Russian.
const blank: SourceEditData = {
  id: 0,
  version: 0,
  title: '',
  kind: 'baptisms',
  parishId: null,
  archiveReference: null,
  yearFrom: null,
  yearTo: null,
  language: 'ru',
  note: null,
  records: 0,
};

/**
 * The admin's form for one source, or for a new one without `id`: its
 * title, type, parish, archive reference, years and language, and a note.
 * The parish is typed by name and linked to the one it names; one not known
 * yet can be added in its field (LookupField), with a locality of its name
 * as its church. It posts to the saveSource action (and works before
 * JavaScript loads); a save redirects to the sources list with a toast, and
 * Save and add records (a new source) to the form of its first record.
 * Cancel goes to `cancelHref`. A save the server refuses keeps the form as
 * typed, says why and marks the fields at fault. While records belong to the
 * source its type is fixed and it can't be deleted.
 */
export default function SourceEditForm(props: { id?: number; cancelHref: string }) {
  const source = createMemo(
    (): Promise<QueryData<typeof getSourceEdit>> | SourceEditData =>
      props.id ? getSourceEdit(props.id) : blank,
    { name: 'source-edit' },
  );
  const parishes = createMemo(
    (): Promise<QueryData<typeof getParishOptions>> => getParishOptions(),
    { name: 'source-parishes' },
  );
  const isThisForm = (form: FormData) => form.get('id') === (props.id ? String(props.id) : '');
  // This form's refused saves (the latest shown, its fields marked).
  const { error, invalid } = useFormErrors(saveSource, isThisForm);
  // The parishes to link to, by either name; a new one can be added here.
  const parishLookup = createMemo(
    (): Lookup =>
      lookupOf(
        (parishes() ?? []).map((p) => ({
          value: p.id,
          label: localName(p.name),
          spellings: p.spellings,
        })),
        {
          label: m.lookup_create_parish(),
          fields: (prefix, text) => (
            <NewParishFields prefix={prefix} text={text} invalid={invalid} />
          ),
        },
      ),
    { name: 'source-parish-lookup' },
  );
  const parishName = (id: number | null) =>
    localName((parishes() ?? []).find((p) => p.id === id)?.name ?? null) || null;
  // A save lands on the sources list with a toast, naming the source as
  // saved (a new title shows).
  const toast = useToast();
  useFormDone(saveSource, isThisForm, (form) => {
    const posted = form.get('title');
    const title = typeof posted === 'string' ? posted.trim() : '';
    toast(props.id ? m.source_saved({ title }) : m.source_created({ title }));
  });

  return (
    // Keyed: each source (and each fresh read of it) gets a fresh form.
    <Show when={source()} keyed fallback={<p>{m.source_edit_missing()}</p>}>
      {(s) => (
        <>
          {/* While a save is in flight the router marks the form aria-busy. */}
          <form method="post" action={saveSource} class="group flex max-w-3xl flex-col gap-6">
            <input type="hidden" name="id" value={s.id || ''} />
            <input type="hidden" name="version" value={s.version} />

            <div class="grid gap-x-4 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <TextInput
                  name="title"
                  label={m.sources_col_title()}
                  value={s.title}
                  required
                  maxlength={FIELD_MAX.line}
                  invalid={invalid('title')}
                />
              </div>
              {/* A disabled select posts nothing: its value rides along hidden. */}
              <Show when={s.records > 0}>
                <input type="hidden" name="kind" value={s.kind} />
              </Show>
              <label class="fieldset">
                <span class="fieldset-legend">{m.sources_col_kind()}</span>
                <select
                  name={s.records > 0 ? undefined : 'kind'}
                  disabled={s.records > 0}
                  class="validator select w-full"
                  aria-invalid={ariaInvalid(invalid('kind'))}
                >
                  <For each={recordKinds}>
                    {(k) => (
                      <option value={k} selected={k === s.kind}>
                        {recordKindLabels[k]()}
                      </option>
                    )}
                  </For>
                </select>
                <FieldError fault={invalid('kind')} />
                <Show when={s.records > 0}>
                  <span class="label">{m.source_kind_locked()}</span>
                </Show>
              </label>
              <LookupField
                textName="parishText"
                idName="parishId"
                label={m.sources_col_parish()}
                text={parishName(s.parishId)}
                id={s.parishId}
                lookup={parishLookup()}
                invalid={invalid}
              />
              <TextInput
                name="yearFrom"
                label={m.source_year_from()}
                value={s.yearFrom === null ? null : String(s.yearFrom)}
                pattern="\d{4}"
                maxlength={4}
                inputmode="numeric"
                error={m.source_year_hint()}
                invalid={invalid('yearFrom')}
              />
              <TextInput
                name="yearTo"
                label={m.source_year_to()}
                value={s.yearTo === null ? null : String(s.yearTo)}
                pattern="\d{4}"
                maxlength={4}
                inputmode="numeric"
                error={m.source_year_hint()}
                invalid={invalid('yearTo')}
              />
              <Select
                name="language"
                label={m.source_language()}
                value={s.language}
                none={m.form_none()}
                options={sourceLanguages.map((l) => ({
                  value: l,
                  label: sourceLanguageLabels[l](),
                }))}
                invalid={invalid('language')}
              />
              <TextInput
                name="archiveReference"
                label={m.source_archive()}
                value={s.archiveReference}
                hint={m.source_archive_hint()}
                maxlength={FIELD_MAX.line}
                invalid={invalid('archiveReference')}
              />
              <TextArea
                name="note"
                label={m.form_note()}
                value={s.note}
                rows={4}
                maxlength={FIELD_MAX.text}
                invalid={invalid('note')}
                class="sm:col-span-2"
              />
            </div>

            {/* A new source is usually added to transcribe it: its first
                record's form can follow. */}
            <FormActions
              error={error()}
              cancelHref={props.cancelHref}
              saveAndNext={!s.id}
              nextLabel={m.source_save_and_records()}
              class="border-t border-base-300 pt-4"
            />
          </form>
          <Show when={s.id}>
            <DeleteSection
              action={deleteSource}
              id={s.id}
              version={s.version}
              title={m.source_delete()}
              text={m.source_delete_text()}
              inUse={s.records ? m.source_delete_in_use({ count: s.records }) : undefined}
              deleted={m.source_deleted({ title: s.title })}
            />
          </Show>
        </>
      )}
    </Show>
  );
}
