// Genera assets/og-image.jpg (1200×630) a partir de og-image.html con el Chromium de Playwright (npm ci).
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto('file://' + here('./og-image.html'));
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: here('../../assets/og-image.jpg'), type: 'jpeg', quality: 88 });
await browser.close();
console.log('assets/og-image.jpg generada');
