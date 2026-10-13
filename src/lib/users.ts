// The users pages' data: server functions ('use server') the UI calls
// directly. On the server they are plain function calls; in the browser the
// compiler turns each into a typed fetch against the /_server endpoint.
// query() caches reads per key; action() marks writes, and the router
// revalidates queries after an action settles.
//
// Every function checks the session itself: the route guard decides what
// renders, but these are public URLs anyone can call.
import { action, query } from '@solidjs/router';
import { getRequestEvent, redirect, respond } from '@solidjs/web';

import { callAuth } from '~/server/auth';
import { db } from '~/server/database';

function signedIn() {
  const user = getRequestEvent()?.locals.user;
  if (!user) throw redirect('/sign-in?next=%2Fusers');
  return user;
}

export const getUsers = query(async () => {
  'use server';
  signedIn();
  return db.query.user.findMany({
    columns: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
}, 'users');

export const getUser = query(async (id: string) => {
  'use server';
  signedIn();
  const user = await db.query.user.findFirst({
    columns: { id: true, name: true, createdAt: true },
    where: { id },
  });
  return user ?? null;
}, 'user');

/** Renames the signed-in user; nobody can rename anyone else. */
export const renameMe = action(async (form: FormData) => {
  'use server';
  signedIn();
  const raw = form.get('name');
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name || name.length > 100) {
    throw respond({ message: 'Enter a name of 1–100 characters.' }, { status: 400 });
  }
  const response = await callAuth('/update-user', { name });
  if (!response.ok) {
    throw respond({ message: 'Could not save the name. Try again.' }, { status: response.status });
  }
}, 'rename-me');
