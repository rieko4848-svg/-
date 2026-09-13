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
const NEW_NOTE_URL = process.env.NOTE_NEW_URL || 'https://note.com/notes/new';

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

// 下書き保存ボタンの候補。note.com は自動保存もするが、それ任せにすると
// 保存される前にブラウザを閉じてしまうため、明示的に押しにいく。
const SAVE_SELECTORS = [
  'button:has-text("下書き保存")',
  '[data-testid="draftSaveButton"]',
  'button:has-text("保存")',
];

// 下書きが実際に作られると、URL に note の ID が入る(例: /notes/abc123/edit)。
// これが出るまでは「保存された」と言い切れない。
const DRAFT_URL_RE = /\/notes\/([A-Za-z0-9_-]+)\/edit/;

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

async function clickSave(page) {
  for (const sel of SAVE_SELECTORS) {
    try {
      const button = page.locator(sel).first();
      await button.waitFor({ state: 'visible', timeout: 3000 });
      await button.click();
      return sel;
    } catch {
      // この候補は無かった。次を試す。
    }
  }
  return null;
}

// 保存の証拠が出るまで待つ。出なければ null を返し、呼び出し側で正直に伝える。
async function waitForSavedDraft(page, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const m = page.url().match(DRAFT_URL_RE);
    if (m) return page.url();
    await page.waitForTimeout(1000);
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(STATE_PATH)) {
    throw new Error(
      `ログインセッションが見つかりません: ${STATE_PATH}\n` +
        'scripts/login_local.cjs を画面のあるPCで実行してセッションを保存してください。'
    );
  }

  // note.com のエディタは起動時に note.com の API を呼ぶが、ヘッドレスの
  // Chromium は User-Agent に HeadlessChrome を含むため API 側に拒否され、
  // 画面が組み上がらない(CORS エラーとして現れ、タイトル欄が見つからない)。
  // そのため既定は画面あり。HEADLESS=true を明示したときだけヘッドレスにする。
  // Playwright 同梱版と別ビルドの Chromium しか無い環境向けの逃げ道。
  const exe = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const browser = await chromium.launch({
    headless: process.env.HEADLESS === 'true',
    executablePath: exe && fs.existsSync(exe) ? exe : undefined,
  });
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

    // 自動保存任せにせず、保存ボタンを押す。押せなくても自動保存の可能性は残る。
    const savedBy = await clickSave(page);
    if (!savedBy) console.log('下書き保存ボタンが見つからないため、自動保存を待ちます…');

    const draftUrl = await waitForSavedDraft(page);

    await context.storageState({ path: STATE_PATH });

    if (!draftUrl) {
      // ここで「保存しました」と言ってしまうと、保存されていないのに
      // 成功したと誤解させる。確認できなかったことをそのまま伝える。
      await saveDebugArtifacts(page);
      throw new Error(
        '下書きが保存されたことを確認できませんでした。\n' +
          `  最後の画面: ${page.url()}\n` +
          '  note.com の下書き一覧 (https://note.com/notes) を確認してください。\n' +
          '  入っていない場合は ./note-draft-debug/ の画面を見て、\n' +
          '  create_draft.cjs の SAVE_SELECTORS を実際のボタンに合わせてください。'
      );
    }

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
