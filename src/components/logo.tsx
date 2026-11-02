/**
 * The app's mark: the Ingrian flag's offset cross, in its blue on its
 * yellow, drawn as a pedigree: the arms end in people, the one researched
 * at the root in the flag's red. public/favicon.svg is the same drawing.
 * Decorative beside the app's name, so hidden from assistive technology.
 */
export default function Logo(props: { class?: string }) {
  return (
    <svg viewBox="0 0 32 32" class={props.class} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#F6C628" />
      <path
        d="M13 25V7M5.5 13.5H26.5"
        fill="none"
        stroke="#1A4C9A"
        stroke-width="3.2"
        stroke-linecap="round"
      />
      <circle cx="5.5" cy="13.5" r="3" fill="#1A4C9A" />
      <circle cx="26.5" cy="13.5" r="3" fill="#1A4C9A" />
      <circle cx="13" cy="6.5" r="3" fill="#1A4C9A" />
      <circle cx="13" cy="25.5" r="3.6" fill="#C8102E" />
    </svg>
  );
}
