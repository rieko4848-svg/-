import { chromium } from 'playwright-core';
import fs from 'fs';
const [, , start, end, step] = process.argv.map(Number);
fs.mkdirSync('/tmp/claude-0/anim/frames', { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('file:///tmp/claude-0/anim/anim.html'); await p.evaluate(() => window.ready);
for (let f = start; f < end; f += step) {
  await p.evaluate(t => render(t), f / 30);
  await p.screenshot({ path: `/tmp/claude-0/anim/frames/f${String(f).padStart(5, '0')}.png`, type: 'png' });
}
await b.close();
