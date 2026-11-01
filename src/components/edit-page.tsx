import { Title } from '@solidjs/meta';
import type { JSX } from '@solidjs/web';
import { env } from 'virtual:env/client';
import BackIcon from '~icons/ri/arrow-left-line';

/**
 * An admin's edit (or new) page: the tab title, the heading, the form.
 * Nothing here is conditional: a `<Show>` that rendered nothing ahead of the
 * heading put hydration off for everything after it, and a page loaded
 * directly kept its server-rendered form without its behaviour (the map
 * never appeared). A page without a Cancel in its form puts a BackLink in
 * its content instead.
 */
export default function EditPage(props: { title: string; children: JSX.Element }) {
  return (
    <main class="flex min-w-0 flex-1 flex-col gap-4 p-4 lg:p-8">
      <Title>{`${props.title} - ${env.VITE_APP_NAME}`}</Title>
      <h1 class="text-2xl font-bold">{props.title}</h1>
      {props.children}
    </main>
  );
}

/**
 * A page that is a map with the form as a panel over it (the locality
 * pages): the tab title and a box as tall as the viewport under the header
 * (navbar: min-h-16) that the content fills, edge to edge. The heading is
 * the panel's, in the content.
 */
export function MapPage(props: { title: string; children: JSX.Element }) {
  return (
    <main class="relative h-[calc(100dvh-4rem)] min-w-0 flex-none overflow-hidden">
      <Title>{`${props.title} - ${env.VITE_APP_NAME}`}</Title>
      {props.children}
    </main>
  );
}

/** A link back from a page with no Cancel: the link page, a row that isn't there. */
export function BackLink(props: { href: string; label: string }) {
  return (
    <a href={props.href} class="btn self-start btn-ghost btn-sm">
      <BackIcon class="size-4" aria-hidden="true" />
      {props.label}
    </a>
  );
}
