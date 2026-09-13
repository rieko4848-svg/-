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

// note の API は画面なしのブラウザからの呼び出しを拒否するため、既定は画面あり。
const headless = process.argv.includes('--headless');
const trim = (s, n = 60) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

// 入力できそうな部品を洗い出して、見分けに使える属性を返す。
// 枠(iframe)の中に入力欄がある作りのサイトもあるため、全部の枠を調べる。
async function collectFields(page) {
  const all = [];
  for (const frame of page.frames()) {
    try {
      const found = await collectFieldsIn(frame);
      const label = frame === page.mainFrame() ? '' : frame.url().slice(0, 60);
      found.forEach(f => all.push(Object.assign({ frame: label }, f)));
    } catch { /* 触れない枠は飛ばす */ }
  }
  return all;
}

async function collectFieldsIn(frame) {
  return frame.evaluate(() => {
    // Shadow DOM（通常の検索では中が見えない作り）の中まで辿る。
    const collectAll = (root, acc) => {
      for (const el of root.querySelectorAll('*')) {
        acc.push(el);
        if (el.shadowRoot) collectAll(el.shadowRoot, acc);
      }
      return acc;
    };
    const every = collectAll(document, []);
    const isField = (el) => {
      const tag = el.tagName.toLowerCase();
      return tag === 'textarea' || tag === 'input'
        || el.getAttribute('contenteditable') === 'true'
        || el.getAttribute('role') === 'textbox';
    };

    const out = [];
    const nodes = every.filter(isField);
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
  const all = [];
  for (const frame of page.frames()) {
    try { (await collectButtonsIn(frame)).forEach(b => all.push(b)); } catch { /* 触れない枠は飛ばす */ }
  }
  return all;
}

async function collectButtonsIn(frame) {
  return frame.evaluate(() => {
    const collectAll = (root, acc) => {
      for (const el of root.querySelectorAll('*')) {
        acc.push(el);
        if (el.shadowRoot) collectAll(el.shadowRoot, acc);
      }
      return acc;
    };
    const isButton = (el) => el.tagName.toLowerCase() === 'button'
      || el.getAttribute('role') === 'button';

    const out = [];
    for (const el of collectAll(document, []).filter(isButton)) {
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

  // 画面が組み上がらない原因はたいてい JS のエラーか通信の失敗なので、記録しておく。
  let problems = [];
  const note = (line) => { if (problems.length < 400) problems.push(line); };
  page.on('pageerror', (e) => note(`JSエラー: ${String(e.message).slice(0, 200)}`));
  page.on('console', (m) => { if (m.type() === 'error') note(`console: ${m.text().slice(0, 200)}`); });
  page.on('requestfailed', (r) => {
    const why = r.failure() ? r.failure().errorText : '不明';
    note(`通信失敗: ${why} ${r.url().slice(0, 120)}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) note(`応答${r.status()}: ${r.url().slice(0, 120)}`);
  });

  // サーバー側が「自動操作のブラウザ」と判断する材料になるため、名乗りを確認する。
  const ua = await page.evaluate(() => navigator.userAgent).catch(() => '(取得できません)');
  console.log(`ブラウザの名乗り: ${ua}`);
  console.log(`画面表示: ${headless ? 'なし（ヘッドレス）' : 'あり'}`);
  if (/Headless/i.test(ua)) {
    console.log('※ 名乗りに "Headless" が含まれています。これが原因で API を拒否される場合があります。');
    console.log('  --headed を付けて実行すると、通常のブラウザとして動きます。');
  }

  for (const url of CANDIDATES) {
    console.log('\n============================================================');
    console.log(`調査するURL: ${url}`);
    problems = [];
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      // エディタは読み込みが重い。通信が落ち着くまで待ってから調べる。
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(8000);
    } catch (e) {
      console.log(`  開けませんでした: ${e.message}`);
      continue;
    }

    console.log(`  最終的なURL : ${page.url()}`);
    console.log(`  ページ名    : ${await page.title()}`);
    console.log(`  ログイン状態: ${await loginStatus(page)}`);

    const frames = page.frames();
    console.log(`  枠(iframe)の数: ${frames.length}`);
    frames.forEach((f, i) => { if (i > 0) console.log(`    枠${i}: ${f.url().slice(0, 90)}`); });

    const bodyText = await page.evaluate(() => (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').trim().slice(0, 200)).catch(() => '');
    console.log(`  画面の文字: ${bodyText || '(空 ＝ まだ描画されていない可能性)'}`);

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
        f.frame && `【枠: ${trim(f.frame, 50)}】`,
      ].filter(Boolean).join(' ');
      console.log(`  [${i}] <${f.tag}> ${attrs}  (幅${f.w} 高${f.h} 上端${f.y})`);
    });

    if (fields.length === 0) {
      const hint = await page.evaluate(() => {
        const tags = {};
        for (const el of document.querySelectorAll('*')) {
          const t = el.tagName.toLowerCase();
          tags[t] = (tags[t] || 0) + 1;
        }
        const top = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 12)
          .map(([t, n]) => `${t}:${n}`).join(' ');
        const shadows = [...document.querySelectorAll('*')].filter(el => el.shadowRoot).length;
        return { top, shadows, total: document.querySelectorAll('*').length };
      }).catch(() => null);
      if (hint) {
        console.log(`  ※ 0件だったので内訳を出します`);
        console.log(`     要素の総数: ${hint.total} / Shadow DOM: ${hint.shadows}個`);
        console.log(`     多い要素: ${hint.top}`);
      }
    }

    const buttons = await collectButtons(page);
    console.log(`\n  --- ボタン (${buttons.length}件) ---`);
    console.log('  ' + buttons.slice(0, 30).map(b => `「${trim(b.text, 20)}」`).join(' '));

    if (problems.length) {
      // 同じ内容が何度も出るので、重複はまとめる。
      const seen = new Map();
      for (const line of problems) seen.set(line, (seen.get(line) || 0) + 1);
      const list = [...seen.entries()];
      console.log(`\n  --- 画面の組み立て中に起きた問題 (${problems.length}件 / 種類 ${list.length}) ---`);
      list.slice(0, 15).forEach(([line, n]) => console.log(`  ・${line}${n > 1 ? ` (×${n})` : ''}`));
    } else {
      console.log('\n  --- 画面の組み立て中に起きた問題: なし ---');
    }

    const shot = path.join(SHOT_DIR, `inspect-${url.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    console.log(`\n  画面の写真: ${shot}`);
  }

  console.log('\n============================================================');
  console.log('ここまでの出力をそのままコピーして貼ってください。');
  await context.close();
}

main().catch(err => { console.error('調査に失敗しました:', err.message); process.exit(1); });
