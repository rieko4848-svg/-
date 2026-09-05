#!/usr/bin/env node
// Creates a draft article on note.com from a title + body, using a saved
// login session (see login_local.cjs). Fills the editor and lets note.com's
// own autosave persist it as a draft. Never clicks publish.
'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const DEFAULT_STATE_PATH = path.join(os.homedir(), '.claude', 'note-auth', 'state.json');
const STATE_PATH = process.env.NOTE_AUTH_STATE_PATH || DEFAULT_STATE_PATH;
const NEW_NOTE_URL = 'https://note.com/notes/new';

const TITLE_SELECTORS = [
  'textarea[placeholder*="タイトル"]',
  '[data-testid="editorTitle"]',
  'textarea.o-noteContentEditor__textarea',
  'div[contenteditable="true"][data-placeholder*="タイトル"]',
];

const BODY_SELECTORS = [
  '[data-testid="editorBody"] div[contenteditable="true"]',
  'div.note-common-styles__textnote-body[contenteditable="true"]',
  'div[contenteditable="true"]:not([data-placeholder*="タイトル"])',
];

function parseArgs(argv) {
  const args = { debug: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--title') args.title = argv[++i];
    else if (a === '--body') args.body = argv[++i];
    else if (a === '--body-file') args.bodyFile = argv[++i];
    else if (a === '--debug') args.debug = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.title) throw new Error('--title is required');
  if (!args.body && !args.bodyFile) throw new Error('--body or --body-file is required');
  if (args.bodyFile) args.body = fs.readFileSync(args.bodyFile, 'utf8');
  return args;
}

async function findFirst(page, selectors, label) {
  for (const sel of selectors) {
    const locator = page.locator(sel).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: 3000 });
      return locator;
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    `${label}の入力欄が見つかりませんでした。候補: ${selectors.join(', ')}\n` +
      'note.comのUIが変更された可能性があります。--debug を付けて再実行し、' +
      './note-draft-debug/ のスクリーンショットを見てセレクタを更新してください。'
  );
}

async function saveDebugArtifacts(page) {
  const dir = path.join(process.cwd(), 'note-draft-debug');
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, 'screenshot.png'), fullPage: true });
  fs.writeFileSync(path.join(dir, 'page.html'), await page.content());
  console.error(`デバッグ情報を保存しました: ${dir}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(STATE_PATH)) {
    throw new Error(
      `ログインセッションが見つかりません: ${STATE_PATH}\n` +
        'scripts/login_local.cjs を画面のあるPCで実行してセッションを保存してください。'
    );
  }

  const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
  const context = await browser.newContext({ storageState: STATE_PATH });
  const page = await context.newPage();

  try {
    await page.goto(NEW_NOTE_URL, { waitUntil: 'networkidle' });

    if (page.url().includes('/login')) {
      throw new Error(
        'note.comのログインセッションが失効しています。scripts/login_local.cjs を再実行してください。'
      );
    }

    const titleField = await findFirst(page, TITLE_SELECTORS, 'タイトル');
    await titleField.click();
    await titleField.fill(args.title);

    const bodyField = await findFirst(page, BODY_SELECTORS, '本文');
    await bodyField.click();
    for (const line of args.body.split('\n')) {
      await page.keyboard.type(line);
      await page.keyboard.press('Enter');
    }

    // note.com autosaves drafts periodically; give it time before reading the URL back.
    await page.waitForTimeout(3000);

    await context.storageState({ path: STATE_PATH });

    const draftUrl = page.url();
    console.log('下書きを保存しました(公開はしていません):');
    console.log(draftUrl);

    if (args.debug) await saveDebugArtifacts(page);
  } catch (err) {
    if (args.debug) await saveDebugArtifacts(page);
    throw err;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
