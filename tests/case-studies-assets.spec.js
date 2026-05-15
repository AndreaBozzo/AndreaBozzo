const { expect, test } = require('@playwright/test');
const { readdirSync, readFileSync, statSync } = require('node:fs');
const { extname, join, relative, sep } = require('node:path');

const repoRoot = process.cwd();
const caseStudies = JSON.parse(readFileSync(join(repoRoot, 'assets/data/case-studies.json'), 'utf8')).items;
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.svg', '.webp']);

function hasItalianTranslation(study) {
  const translation = study.translations?.it;
  if (!translation) return false;
  return Boolean(
    (translation.title || study.title)
    && (translation.displayTitle || study.displayTitle || translation.title || study.title)
    && (translation.metaDescription || translation.summary || translation.subtitle || study.metaDescription || study.summary || study.subtitle)
    && Array.isArray(translation.sections)
    && translation.sections.some(section => section.body)
  );
}

function walkImageAssets(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const info = statSync(fullPath);
    if (info.isDirectory()) {
      walkImageAssets(fullPath, out);
      continue;
    }
    if (imageExtensions.has(extname(entry).toLowerCase())) {
      out.push(`/${relative(repoRoot, fullPath).split(sep).join('/')}`);
    }
  }
  return out.sort();
}

async function expectPageImagesToLoad(page) {
  const brokenImages = await page.locator('img').evaluateAll((images) => images
    .map((image) => ({
      source: image.currentSrc || image.getAttribute('src') || '',
      complete: image.complete,
      width: image.naturalWidth,
      height: image.naturalHeight
    }))
    .filter((image) => image.source.trim() !== '')
    .filter((image) => !image.complete || image.width < 1 || image.height < 1)
    .map((image) => image.source));

  expect(brokenImages).toEqual([]);
}

async function expectCaseStudyMediaSourcesToLoad(page) {
  const mediaSources = await page.locator('[data-media-src]').evaluateAll((items) => items
    .map((item) => item.getAttribute('data-media-src'))
    .filter(Boolean));

  for (const source of mediaSources) {
    const url = new URL(source, page.url()).toString();
    const response = await page.request.get(url);
    expect(response.ok(), `${url} should load`).toBe(true);
    const contentType = response.headers()['content-type'] || '';
    expect(contentType, `${url} should be an image`).toMatch(/image\/(png|jpeg|svg\+xml|webp)|text\/xml|application\/xml/);
  }
}

async function expectSvgAssetToBeValid(request, assetPath) {
  const response = await request.get(assetPath);
  expect(response.ok(), `${assetPath} should load`).toBe(true);
  const content = await response.text();
  expect(content, `${assetPath} should contain an SVG root`).toMatch(/<svg[\s>]/);
  expect(content, `${assetPath} should not contain script tags`).not.toMatch(/<script[\s>]/i);
}

async function expectImageAssetToRender(page, assetPath) {
  await page.goto('/');
  await page.setContent(`
    <!doctype html>
    <html>
      <body style="margin:0">
        <img id="asset" src="${assetPath}" alt="">
      </body>
    </html>
  `);

  const image = page.locator('#asset');
  await expect(image).toHaveJSProperty('complete', true);
  const dimensions = await image.evaluate((node) => ({
    width: node.naturalWidth,
    height: node.naturalHeight
  }));

  expect(dimensions.width, `${assetPath} should have width`).toBeGreaterThan(1);
  expect(dimensions.height, `${assetPath} should have height`).toBeGreaterThan(1);
}

test.describe('case-study pages', () => {
  for (const study of caseStudies) {
    test(`English case study loads images and media: ${study.slug}`, async ({ page }) => {
      await page.goto(`/work/${study.slug}/`);

      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('.case-hero')).toBeVisible();
      await expectPageImagesToLoad(page);
      await expectCaseStudyMediaSourcesToLoad(page);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `/work/${study.slug}/ should not horizontally overflow`).toBeLessThanOrEqual(1);
    });

    if (hasItalianTranslation(study)) {
      test(`Italian case study loads images and media: ${study.slug}`, async ({ page }) => {
        await page.goto(`/it/work/${study.slug}/`);

        await expect(page.locator('html')).toHaveAttribute('lang', 'it');
        await expect(page.locator('h1')).toBeVisible();
        await expect(page.locator('.case-hero')).toBeVisible();
        await expectPageImagesToLoad(page);
        await expectCaseStudyMediaSourcesToLoad(page);

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `/it/work/${study.slug}/ should not horizontally overflow`).toBeLessThanOrEqual(1);
      });
    }
  }
});

test.describe('image assets', () => {
  for (const assetPath of walkImageAssets(join(repoRoot, 'assets/images'))) {
    test(`asset renders: ${assetPath}`, async ({ page, request }) => {
      if (assetPath.endsWith('.svg')) {
        await expectSvgAssetToBeValid(request, assetPath);
      }
      await expectImageAssetToRender(page, assetPath);
    });
  }
});
