#!/usr/bin/env node
// Markdown ファイル1本を note の下書きにする。
// 実際のブラウザ操作は note-draft スキルの create_draft.cjs に任せ、
// ここは「Markdown を読んでタイトルと本文に分ける」役目だけを持つ。
//
//   npm run note:draft -- articles/example.md
//   npm run note:draft -- articles/example.md --debug      # 失敗時の調査用
//   npm run note:draft -- articles/example.md --dry-run    # 何を渡すか確認するだけ
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { parse } = require('./lib/article');

const CREATE_DRAFT = path.join(__dirname, '..', '.claude', 'skills', 'note-draft', 'scripts', 'create_draft.cjs');

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const passThrough = args.filter(a => a.startsWith('--') && a !== '--dry-run');

function main() {
  if (!file) {
    console.error('使い方: npm run note:draft -- <記事.md> [--debug]');
    process.exit(1);
  }
  if (!fs.existsSync(CREATE_DRAFT)) {
    console.error(`note-draft スキルが見つかりません: ${CREATE_DRAFT}`);
    console.error('"git pull" で最新を取り込んでください。');
    process.exit(1);
  }

  const article = parse(path.resolve(file));
  // create_draft.cjs は本文を1行ずつ入力する。段落の区切りは空行で表す。
  const body = article.paragraphs.join('\n\n');

  const bodyFile = path.join(os.tmpdir(), `note-body-${Date.now()}.txt`);
  fs.writeFileSync(bodyFile, body, 'utf8');

  console.log(`タイトル: ${article.title}`);
  console.log(`本文    : ${article.paragraphs.length}段落 / ${body.length}文字`);
  if (body.includes('<<<有料エリアここから>>>')) console.log('有料エリアの区切りが含まれています。');

  const argv = ['--title', article.title, '--body-file', bodyFile, ...passThrough];
  if (dryRun) {
    console.log(`\n実行内容: node ${CREATE_DRAFT} --title "${article.title}" --body-file ${bodyFile} ${passThrough.join(' ')}`.trim());
    console.log(`本文ファイル: ${bodyFile}`);
    return;
  }

  const child = spawn(process.execPath, [CREATE_DRAFT, ...argv], { stdio: 'inherit' });
  child.on('exit', (code) => {
    fs.unlink(bodyFile, () => {});
    process.exit(code === null ? 1 : code);
  });
}

main();
