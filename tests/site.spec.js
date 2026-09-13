import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const studies = JSON.parse(readFileSync('content/projects.json', 'utf8'));

for (const lang of ['en', 'it']) {
  const path = lang === 'en' ? '/' : '/it/';
  test(`${lang}: homepage works without JavaScript or external requests`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.goto(`http://127.0.0.1:4174${path}`);
    await expect(page.locator('h1')).toContainText(lang === 'en' ? 'I’m Andrea.' : 'Sono Andrea.');
    await expect(page.locator('.post-list li')).toHaveCount(3);
    await expect(page.locator('script')).toHaveCount(0);
    expect(requests.every(url => new URL(url).host === '127.0.0.1:4174')).toBeTruthy();
    expect(requests.some(url => /\.(js|wasm|woff2?)(\?|$)/.test(url))).toBeFalsy();
    await page.locator('summary').click();
    await expect(page.locator('.archive a').first()).toBeVisible();
    await page.getByRole('link', { name: 'dataprof', exact: true }).click();
    await expect(page.locator('h1')).toHaveText('dataprof');
    await page.locator('.languages a').filter({ hasText: lang === 'en' ? 'IT' : 'EN' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', lang === 'en' ? 'it' : 'en');
    await context.close();
  });

  test(`${lang}: narrow screens, keyboard navigation, and screenshots`, async ({ page }) => {
    await page.goto(path);
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    }
    await page.screenshot({ path: `test-results/home-${lang}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `test-results/home-${lang}-mobile.png`, fullPage: true });
  });
}

test('all personal pages retain working local links, images, and locale metadata', async ({ page, request }) => {
  const paths = ['/', '/it/', ...studies.flatMap(s => [`/work/${s.slug}/`, `/it/work/${s.slug}/`])];
  const checked = new Set();
  for (const path of paths) {
    const response = await page.goto(path);
    expect(response.status(), path).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', `https://andreabozzo.github.io/AndreaBozzo${path}`);
    await expect(page.locator('link[hreflang]')).toHaveCount(3);
    await expect(page.locator('html')).toHaveAttribute('lang', path.startsWith('/it/') ? 'it' : 'en');
    const urls = await page.locator('a[href], img[src], link[href]').evaluateAll(elements => elements.map(el => el.href || el.src));
    for (const value of urls) {
      const url = new URL(value);
      if (url.origin === 'https://andreabozzo.github.io' && url.pathname.startsWith('/AndreaBozzo/')) {
        url.host = '127.0.0.1:4174'; url.protocol = 'http:';
      }
      if (url.origin !== 'http://127.0.0.1:4174') continue;
      if (url.hash && url.pathname === path) {
        expect(await page.locator(`[id="${decodeURIComponent(url.hash.slice(1))}"]`).count(), value).toBe(1);
      }
      url.hash = '';
      if (checked.has(url.href)) continue;
      checked.add(url.href);
      expect((await request.get(url.href)).status(), value).toBe(200);
    }
    await page.setViewportSize({ width: 320, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBeTruthy();
  }
});

test('GitHub Pages subpath keeps project, language, and blog navigation intact', async ({ page }) => {
  await page.goto('/AndreaBozzo/');
  await page.getByRole('link', { name: 'dataprof', exact: true }).click();
  await expect(page).toHaveURL(/\/AndreaBozzo\/work\/dataprof\/$/);
  await page.locator('.languages').getByText('IT', { exact: true }).click();
  await expect(page).toHaveURL(/\/AndreaBozzo\/it\/work\/dataprof\/$/);
  await page.getByRole('link', { name: /Tutti i progetti/ }).click();
  await expect(page).toHaveURL(/\/AndreaBozzo\/it\/#workbench$/);
  await page.getByRole('link', { name: /Visita il blog/ }).click();
  await expect(page).toHaveURL(/\/AndreaBozzo\/blog\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', /it/);
});

test('retirement worker unregisters and preserves unrelated caches', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await caches.open('andreabozzo-v26');
    await caches.open('unrelated-app');
    await navigator.serviceWorker.register('/sw.js');
  });
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  expect(await page.evaluate(() => caches.keys())).toEqual(['unrelated-app']);
});
