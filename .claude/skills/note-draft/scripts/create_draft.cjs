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

// A line exactly equal to this marker splits the body into a free preview
// part and a paid part. Placed by the note-writer skill (or the caller)
// at the point where the paywall should go.
const DEFAULT_PAID_MARKER = '<<<有料エリアここから>>>';

// Candidates for note.com's block "+" insert control, tried on the empty
// line where the paywall divider should be inserted.
const ADD_BLOCK_SELECTORS = [
  '[aria-label="コンテンツを追加"]',
  '[aria-label="要素を追加"]',
  'button[data-testid="addBlockButton"]',
];

function parseArgs(argv) {
  const args = { debug: false, paidMarker: DEFAULT_PAID_MARKER };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--title') args.title = argv[++i];
    else if (a === '--body') args.body = argv[++i];
    else if (a === '--body-file') args.bodyFile = argv[++i];
    else if (a === '--paid-marker') args.paidMarker = argv[++i];
    else if (a === '--debug') args.debug = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.title) throw new Error('--title is required');
  if (!args.body && !args.bodyFile) throw new Error('--body or --body-file is required');
  if (args.bodyFile) args.body = fs.readFileSync(args.bodyFile, 'utf8');

  const markerIndex = args.body.indexOf(args.paidMarker);
  if (markerIndex === -1) {
    args.freeBody = args.body;
    args.paidBody = null;
  } else {
    args.freeBody = args.body.slice(0, markerIndex).replace(/\n$/, '');
    args.paidBody = args.body.slice(markerIndex + args.paidMarker.length).replace(/^\n/, '');
  }
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

async function typeLines(page, text) {
  for (const line of text.split('\n')) {
    await page.keyboard.type(line);
    await page.keyboard.press('Enter');
  }
}

// Tries to insert note.com's actual paywall divider ("ここから先は有料エリア")
// via its block-insert menu. Returns false (rather than throwing) if the UI
// isn't where expected, so the caller can fall back to a plain-text marker.
async function tryInsertPaidDivider(page) {
  for (const sel of ADD_BLOCK_SELECTORS) {
    try {
      const addButton = page.locator(sel).first();
      await addButton.waitFor({ state: 'visible', timeout: 2000 });
      await addButton.click();

      const menuItem = page.getByText(/有料/).first();
      await menuItem.waitFor({ state: 'visible', timeout: 2000 });
      await menuItem.click();
      return true;
    } catch {
      // try next candidate
    }
  }
  return false;
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
    await typeLines(page, args.freeBody);

    let paidDividerInserted = null; // null = no paid part requested
    if (args.paidBody !== null) {
      paidDividerInserted = await tryInsertPaidDivider(page);
      if (!paidDividerInserted) {
        // Fallback: leave a clearly-labeled plain-text line so the boundary
        // is still visible; the user converts it to a real paywall by hand.
        await page.keyboard.type('----- ここから先は有料エリア(要手動設定) -----');
        await page.keyboard.press('Enter');
      }
      await typeLines(page, args.paidBody);
    }

    // note.com autosaves drafts periodically; give it time before reading the URL back.
    await page.waitForTimeout(3000);

    await context.storageState({ path: STATE_PATH });

    const draftUrl = page.url();
    console.log('下書きを保存しました(公開はしていません):');
    console.log(draftUrl);
    if (paidDividerInserted === true) {
      console.log('有料エリアの区切りを自動設定しました(価格設定はnote.com公開画面で行ってください)。');
    } else if (paidDividerInserted === false) {
      console.log(
        '有料エリアの自動設定に失敗したため、本文中にプレーンテキストの目印を入れました。\n' +
          'note.comの編集画面でその位置に「有料エリア」機能を手動で設定してください。'
      );
    }

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
