// Types for unplugin-icons' `~icons/<collection>/<name>` imports. The
// package's own `unplugin-icons/types/solid` imports JSX from solid-js,
// which is Solid 1; in Solid 2 both types come from @solidjs/web.
declare module '~icons/*' {
  import type { ComponentProps, JSX } from '@solidjs/web';

  const component: (props: ComponentProps<'svg'>) => JSX.Element;
  export default component;
}
