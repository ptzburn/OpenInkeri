import { Show } from 'solid-js';

// A user's round avatar: their GitHub picture, or their initial on a neutral
// disc when they have none. `class` sizes it (e.g. "w-8").
export default function UserAvatar(props: { name: string; image?: string | null; class: string }) {
  return (
    <Show
      when={props.image}
      fallback={
        <div class="avatar avatar-placeholder">
          <div class={['rounded-full bg-neutral text-neutral-content', props.class]}>
            <span>{props.name.charAt(0).toUpperCase()}</span>
          </div>
        </div>
      }
    >
      {(image) => (
        <div class="avatar">
          <div class={['rounded-full', props.class]}>
            <img src={image()} alt="" referrerpolicy="no-referrer" />
          </div>
        </div>
      )}
    </Show>
  );
}
