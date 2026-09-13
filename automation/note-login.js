#!/usr/bin/env node
// note にログインし、Cookie を automation/.auth/note-state.json に保存する。
// 通常は一度だけ実行すればよく、以降 note-post.js がこの状態を使い回す。
//
//   node automation/note-login.js              # ブラウザが開くので手動でログイン
//   NOTE_EMAIL=... NOTE_PASSWORD=... node automation/note-login.js --auto
//
// --auto は2段階認証やCAPTCHAが出ると止まるので、その場合は画面で手動操作を続ける。
const { launch, newContext, saveState } = require('./lib/browser');

const BASE = process.env.NOTE_BASE_URL || 'https://note.com';
const LOGIN_URL = `${BASE}/login`;
// ログイン必須のページ。ここが /login に飛ばされなければ本当にログインできている。
const PROBE_URL = `${BASE}/notes/new`;
const WAIT_LIMIT_MS = Number(process.env.NOTE_LOGIN_TIMEOUT_MS) || 10 * 60 * 1000;

const auto = process.argv.includes('--auto');
const headless = process.argv.includes('--headless');

// 利用者が操作中のタブを邪魔しないよう、別タブで確認する。
async function isLoggedIn(context) {
  const probe = await context.newPage();
  try {
    await probe.goto(PROBE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await probe.waitForTimeout(1500);
    return !probe.url().includes('/login');
  } catch {
    return false;
  } finally {
    await probe.close().catch(() => {});
  }
}

// 認証の途中（外部サービスの画面など）で確認を走らせないための足切り。
function looksSettled(currentUrl) {
  try {
    const u = new URL(currentUrl);
    if (u.host !== new URL(PROBE_URL).host) return false;   // 別ドメインで認証中
    return !u.pathname.startsWith('/login') && !u.pathname.startsWith('/signup');
  } catch {
    return false;
  }
}

async function main() {
  const browser = await launch({ headless, slowMo: 50 });
  const context = await newContext(browser, { useState: false });
  const page = await context.newPage();

  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

  if (auto) {
    const email = process.env.NOTE_EMAIL;
    const password = process.env.NOTE_PASSWORD;
    if (!email || !password) throw new Error('--auto には NOTE_EMAIL と NOTE_PASSWORD が必要です');
    await page.fill('input[name="login"], input[type="email"], #email', email);
    await page.fill('input[name="password"], input[type="password"], #password', password);
    await page.click('button[type="submit"], button:has-text("ログイン")');
  } else {
    console.log('ブラウザで note にログインしてください。');
    console.log('（メール・Google・Apple など、普段お使いの方法で構いません）');
    console.log('ログインが完了したことを確認できるまで、最大10分待ちます…');
  }

  // URL が変わっただけでは信用しない。ログイン必須ページを開けるかで判定する。
  const deadline = Date.now() + WAIT_LIMIT_MS;
  let ok = false;
  let notified = false;
  while (Date.now() < deadline) {
    if (looksSettled(page.url())) {
      if (!notified) { console.log('ログインを確認しています…'); notified = true; }
      if (await isLoggedIn(context)) { ok = true; break; }
      notified = false;   // まだだったので、次に戻ってきたら再度知らせる
    }
    await page.waitForTimeout(2000);
  }

  if (!ok) {
    throw new Error(
      'ログインを確認できませんでした。\n' +
      '  ・ログインが完了しないまま時間切れになった\n' +
      '  ・2段階認証やCAPTCHAの途中で止まっていた\n' +
      'などが考えられます。もう一度実行してみてください。'
    );
  }

  const saved = await saveState(context);
  console.log(`\nログインを確認しました。状態を保存しました: ${saved}`);
  console.log('※ このファイルは認証情報そのものです。.gitignore 済みですが取り扱いに注意してください。');

  await browser.close();
}

main().catch(err => { console.error('\nログインに失敗しました:', err.message); process.exit(1); });
