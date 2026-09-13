#!/usr/bin/env node
// Run this on a machine with a real display (NOT in a headless remote session).
// Opens a visible browser at note.com's login page, waits for you to log in
// by hand, then saves the resulting session (cookies + storage) to disk so
// create_draft.cjs can reuse it without ever touching your password.
'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const DEFAULT_STATE_PATH = path.join(os.homedir(), '.claude', 'note-auth', 'state.json');
const STATE_PATH = process.env.NOTE_AUTH_STATE_PATH || DEFAULT_STATE_PATH;

async function main() {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://note.com/login');

  console.log('ブラウザでnote.comにログインしてください。');
  console.log('ログイン後、マイページ等に遷移したらこのターミナルに戻って Enter を押してください。');

  await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', resolve);
  });

  const url = page.url();
  if (url.includes('/login')) {
    console.error('まだログイン画面のようです。ログインを完了してから再実行してください。');
    await browser.close();
    process.exit(1);
  }

  await context.storageState({ path: STATE_PATH });
  await browser.close();

  console.log(`保存しました: ${STATE_PATH}`);
  console.log('このファイルはパスワード同然に扱い、Gitにコミットしないでください。');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
