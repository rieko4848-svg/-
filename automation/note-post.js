#!/usr/bin/env node
// Markdown ファイルを note のテキスト記事として入力する。
// 既定は「下書き保存」まで。公開するときだけ --publish を付ける。
//
//   node automation/note-post.js automation/articles/example.md
//   node automation/note-post.js automation/articles/example.md --publish
//   node automation/note-post.js automation/articles/example.md --headed   # 動きを目で確認する
const path = require('path');
const fs = require('fs');
const { openBrowser, firstPage, hasProfile, PROFILE_DIR } = require('./lib/browser');
const { parse } = require('./lib/article');

// NOTE_NEW_POST_URL を設定すると投稿先を差し替えられる（動作確認用）。
const NEW_POST_URLS = process.env.NOTE_NEW_POST_URL
  ? [process.env.NOTE_NEW_POST_URL]
  : ['https://editor.note.com/new', 'https://note.com/notes/new'];
const SHOT_DIR = path.join(__dirname, 'out');

// タイトル欄の候補。エディタが開けたかの判定にも使う。
const TITLE_SELECTORS = [
  'textarea[placeholder*="記事タイトル"]',
  'textarea[placeholder*="タイトル"]',
  'input[placeholder*="タイトル"]',
  '[data-testid="title-input"]',
];

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const publish = args.includes('--publish');
const headless = !args.includes('--headed');

async function shot(page, name) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const p = path.join(SHOT_DIR, `${Date.now()}-${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

// note のエディタは頻繁に変わるため、候補セレクタを順に試す。
async function firstVisible(page, selectors, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      if (await loc.isVisible().catch(() => false)) return loc;
    }
    await page.waitForTimeout(300);
  }
  throw new Error(`要素が見つかりません: ${selectors.join(' / ')}`);
}

async function openEditor(page) {
  const tried = [];
  for (const url of NEW_POST_URLS) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      if (page.url().includes('/login')) {
        tried.push(`${url} -> ログイン画面に飛ばされました（再ログインが必要です）`);
        continue;
      }
      // 開いた先が本当にエディタかを、タイトル欄の有無で確かめる。
      // ここを確認せずに進むと、別のページ上で操作しようとして分かりにくい失敗になる。
      await firstVisible(page, TITLE_SELECTORS, 15000);
      return;
    } catch (e) {
      tried.push(`${url} -> ${page.url()} （タイトル欄が見つからず）`);
    }
  }
  throw new Error(
    'エディタを開けませんでした。試したURL:\n  ' + tried.join('\n  ') +
    '\n\n"npm run note:post" ではなく "node automation/note-inspect.js" を実行し、' +
    '出力を共有してください（実際の画面構造を調べます）。'
  );
}

async function main() {
  if (!file) throw new Error('使い方: node automation/note-post.js <記事.md> [--publish] [--headed]');
  if (!hasProfile()) throw new Error(`ログイン情報がありません。先に "npm run note:login" を実行してください (${PROFILE_DIR})`);

  const article = parse(path.resolve(file));
  console.log(`タイトル: ${article.title}`);
  console.log(`段落数: ${article.paragraphs.length} / タグ: ${article.tags.join(', ') || 'なし'}`);
  console.log(`モード: ${publish ? '公開' : '下書き保存'}`);

  const context = await openBrowser({ headless, maximized: !headless, slowMo: headless ? 0 : 80 });
  const page = await firstPage(context);

  try {
    await openEditor(page);

    const title = await firstVisible(page, TITLE_SELECTORS);
    await title.click();
    await title.fill(article.title);

    const body = await firstVisible(page, [
      'div[contenteditable="true"]',
      '[role="textbox"]',
      '.ProseMirror',
    ]);
    await body.click();
    for (let i = 0; i < article.paragraphs.length; i++) {
      if (i > 0) await page.keyboard.press('Enter');
      // 改行を含む段落もそのまま打ち込む（type は \n を Enter として送る）。
      await page.keyboard.type(article.paragraphs[i], { delay: 5 });
    }

    await page.waitForTimeout(1500);
    console.log(`入力完了のスクリーンショット: ${await shot(page, 'filled')}`);

    if (!publish) {
      // 下書き保存。ボタン名が変わっている場合はエディタの自動保存に任せる。
      const draft = page.locator('button:has-text("下書き保存"), button:has-text("下書き")').first();
      if (await draft.isVisible().catch(() => false)) {
        await draft.click();
        await page.waitForTimeout(3000);
        console.log('下書きとして保存しました。');
      } else {
        console.log('下書き保存ボタンが見つかりませんでした。note の自動保存に任せ、note の「下書き」一覧を確認してください。');
      }
    } else {
      const next = await firstVisible(page, ['button:has-text("公開に進む")', 'button:has-text("公開")']);
      await next.click();
      await page.waitForTimeout(2000);

      for (const tag of article.tags) {
        const tagInput = page.locator('input[placeholder*="ハッシュタグ"], input[placeholder*="タグ"]').first();
        if (!(await tagInput.isVisible().catch(() => false))) break;
        await tagInput.fill(tag);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(400);
      }

      const submit = await firstVisible(page, ['button:has-text("投稿する")', 'button:has-text("公開する")']);
      await submit.click();
      await page.waitForTimeout(5000);
      console.log('公開しました。');
    }

    console.log(`最終状態のスクリーンショット: ${await shot(page, publish ? 'published' : 'draft')}`);
    console.log(`URL: ${page.url()}`);
  } catch (err) {
    console.error('失敗しました:', err.message);
    console.error(`デバッグ用スクリーンショット: ${await shot(page, 'error').catch(() => '(取得不可)')}`);
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
