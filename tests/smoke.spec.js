import { expect, test } from '@playwright/test';

async function canvasHasInk(page) {
  return page.locator('#map-canvas').evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) {
      return false;
    }

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return false;

    const { width, height } = canvas;
    const image = context.getImageData(0, 0, width, height).data;
    const pixelStride = Math.max(1, Math.floor((width * height) / 4000));
    for (let pixel = 0; pixel < width * height; pixel += pixelStride) {
      if (image[pixel * 4 + 3] !== 0) return true;
    }
    return false;
  });
}

test('homepage renders generated proof data and a nonblank workbench', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /I build data infrastructure/i })).toBeVisible();
  await expect(page.locator('#proof-signal-strip')).toContainText(/packages/i);
  await expect(page.locator('#proof-signal-strip')).toContainText(/merged PRs/i);

  await page.locator('#workbench-search').fill('Rust');
  await expect(page.locator('#workbench-results .result-card').first()).toBeVisible();

  await expect.poll(() => canvasHasInk(page), {
    message: 'workbench canvas should contain rendered pixels',
    timeout: 12_000
  }).toBe(true);
});

test('homepage fits and keeps core proof visible on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /I build data infrastructure/i })).toBeVisible();
  await expect(page.locator('#proof-signal-strip')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('generated case-study pages expose proof and operational signals', async ({ page }) => {
  await page.goto('/work/dataprof/');

  await expect(page.getByRole('heading', { name: /^dataprof$/i })).toBeVisible();
  await expect(page.getByText('Proof metrics')).toBeVisible();
  await expect(page.getByText('Operational signals')).toBeVisible();
  await expect(page.getByText(/Published packages/i)).toBeVisible();
});

test('Italian routes render localized static and generated pages', async ({ page }) => {
  await page.goto('/it/');

  await expect(page.getByRole('heading', { name: /Costruisco infrastruttura dati/i })).toBeVisible();
  await expect(page.locator('#proof-signal-strip')).toBeVisible();

  await page.goto('/it/work/andreabozzo-site/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await expect(page.getByRole('heading', { name: /^AndreaBozzo$/i })).toBeVisible();
  await expect(page.getByText('Metriche di prova')).toBeVisible();
});
