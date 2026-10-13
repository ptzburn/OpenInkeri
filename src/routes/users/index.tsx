import { Title } from '@solidjs/meta';
import { env } from 'virtual:env/client';

// The layout's index page: what /users itself renders inside users.tsx,
// whose nav already lists every user. Without an index, /users would fall
// through to the [...404] catch-all.
export default function UsersIndex() {
  return (
    <section>
      <Title>{`Users - ${env.VITE_APP_NAME}`}</Title>
      <p>Pick a user above.</p>
    </section>
  );
}
