#!/usr/bin/env node
// note にログインし、Cookie を automation/.auth/note-state.json に保存する。
// 通常は一度だけ実行すればよく、以降 note-post.js がこの状態を使い回す。
//
//   node automation/note-login.js              # ブラウザが開くので手動でログイン
//   NOTE_EMAIL=... NOTE_PASSWORD=... node automation/note-login.js --auto
//
// --auto は2段階認証やCAPTCHAが出ると止まるので、その場合は画面で手動操作を続ける。
const { launch, newContext, saveState } = require('./lib/browser');
const { ask, closePrompt } = require('./lib/prompt');

const BASE = process.env.NOTE_BASE_URL || 'https://note.com';
const LOGIN_URL = `${BASE}/login`;
// ログイン必須のページ。ここが /login に飛ばされなければ本当にログインできている。
const PROBE_URL = `${BASE}/notes/new`;
const WAIT_LIMIT_MS = Number(process.env.NOTE_LOGIN_TIMEOUT_MS) || 10 * 60 * 1000;

const manual = process.argv.includes('--manual');   // ブラウザ上で自分でログインしたいとき
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

// Google は自動操作ブラウザからのログインを拒否する。
// 10分待たせず、その場で気づけるようにする。
function externalAuthBlocked(currentUrl) {
  return /accounts\.google\.com\/.*\b(rejected|deniedsigninrejected)\b/.test(currentUrl);
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

  if (manual) {
    console.log('ブラウザで note にログインしてください。');
    console.log('※ Google ログインは Google 側に拒否されます。メールアドレスとパスワードをお使いください。');
    console.log('ログインが完了したことを確認できるまで、最大10分待ちます…');
  } else {
    // 既定はターミナルで入力してもらい、こちらが入力欄を埋める。
    // ブラウザ上で操作してもらうと Google のボタンを押してしまいやすいため。
    console.log('note のメールアドレスとパスワードを入力してください。');
    console.log('（パスワードは伏せ字 * で表示されます。保存はされません）\n');
    const email = process.env.NOTE_EMAIL || await ask('メールアドレス: ');
    const password = process.env.NOTE_PASSWORD || await ask('パスワード: ', { hidden: true });
    closePrompt();
    if (!email || !password) throw new Error('メールアドレスとパスワードの両方が必要です');

    console.log('\nログインしています…');
    await page.fill('input[name="login"], input[type="email"], #email', email);
    await page.fill('input[name="password"], input[type="password"], #password', password);
    await page.click('button[type="submit"], button:has-text("ログイン")');
    await page.waitForTimeout(3000);

    // 入力内容が違う場合、note は画面上にエラーを出す。気づけるよう拾っておく。
    const problem = await page.evaluate(() => {
      const hit = [...document.querySelectorAll('p, span, div')]
        .map(el => (el.innerText || '').trim())
        .find(t => t && t.length < 120 && /正しくありません|一致しません|失敗|エラー|お確かめ/.test(t));
      return hit || '';
    }).catch(() => '');
    if (problem) {
      console.log(`  note からの表示: ${problem}`);
      // 認証情報そのものが違う場合は、待っても解決しないので即座に終える。
      // 2段階認証やCAPTCHAの案内は該当しないため、待機を続ける。
      if (/正しくありません|一致しません|お確かめ/.test(problem)) {
        throw new Error(
          `note がログインを受け付けませんでした（「${problem}」）。\n` +
          '  メールアドレスとパスワードをお確かめのうえ、もう一度実行してください。\n' +
          '  パスワードが分からない場合は、普段お使いのブラウザで\n' +
          '  https://note.com/login の「パスワードをお忘れですか」から再設定できます。'
        );
      }
    }
  }

  // URL が変わっただけでは信用しない。ログイン必須ページを開けるかで判定する。
  const deadline = Date.now() + WAIT_LIMIT_MS;
  let ok = false;
  let notified = false;
  // どこで止まっているか分かるよう、今どの画面にいるかを知らせ続ける。
  let lastShown = '';
  let lastShownAt = 0;
  const showWhere = () => {
    const now = Date.now();
    const url = page.url();
    if (url === lastShown && now - lastShownAt < 30000) return;
    lastShown = url;
    lastShownAt = now;
    const left = Math.ceil((deadline - now) / 60000);
    console.log(`  [残り約${left}分] 今の画面: ${url.slice(0, 100)}`);
  };

  while (Date.now() < deadline) {
    showWhere();
    if (externalAuthBlocked(page.url())) {
      throw new Error(
        'Google が自動操作ブラウザからのログインを拒否しました（「ログインできませんでした」の画面）。\n' +
        '  これは Google 側の仕様で、回避はできません。かわりに note の\n' +
        '  メールアドレス＋パスワードでログインしてください。\n\n' +
        '  パスワードを設定していない場合は、普段お使いのブラウザで\n' +
        '  https://note.com/settings/account を開き、パスワードを設定してから\n' +
        '  もう一度このコマンドを実行してください。'
      );
    }
    if (looksSettled(page.url())) {
      if (!notified) { console.log('ログインを確認しています…'); notified = true; }
      if (await isLoggedIn(context)) { ok = true; break; }
      notified = false;   // まだだったので、次に戻ってきたら再度知らせる
    }
    await page.waitForTimeout(2000);
  }

  if (!ok) {
    console.log(`\n時間切れです。最後にいた画面: ${page.url()}`);
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
