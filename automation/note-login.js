#!/usr/bin/env node
// note にログインするためのブラウザを開く。
// ログイン情報は automation/.auth/profile に残り続けるので、
// 普通のブラウザと同じく、一度ログインすれば以降は不要。
//
//   node automation/note-login.js
const { openBrowser, firstPage, saveCookies, PROFILE_DIR } = require('./lib/browser');
const { ask, closePrompt } = require('./lib/prompt');

const BASE = process.env.NOTE_BASE_URL || 'https://note.com';
const headless = process.argv.includes('--headless');   // 動作確認用

async function main() {
  const context = await openBrowser({ headless, maximized: true, slowMo: 50 });
  const page = await firstPage(context);
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });

  console.log('');
  console.log('========================================================');
  console.log(' ブラウザが開きました。note にログインしてください。');
  console.log('');
  console.log('  ・メールアドレスとパスワードでログインしてください');
  console.log('    （Google ログインは Google 側に拒否されます）');
  console.log('  ・画像認証が出たら、そのまま画面で通してください');
  console.log('  ・ログインできたら、このターミナルに戻って Enter を押してください');
  console.log('');
  console.log(' ※ 時間制限はありません。ゆっくりで大丈夫です。');
  console.log('========================================================');
  console.log('');

  await ask('ログインが終わったら Enter を押してください… ', { required: false });
  closePrompt();

  const saved = await saveCookies(context).catch(() => null);

  // 判定はおまけ。失敗しても情報は残るので、投稿を試せば分かる。
  let state = '確認できませんでした';
  try {
    const probe = await context.newPage();
    await probe.goto(`${BASE}/notes/new`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await probe.waitForTimeout(2000);
    state = probe.url().includes('/login') ? 'まだログインできていないようです' : 'ログインできています';
    await probe.close();
  } catch { /* 確認できなくても続行する */ }

  console.log(`\n確認結果: ${state}`);
  console.log(`ログイン情報の保存先: ${PROFILE_DIR}`);
  if (saved) console.log(`Cookie を ${saved.count} 件控えました: ${saved.path}`);
  if (state === 'まだログインできていないようです') {
    console.log('\nもう一度 "npm run note:login" を実行して、ログインし直してください。');
  } else {
    console.log('\n次は下書き投稿を試せます:');
    console.log('  npm run note:post -- automation/articles/example.md --headed');
  }

  await context.close();
}

main().catch(err => { console.error('\n失敗しました:', err.message); process.exit(1); });
