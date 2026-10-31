// Open a page of the running dev server in headless Chromium, signed in with
// the cookie from session.mjs, and save screenshots.
//
//   node .claude/skills/run-app/screenshot.mjs <cookie-file> <out-dir> [path] [selector] [theme]
//
// path defaults to /, theme to light. Writes page.png, and element.png when
// a selector is given (the first match). Console errors are printed.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const { chromium } = createRequire(path.join(root, 'package.json'))('playwright');

const [cookieFile, out, route = '/', selector, theme = 'light'] = process.argv.slice(2);
const [name, value] = readFileSync(cookieFile, 'utf8').trim().split('=');

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
});
await context.addCookies([
  { name, value, domain: 'localhost', path: '/' },
  { name: 'theme', value: theme, domain: 'localhost', path: '/' },
]);
const page = await context.newPage();
const errors = [];
page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:3060' + route, { waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(out, 'page.png') });
if (selector) {
  const el = page.locator(selector).first();
  await el.waitFor();
  await el.screenshot({ path: path.join(out, 'element.png') });
}
console.log('url:', page.url());
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
