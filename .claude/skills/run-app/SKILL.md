---
name: run-app
description: Launch the dev server and look at a page in headless Chromium, signed in. Use to see a UI change working in the real app, take a screenshot, or check a page for console errors.
---

The app is a Vite + Cloudflare Workers dev server on port 3060, with the local D1 database in `.wrangler/state`. Chromium comes from Playwright (`pnpm exec playwright install --with-deps chromium`, run by the devcontainer's post-create command; rerun it if `screenshot.mjs` reports a missing browser).

## Start and stop

```bash
lsof -ti:3060 -sTCP:LISTEN | xargs -r kill        # free the port first
(pnpm dev > "$SCRATCH/dev.log" 2>&1 &)
timeout 90 bash -c 'until curl -sf -o /dev/null http://localhost:3060/; do sleep 1; done'
```

Stop it the same way (kill the port's listener). `$SCRATCH` is the session scratchpad directory.

## Sign in

Sign-in is social only (GitHub, Google, VK), so a browser can't log in by itself. `session.mjs` inserts a session row for a local user and prints the signed cookie:

```bash
node .claude/skills/run-app/session.mjs > "$SCRATCH/cookie.txt"   # first admin; or pass a user id
```

It reads `BETTER_AUTH_SECRET` from `.env` and needs a user in the local database (sign in once through a real browser on a fresh clone). The cookie lasts a day; it stops working if the secret changes.

## Look at a page

```bash
node .claude/skills/run-app/screenshot.mjs "$SCRATCH/cookie.txt" "$SCRATCH" "/records?q=Ионас" "tbody tr" dark
```

Arguments: cookie file, output directory, route (default `/`), an optional selector whose first match is cropped to `element.png`, and the theme (`light` or `dark`, the `theme` cookie). The page screenshot is `page.png`. Read the images; check that "console errors" is `none`.

Signed-out routes redirect to `/sign-in`: if `url:` prints that, the cookie is stale or the secret changed. Rerun `session.mjs`.

## Gotchas

- `.env` quotes the secret; `session.mjs` strips the quotes. Don't paste the raw value elsewhere.
- Search matches a record's folded search text (child, parents, locality), so `?q=` with a parent's surname finds children without a recorded name.
- The first page of baptisms has no twins or out-of-wedlock births; search for one (`?q=Ионас` has twins, `?q=Гантту` triplets, `?q=Ниммериг` one out of wedlock) to see those icons.
