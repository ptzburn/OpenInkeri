import { Title } from '@solidjs/meta';
import type { RouteProps } from '@solidjs/router';
import { defineFileRoute } from '@solidjs/router/fs';
import { For, Show, createMemo, isPending } from 'solid-js';
import { env } from 'virtual:env/client';
import BackIcon from '~icons/ri/arrow-left-line';
import EditIcon from '~icons/ri/pencil-line';

import type { QueryData } from '~/lib/query-data';
import { personaRoleLabels, recordKindLabels, sexLabels } from '~/components/labels';
import { getCurrentUser } from '~/data/session';
import { type PersonMention, getPerson, unlinkPersona } from '~/data/people';
import { formatPartialDate, lifespan, localName } from '~/lib/format';
import type { Relative } from '~/lib/person-family';
import { idParam } from '~/lib/route-params';
import { m } from '~/paraglide/messages.js';
import { paths } from '~/router';

// Signed-in users only: getPerson redirects a signed-out visitor to sign-in.
// Admins also get Edit, each mention's record and Unlink; the server
// functions check the role again, so this only decides what is offered.
export const route = defineFileRoute('/people/:id/', {
  preload: ({ params }) => {
    const id = idParam(params.id);
    if (id) void getPerson(id);
  },
});

export default function Person(props: RouteProps<'/people/:id/'>) {
  const person = createMemo(
    (): Promise<QueryData<typeof getPerson>> | null => {
      const id = idParam(props.params.id);
      return id ? getPerson(id) : null;
    },
    { name: 'person' },
  );
  const me = createMemo(() => getCurrentUser(), { name: 'person-me' });
  const canEdit = () => !!me()?.isAdmin;

  return (
    <main class="flex min-w-0 flex-1 flex-col gap-6 p-4 lg:p-8">
      <a href={paths.people()} class="btn self-start btn-ghost btn-sm">
        <BackIcon class="size-4" aria-hidden="true" />
        {m.person_back()}
      </a>
      <Show when={person()} fallback={<p>{m.person_missing()}</p>}>
        {(p) => (
          <div
            class="flex flex-col gap-8 transition-opacity"
            style={{ opacity: isPending(person) ? 0.5 : 1 }}
          >
            <Title>{`${localName(p().name)} - ${env.VITE_APP_NAME}`}</Title>
            <header class="flex flex-wrap items-start gap-4">
              <div class="flex flex-col gap-1">
                <h1 class="text-2xl font-bold">{localName(p().name)}</h1>
                <OtherName name={p().name} />
                <div class="flex flex-wrap items-center gap-2 text-sm text-base-content/70">
                  <Show when={p().sex}>
                    {(sex) => <span class="badge badge-soft badge-sm">{sexLabels[sex()]()}</span>}
                  </Show>
                  <span class="tabular-nums">{lifespan(p().birthDate, p().deathDate)}</span>
                </div>
              </div>
              <Show when={canEdit()}>
                <a href={paths.people(p().id).edit()} class="btn ml-auto btn-sm">
                  <EditIcon class="size-4" aria-hidden="true" />
                  {m.person_edit()}
                </a>
              </Show>
            </header>
            <Show when={p().note}>
              {(note) => <p class="max-w-3xl whitespace-pre-line">{note()}</p>}
            </Show>

            <section class="flex flex-col gap-3" aria-labelledby="person-family">
              <h2 id="person-family" class="text-lg font-semibold">
                {m.person_family()}
              </h2>
              <Show
                when={
                  p().family.parents.length ||
                  p().family.spouses.length ||
                  p().family.children.length
                }
                fallback={<p class="text-base-content/60">{m.person_no_family()}</p>}
              >
                <div class="grid max-w-4xl gap-4 sm:grid-cols-3">
                  <Relatives title={m.person_parents()} relatives={p().family.parents} />
                  <Relatives title={m.person_spouses()} relatives={p().family.spouses} />
                  <Relatives title={m.person_children()} relatives={p().family.children} />
                </div>
              </Show>
            </section>

            <section class="flex flex-col gap-3" aria-labelledby="person-mentions">
              <h2 id="person-mentions" class="text-lg font-semibold">
                {m.person_mentions()}
              </h2>
              <Show
                when={p().mentions.length}
                fallback={<p class="text-base-content/60">{m.person_no_mentions()}</p>}
              >
                <ul class="list max-w-4xl rounded-box border border-base-300">
                  <For each={p().mentions} keyed={(mention) => mention.personaId}>
                    {(mention) => (
                      <MentionRow mention={mention()} personId={p().id} canEdit={canEdit()} />
                    )}
                  </For>
                </ul>
              </Show>
            </section>
          </div>
        )}
      </Show>
    </main>
  );
}

// The name in the other language, under the heading, when there is one.
function OtherName(props: { name: { ru: string | null; fi: string | null } }) {
  const other = () => {
    const shown = localName(props.name);
    return [props.name.ru, props.name.fi].find((n) => n && n !== shown) ?? null;
  };
  return <Show when={other()}>{(name) => <p class="text-base-content/70">{name()}</p>}</Show>;
}

function Relatives(props: { title: string; relatives: Relative[] }) {
  return (
    <div class="flex flex-col gap-2 rounded-box border border-base-300 p-4">
      <h3 class="text-sm font-semibold text-base-content/70">{props.title}</h3>
      <Show when={props.relatives.length} fallback={<p class="text-base-content/50">—</p>}>
        <ul class="flex flex-col gap-1">
          <For each={props.relatives}>
            {(relative) => (
              <li class="flex flex-wrap items-baseline gap-x-2">
                <Show
                  when={relative.personId}
                  fallback={
                    <span title={m.person_not_linked()}>
                      {localName(relative.name)}
                      <span class="text-base-content/50">*</span>
                    </span>
                  }
                >
                  {(id) => (
                    <a href={paths.people(id())()} class="link font-medium link-hover">
                      {localName(relative.name)}
                    </a>
                  )}
                </Show>
                <Show when={relative.year}>
                  {(year) => (
                    <span class="text-sm text-base-content/60 tabular-nums">{year()}</span>
                  )}
                </Show>
              </li>
            )}
          </For>
        </ul>
        <Show when={props.relatives.some((r) => r.personId === null)}>
          <p class="text-xs text-base-content/50">* {m.person_not_linked()}</p>
        </Show>
      </Show>
    </div>
  );
}

// One mention: when, in what role and record, the name as written there and
// where they lived; for admins, the record and Unlink.
function MentionRow(props: { mention: PersonMention; personId: number; canEdit: boolean }) {
  const when = () => formatPartialDate(props.mention.birthDate ?? props.mention.date);
  return (
    <li class="list-row items-center">
      <span class="w-20 text-sm tabular-nums">{when()}</span>
      <div class="flex flex-col">
        <span class="font-medium">
          {personaRoleLabels[props.mention.role]()} · {recordKindLabels[props.mention.kind]()}
        </span>
        <span class="text-sm text-base-content/70">
          {localName(props.mention.name)}
          <Show when={props.mention.age}>{(age) => <>, {age()}</>}</Show>
          <Show when={props.mention.place ?? props.mention.placeAsWritten}>
            {' · '}
            {localName(props.mention.place) || props.mention.placeAsWritten}
          </Show>
        </span>
      </div>
      <Show when={props.canEdit}>
        <div class="flex items-center gap-1">
          <a href={paths.records(props.mention.recordId).edit()} class="btn btn-ghost btn-xs">
            {m.person_open_record()}
          </a>
          <form method="post" action={unlinkPersona} class="group">
            <input type="hidden" name="persona" value={props.mention.personaId} />
            <input type="hidden" name="person" value={props.personId} />
            <button
              type="submit"
              class="btn btn-ghost btn-xs group-aria-busy:pointer-events-none group-aria-busy:opacity-60"
            >
              {m.person_unlink()}
            </button>
          </form>
        </div>
      </Show>
    </li>
  );
}
