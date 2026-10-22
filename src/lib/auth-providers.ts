// The services people sign in with, in the sign-in page's order: better-auth
// social provider ids. src/server/auth.ts configures them; GitHub always,
// Google and VK when their credentials are set.
export const AUTH_PROVIDERS = ['google', 'vk', 'github'] as const;

export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export function isAuthProvider(value: unknown): value is AuthProvider {
  return AUTH_PROVIDERS.includes(value as AuthProvider);
}
