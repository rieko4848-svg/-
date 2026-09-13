#!/usr/bin/env node
// note のエディタ画面に実際どんな部品があるかを調べて出力する。
// セレクタが合わずに note-post.js が止まったとき、これを実行して結果を貼れば直せる。
//
//   node automation/note-inspect.js
const path = require('path');
const fs = require('fs');
const { openBrowser, firstPage, hasProfile, PROFILE_DIR } = require('./lib/browser');

const SHOT_DIR = path.join(__dirname, 'out');
const CANDIDATES = process.env.NOTE_INSPECT_URLS
  ? process.env.NOTE_INSPECT_URLS.split(',')
  : [
      'https://note.com/notes/new',
      'https://editor.note.com/new',
      'https://note.com/',
    ];

const headless = !process.argv.includes('--headed');
const trim = (s, n = 60) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

// 入力できそうな部品を洗い出して、見分けに使える属性を返す。
async function collectFields(page) {
  return page.evaluate(() => {
    const out = [];
    const nodes = document.querySelectorAll('textarea, input, [contenteditable="true"], [role="textbox"]');
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;            // 画面に出ていないものは除く
      if (el.type === 'hidden') continue;
      out.push({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        placeholder: el.getAttribute('placeholder') || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        testid: el.getAttribute('data-testid') || el.getAttribute('data-test') || '',
        name: el.getAttribute('name') || '',
        id: el.id || '',
        editable: el.getAttribute('contenteditable') || '',
        cls: (typeof el.className === 'string' ? el.className : ''),
        w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.top),
      });
    }
    return out;
  });
}

// URL だけでは判断を誤るため、ログアウト時にしか出ない導線も見る。
async function loginStatus(page) {
  if (page.url().includes('/login')) return 'ログアウト状態（要再ログイン）';
  const guestOnly = await page.evaluate(() => {
    const texts = [...document.querySelectorAll('button, a')]
      .map(el => (el.innerText || '').trim());
    return texts.some(t => t === '会員登録' || t === 'ログイン');
  });
  return guestOnly
    ? 'ログアウト状態とみられる（「会員登録」「ログイン」が表示されています）'
    : 'ログイン済み';
}

async function collectButtons(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, a[role="button"], [role="button"]')) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      out.push({ text, testid: el.getAttribute('data-testid') || '', cls: (typeof el.className === 'string' ? el.className : '') });
    }
    return out;
  });
}

async function main() {
  if (!hasProfile()) throw new Error(`ログイン情報がありません。先に "npm run note:login" を実行してください (${PROFILE_DIR})`);
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const context = await openBrowser({ headless, maximized: !headless });
  const page = await firstPage(context);

  for (const url of CANDIDATES) {
    console.log('\n============================================================');
    console.log(`調査するURL: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(5000);   // 画面が組み上がるのを待つ
    } catch (e) {
      console.log(`  開けませんでした: ${e.message}`);
      continue;
    }

    console.log(`  最終的なURL : ${page.url()}`);
    console.log(`  ページ名    : ${await page.title()}`);
    console.log(`  ログイン状態: ${await loginStatus(page)}`);

    const fields = await collectFields(page);
    console.log(`\n  --- 入力できそうな部品 (${fields.length}件) ---`);
    fields.slice(0, 25).forEach((f, i) => {
      const attrs = [
        f.type && `type=${f.type}`,
        f.placeholder && `placeholder="${trim(f.placeholder)}"`,
        f.ariaLabel && `aria-label="${trim(f.ariaLabel)}"`,
        f.testid && `data-testid="${f.testid}"`,
        f.name && `name=${f.name}`,
        f.id && `id=${f.id}`,
        f.editable && `contenteditable=${f.editable}`,
        f.cls && `class="${trim(f.cls, 70)}"`,
      ].filter(Boolean).join(' ');
      console.log(`  [${i}] <${f.tag}> ${attrs}  (幅${f.w} 高${f.h} 上端${f.y})`);
    });

    const buttons = await collectButtons(page);
    console.log(`\n  --- ボタン (${buttons.length}件) ---`);
    console.log('  ' + buttons.slice(0, 30).map(b => `「${trim(b.text, 20)}」`).join(' '));

    const shot = path.join(SHOT_DIR, `inspect-${url.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    console.log(`\n  画面の写真: ${shot}`);
  }

  console.log('\n============================================================');
  console.log('ここまでの出力をそのままコピーして貼ってください。');
  await context.close();
}

main().catch(err => { console.error('調査に失敗しました:', err.message); process.exit(1); });
