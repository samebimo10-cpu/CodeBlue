// End-to-end smoke test in Chromium. Usage: node scripts/e2e.mjs <sample.pdf> <outdir> [url]
import { chromium, devices } from 'playwright';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [pdfPath, outDir, url = 'http://localhost:4173/'] = process.argv.slice(2);
const browser = await chromium.launch();
const errors = [];
const shot = async (page, name) => page.screenshot({ path: join(outDir, name + '.png') });

async function run(label, ctxOpts) {
  const ctx = await browser.newContext({ ...ctxOpts, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${label}] console: ${m.text()}`));
  await page.goto(url);
  await page.waitForSelector('.empty-card');
  await shot(page, label + '-0-start');

  // open the PDF
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.empty-card .btn.primary')]);
  await chooser.setFiles(pdfPath);
  await page.waitForFunction(() => document.querySelector('.page canvas.base')?.width > 10);
  await page.waitForTimeout(800);
  await shot(page, label + '-1-opened');

  // smart eraser: show detection
  await page.click('.tool[data-tool="eraser"]');
  await page.waitForSelector('.busy', { state: 'detached', timeout: 20000 });
  await page.click('label.check:has-text("Show what")');
  await page.waitForTimeout(600);
  await shot(page, label + '-2-detect');
  await page.click('label.check:has-text("Show what")');

  // erase handwriting across the doctor-notes box (both typed heading and blue ink live there)
  const box = await page.locator('.page .upper-canvas').boundingBox();
  const z = box.width / 612;
  const drag = async (pts) => {
    await page.mouse.move(box.x + pts[0][0] * z, box.y + pts[0][1] * z);
    await page.mouse.down();
    for (const [x, y] of pts.slice(1)) await page.mouse.move(box.x + x * z, box.y + y * z, { steps: 8 });
    await page.mouse.up();
  };
  // PDF y=420 → display y=372; heading "Doctor notes" at display y≈322
  await drag([[70, 322], [470, 330], [470, 345], [80, 345], [80, 360], [470, 360], [470, 378], [80, 378], [80, 395], [470, 395], [470, 420], [300, 420], [300, 445], [520, 445]]);
  // also sweep line 1 where a handwritten name sits on a typed line
  await drag([[60, 118], [520, 118]]);
  await page.waitForTimeout(300);
  await shot(page, label + '-3-erased-handwriting');

  // typed eraser on line 3
  await page.click('.seg button:has-text("Typed text")');
  await drag([[60, 170], [400, 170]]);
  await shot(page, label + '-4-erased-typed');

  // undo once (typed erase), check button state
  await page.click('button[aria-label="Undo"]');
  await page.waitForTimeout(200);

  // edit existing text: line 4
  await page.click('.tool[data-tool="edittext"]');
  await page.mouse.click(box.x + 120 * z, box.y + (792 - 670 + 3 * 26 - 4) * z);
  await page.waitForTimeout(500);
  await page.keyboard.press('End');
  await page.keyboard.type(' (EDITED)');
  await page.mouse.click(box.x + 580 * z, box.y + 760 * z); // click away
  await shot(page, label + '-5-edited-text');

  // pen stroke
  await page.click('.tool[data-tool="pen"]');
  await drag([[100, 560], [160, 600], [220, 560], [280, 610]]);

  // add text
  await page.click('.tool[data-tool="text"]');
  await page.mouse.click(box.x + 330 * z, box.y + 560 * z);
  await page.keyboard.type('Added note');
  await page.mouse.click(box.x + 580 * z, box.y + 770 * z);

  // insert a picture (use an app icon) and set blend multiply
  const [ic] = await Promise.all([page.waitForEvent('filechooser'), page.click('button[aria-label="Picture"]')]);
  await ic.setFiles(new URL('../public/icons/icon-192.png', import.meta.url).pathname);
  await page.waitForTimeout(500);
  await page.selectOption('.props .field:has-text("Blend") select', 'multiply');
  await shot(page, label + '-6-objects');

  // signature
  await page.click('button[aria-label="Signature"]');
  const pad = await page.locator('.sign-pad').boundingBox();
  await page.mouse.move(pad.x + 40, pad.y + 60);
  await page.mouse.down();
  for (let i = 0; i < 12; i++) await page.mouse.move(pad.x + 40 + i * 30, pad.y + 60 + (i % 2 ? 40 : -10), { steps: 4 });
  await page.mouse.up();
  await page.click('button:has-text("Place signature")');
  await page.waitForTimeout(400);

  // pages: rotate page 2 and duplicate page 1
  await page.click('button[aria-label="Pages"]');
  await page.waitForSelector('.thumb');
  await page.locator('.thumb').nth(1).locator('button[aria-label="Rotate"]').click();
  await page.waitForTimeout(400);
  await page.locator('.thumb').nth(0).locator('button[aria-label="Duplicate"]').click();
  await page.waitForTimeout(400);
  await shot(page, label + '-7-pages');
  if (label === 'phone') await page.click('button[aria-label="Close pages"]');

  // save
  await page.click('button[aria-label="Save PDF"]');
  await page.waitForSelector('.modal input');
  const dlP = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await page.click('.modal .btn.primary');
  const dl = await dlP;
  if (dl) await dl.saveAs(join(outDir, label + '-export.pdf'));
  else errors.push(`[${label}] no download`);

  // handwriting tab
  await page.click('nav.tabs button[data-tab="handwriting"]');
  await page.waitForSelector('.style-card');
  await page.waitForTimeout(500);
  await shot(page, label + '-8-handwriting');
  await page.locator('.style-card').nth(6).click();
  await page.click('button:has-text("Place in PDF")');
  await page.waitForTimeout(500);
  await shot(page, label + '-9-placed-handwriting');

  // receipts tab
  await page.click('nav.tabs button[data-tab="receipts"]');
  await page.waitForSelector('.tpl', { timeout: 20000 });
  await page.waitForTimeout(800);
  await shot(page, label + '-10-receipts');
  await page.locator('.tpl').nth(2).click();
  await page.click('.modal .btn.primary');
  await page.waitForTimeout(600);
  await page.locator('.rpreview').screenshot({ path: join(outDir, label + '-11-pharmacy.png') });
  await page.locator('.tpl').nth(4).click();
  await page.click('.modal .btn.primary');
  await page.waitForTimeout(600);
  await page.locator('.rpreview').screenshot({ path: join(outDir, label + '-12-hotel.png') });
  const dl2P = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await page.click('.ractions .btn.primary');
  const dl2 = await dl2P;
  if (dl2) await dl2.saveAs(join(outDir, label + '-receipt.pdf'));
  else errors.push(`[${label}] no receipt download`);
  await page.locator('.logo-grid').scrollIntoViewIfNeeded();
  await shot(page, label + '-13-logo');
  await ctx.close();
}

await run('desktop', { viewport: { width: 1366, height: 1500 } });
const iphone = devices['iPhone 13'];
// Playwright's iPhone profile is WebKit-flavoured; run its viewport/touch in Chromium
await run('phone', { viewport: iphone.viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: false });
await browser.close();
writeFileSync(join(outDir, 'errors.txt'), errors.join('\n'));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
