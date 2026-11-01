import { type RouteProps, useSearchParams } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { Show, createMemo, isPending } from 'solid-js';
import AddIcon from '~icons/ri/user-add-line';
import LinkIcon from '~icons/ri/link';

import type { QueryData } from '~/lib/query-data';
import EditPage, { BackLink } from '~/components/edit-page';
import { useFormErrors } from '~/components/form-fields';
import { personaRoleLabels, recordKindLabels } from '~/components/labels';
import PeopleTable from '~/components/people-table';
import SearchBox from '~/components/search-box';
import { getLinkCandidates, linkPersona } from '~/data/people';
import { formatPartialDate, localName } from '~/lib/format';
import { idParam, stringParams } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// Admins only: getLinkCandidates redirects anyone else. The record form
// links here from each saved mention. ?q= searches the people to link to;
// without it the mention's given name does.
export const route = defineFileRoute('/people/link/:persona', {
  search: stringParams('q'),
  preload: ({ params, location }) => {
    const id = idParam(params.persona);
    const q = location.query.q;
    if (id) void getLinkCandidates(id, typeof q === 'string' ? q : '');
  },
});

export default function LinkMention(props: RouteProps<'/people/link/:persona'>) {
  const [search, setSearch] = useSearchParams<{ q: string }>();
  const id = () => idParam(props.params.persona);
  const data = createMemo(
    (): Promise<QueryData<typeof getLinkCandidates>> | null => {
      const persona = id();
      return persona ? getLinkCandidates(persona, search.q ?? '') : null;
    },
    { name: 'link-candidates' },
  );
  const { error } = useFormErrors(linkPersona, (form) => form.get('persona') === String(id()));
  const searchFor = (value: string) => setSearch({ q: value || undefined }, { replace: true });
  // Back to the record the mention is in.
  const backHref = () => {
    const mention = data()?.mention;
    return mention ? paths.records(mention.recordId).edit() : paths.people();
  };

  return (
    <EditPage title={m.link_title()}>
      <BackLink href={backHref()} label={m.link_back()} />
      <Show when={data()} fallback={<p>{m.person_link_missing()}</p>}>
        {(d) => (
          <div class="flex max-w-4xl flex-col gap-6">
            <section class="flex flex-col gap-1 rounded-box border border-base-300 p-4">
              <span class="text-sm text-base-content/70">
                {personaRoleLabels[d().mention.role]()} · {recordKindLabels[d().mention.kind]()}{' '}
                {formatPartialDate(d().mention.birthDate ?? d().mention.date)}
              </span>
              <span class="text-lg font-medium">{localName(d().mention.name)}</span>
              <Show when={localName(d().mention.place) || d().mention.placeAsWritten}>
                {(place) => <span class="text-sm text-base-content/70">{place()}</span>}
              </Show>
            </section>

            <Show when={error()}>
              {(e) => (
                <div role="alert" class="alert alert-error alert-soft">
                  {e().message}
                </div>
              )}
            </Show>

            <Show
              when={d().mention.personId}
              fallback={
                <>
                  <form method="post" action={linkPersona} class="group flex flex-col gap-2">
                    <input type="hidden" name="persona" value={d().mention.personaId} />
                    <input type="hidden" name="person" value="new" />
                    <p class="text-sm text-base-content/70">{m.link_new_text()}</p>
                    <button
                      type="submit"
                      class="btn self-start btn-primary group-aria-busy:pointer-events-none group-aria-busy:opacity-60"
                    >
                      <AddIcon class="size-4" aria-hidden="true" />
                      {m.link_new()}
                    </button>
                  </form>

                  <section class="flex flex-col gap-3" aria-labelledby="link-existing">
                    <h2 id="link-existing" class="text-lg font-semibold">
                      {m.link_existing()}
                    </h2>
                    <SearchBox
                      value={search.q ?? d().search}
                      onSearch={searchFor}
                      name="link-search-input"
                      label={m.people_search_label()}
                      placeholder={m.people_search_placeholder()}
                      class="max-w-md"
                    />
                    <div class="transition-opacity" style={{ opacity: isPending(data) ? 0.5 : 1 }}>
                      <Show
                        when={d().candidates.length}
                        fallback={
                          <p class="py-4 text-base-content/60">
                            {m.people_no_match({ search: d().search })}
                          </p>
                        }
                      >
                        <PeopleTable
                          people={d().candidates}
                          action={(row) => (
                            <form method="post" action={linkPersona} class="group">
                              <input type="hidden" name="persona" value={d().mention.personaId} />
                              <input type="hidden" name="person" value={row.id} />
                              <button
                                type="submit"
                                class="btn btn-xs group-aria-busy:pointer-events-none group-aria-busy:opacity-60"
                              >
                                <LinkIcon class="size-4" aria-hidden="true" />
                                {m.link_to_this()}
                              </button>
                            </form>
                          )}
                        />
                      </Show>
                    </div>
                  </section>
                </>
              }
            >
              {(personId) => (
                <p>
                  {m.link_already_text()}{' '}
                  <a href={paths.people(personId())()} class="link">
                    {m.link_open_person()}
                  </a>
                </p>
              )}
            </Show>
          </div>
        )}
      </Show>
    </EditPage>
  );
}
