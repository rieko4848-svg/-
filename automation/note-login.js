#!/usr/bin/env node
// note にログインし、Cookie を automation/.auth/note-state.json に保存する。
// 通常は一度だけ実行すればよく、以降 note-post.js がこの状態を使い回す。
//
//   node automation/note-login.js              # ブラウザが開くので手動でログイン
//   NOTE_EMAIL=... NOTE_PASSWORD=... node automation/note-login.js --auto
//
// --auto は2段階認証やCAPTCHAが出ると止まるので、その場合は画面で手動操作を続ける。
const { launch, newContext, saveState } = require('./lib/browser');

const LOGIN_URL = 'https://note.com/login';
const auto = process.argv.includes('--auto');
const headless = process.argv.includes('--headless');

async function main() {
  const browser = await launch({ headless, slowMo: 50 });
  const context = await newContext(browser, { useState: false });
  const page = await context.newPage();

  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

  if (auto) {
    const email = process.env.NOTE_EMAIL;
    const password = process.env.NOTE_PASSWORD;
    if (!email || !password) throw new Error('--auto には NOTE_EMAIL と NOTE_PASSWORD が必要です');
    await page.fill('input[type="email"], input[name="email"], #email', email);
    await page.fill('input[type="password"], input[name="password"], #password', password);
    await page.click('button[type="submit"], button:has-text("ログイン")');
  } else {
    console.log('ブラウザでログインしてください。ログイン完了を検知するまで待機します…');
  }

  // ログイン後は note.com のトップ等へ遷移し、/login から離れる。
  await page.waitForURL(url => !String(url).includes('/login'), { timeout: 5 * 60 * 1000 });
  await page.waitForTimeout(2000);

  const saved = await saveState(context);
  console.log(`ログイン状態を保存しました: ${saved}`);
  console.log('※ このファイルは認証情報そのものです。.gitignore 済みですが取り扱いに注意してください。');

  await browser.close();
}

main().catch(err => { console.error('ログインに失敗しました:', err.message); process.exit(1); });
