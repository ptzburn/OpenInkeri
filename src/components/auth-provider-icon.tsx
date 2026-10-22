import { dynamic } from '@solidjs/web';
import GitHub from '~icons/ri/github-fill';
import Google from '~icons/ri/google-fill';
import VK from '~icons/ri/vk-fill';

import type { AuthProvider } from '~/lib/auth-providers';

const icons: Record<AuthProvider, typeof GitHub> = { google: Google, vk: VK, github: GitHub };

// A sign-in provider's logo, decorative: its name is beside it.
export default function AuthProviderIcon(props: { provider: AuthProvider; class: string }) {
  const Icon = dynamic(() => icons[props.provider]);
  return <Icon class={props.class} aria-hidden="true" />;
}
