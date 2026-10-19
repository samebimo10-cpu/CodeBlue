// Regenerates the PNG app icons from public/icons/icon.svg (needs Playwright's Chromium).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../public/icons');
const svg = readFileSync(join(dir, 'icon.svg'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const shots = [
  ['icon-192.png', 192, 0, 'transparent'],
  ['icon-512.png', 512, 0, 'transparent'],
  ['apple-touch-icon.png', 180, 0, '#1f4fd1'],
  ['icon-maskable-512.png', 512, 0.12, '#1f4fd1'],
];
for (const [name, size, pad, bg] of shots) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(`<body style="margin:0;background:${bg};display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body>`);
  await page.screenshot({ path: join(dir, name), omitBackground: bg === 'transparent' });
}
await browser.close();
console.log('icons written');
