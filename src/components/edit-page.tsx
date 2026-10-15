import { Title } from '@solidjs/meta';
import type { JSX } from '@solidjs/web';
import { env } from 'virtual:env/client';
import BackIcon from '~icons/ri/arrow-left-line';

/** An admin's edit (or new) page: the tab title, a link back to the list, the heading, the form. */
export default function EditPage(props: {
  title: string;
  backHref: string;
  backLabel: string;
  children: JSX.Element;
}) {
  return (
    <main class="flex min-w-0 flex-1 flex-col gap-4 p-4 lg:p-8">
      <Title>{`${props.title} - ${env.VITE_APP_NAME}`}</Title>
      <a href={props.backHref} class="btn self-start btn-ghost btn-sm">
        <BackIcon class="size-4" aria-hidden="true" />
        {props.backLabel}
      </a>
      <h1 class="text-2xl font-bold">{props.title}</h1>
      {props.children}
    </main>
  );
}
