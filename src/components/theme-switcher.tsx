import { createMemo } from 'solid-js';
import Moon from '~icons/ri/moon-line';
import Sun from '~icons/ri/sun-line';

import { getTheme, saveTheme } from '~/lib/theme';
import { m } from '~/paraglide/messages.js';

// daisyUI's theme-controller swap: while the checkbox is checked the page
// uses the theme in its value (dark); unchecked it falls back to the default
// (light). The server renders the saved choice; after that the checkbox owns
// its state.
export default function ThemeSwitcher() {
  const saved = createMemo(() => getTheme(), { name: 'saved-theme' });

  return (
    <label class="btn swap btn-circle swap-rotate btn-ghost" title={m.theme_toggle()}>
      <input
        type="checkbox"
        value="dark"
        class="theme-controller"
        aria-label={m.theme_dark()}
        checked={saved() === 'dark'}
        onChange={(event) => saveTheme(event.currentTarget.checked ? 'dark' : 'light')}
      />
      <Sun class="swap-off size-6" aria-hidden="true" />
      <Moon class="swap-on size-6" aria-hidden="true" />
    </label>
  );
}
