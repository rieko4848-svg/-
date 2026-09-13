# note 投稿の自動化（Markdown → 下書き）

Markdown ファイル1本を、note の**下書き**として保存します。**公開はしません。**

ブラウザ操作の本体は `.claude/skills/note-draft/`（note-draft スキル）が担当し、
ここにあるのは「Markdown を読んでタイトルと本文に分ける」薄い入口だけです。
実装もログイン記録も note-draft 側に一本化されています。

## 準備（自分の PC で。初回だけ）

```bash
npm install
npx playwright install chromium
npm run note:login
```

`note:login` でブラウザが開くので note にログインし、終わったらターミナルで Enter。
ログイン記録は `~/.claude/note-auth/state.json` に保存されます（Git には入りません）。

> **Google ログインは使えません。** Google が自動操作ブラウザからのログインを拒否するためです。
> note のメールアドレス＋パスワードでログインしてください。パスワード未設定なら
> https://note.com/settings/account で設定できます。画像認証が出たら画面でそのまま通してください。

## 記事を書く

`articles/` に Markdown を置きます（`example.md` 参照）。

```markdown
---
tags: [一人社長, 業務効率化]
---
# 記事のタイトル

1つ目の段落。空行で区切ると段落が分かれます。

2つ目の段落。
```

- タイトル … 先頭の `# 見出し`、または front matter の `title`
- 有料note … 本文中に `<<<有料エリアここから>>>` だけの行を置くと、そこが境目になります
  （価格設定と公開は note の画面で人が行います）

## 下書きにする

```bash
npm run note:draft -- articles/example.md
```

```bash
npm run note:draft -- articles/example.md --dry-run   # 渡す内容の確認だけ
npm run note:draft -- articles/example.md --debug     # 失敗時に画面を保存
```

成功すると下書きの編集URLが表示されます。

## ブラウザは画面ありで動きます

note のエディタは起動時に `note.com` の API を呼びますが、画面なし（ヘッドレス）の
ブラウザは User-Agent に `HeadlessChrome` を含むため拒否され、編集画面が組み上がりません
（`blocked by CORS policy` として現れ、「タイトル欄が見つからない」で止まります）。
そのため画面ありが既定です。

## うまく動かないとき

まず `--debug` を付けて実行し、`./note-draft-debug/` の画面を確認します。
それでも分からなければ、画面構造を詳しく調べます。

```bash
npm run note:inspect
```

表示中の入力欄・ボタン・枠(iframe)・Shadow DOM の中身に加え、JS エラーや通信失敗も
出力します。結果をもとに `create_draft.cjs` 冒頭の `TITLE_SELECTORS` /
`BODY_SELECTORS` を実際の画面に合わせて更新してください。

## 注意

- 自分のアカウントの記事投稿にのみ使ってください。短時間の連続投稿は避け、
  note の利用規約に従って運用してください。
- Playwright 同梱版と異なるビルドの Chromium しか無い環境では、
  `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` のように実行ファイルを指定できます。
