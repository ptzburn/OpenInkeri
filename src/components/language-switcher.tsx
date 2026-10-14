import { For } from 'solid-js';
import TranslateIcon from '~icons/ri/translate-2';

import { m } from '~/paraglide/messages.js';
import { type Locale, getLocale, locales, setLocale } from '~/paraglide/runtime.js';

// Each language under its own name (Русский, English, Suomi), so visitors
// find theirs whatever language the page is in.
function autonym(locale: Locale) {
  const name = new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale;
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

// daisyUI's popover dropdown, anchored to its button. setLocale writes the
// PARAGLIDE_LOCALE cookie and reloads, so the server renders the page in the
// new language; nothing on the page has to react to the change.
export default function LanguageSwitcher() {
  return (
    <>
      <button
        type="button"
        class="btn btn-circle btn-ghost [anchor-name:--language-menu]"
        popovertarget="language-menu"
        title={m.sidebar_language()}
        aria-label={m.sidebar_language()}
      >
        <TranslateIcon class="size-6" aria-hidden="true" />
      </button>
      <ul
        id="language-menu"
        popover
        class="dropdown dropdown-end menu w-40 rounded-box bg-base-100 shadow-sm [position-anchor:--language-menu]"
      >
        <For each={locales}>
          {(locale) => (
            <li>
              <button
                type="button"
                lang={locale}
                class={{ 'menu-active': locale === getLocale() }}
                aria-current={locale === getLocale() ? 'true' : undefined}
                onClick={() => void setLocale(locale)}
              >
                {autonym(locale)}
              </button>
            </li>
          )}
        </For>
      </ul>
    </>
  );
}
