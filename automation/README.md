# note 投稿の自動化

Playwright で note のエディタを操作し、Markdown ファイルを記事として入力します。
**既定は下書き保存まで**で、`--publish` を付けたときだけ公開します。

## 準備（ローカル PC で実行）

### Windows：一括セットアップ

PowerShell に次の1行を貼り付けて Enter を押すと、Git / Node.js の導入から
ファイルの取得、ログインまでを続けて行います。

```powershell
irm https://raw.githubusercontent.com/rieko4848-svg/-/claude/kind-babbage-r8s7p9/setup-windows.ps1 | iex
```

中身はリポジトリ直下の `setup-windows.ps1` です。実行前に内容を確認できます。

### 手動で行う場合（Mac / Windows 共通）

```bash
npm install
npx playwright install chromium   # ブラウザ本体の取得（初回のみ）
```

## 1. ログイン（初回のみ）

```bash
npm run note:login
```

ブラウザが開くので、画面上で note にログインしてください。ログインが完了すると
Cookie が `automation/.auth/note-state.json` に保存され、以降は再利用されます。

メール＋パスワードを環境変数で渡して自動入力させることもできます（2段階認証や
CAPTCHA が出た場合は画面で続きを操作してください）。

```bash
NOTE_EMAIL=you@example.com NOTE_PASSWORD=**** npm run note:login -- --auto
```

> `automation/.auth/` は `.gitignore` 済みです。認証情報そのものなので、
> 共有したりコミットしたりしないでください。

## 2. 記事を書く

`automation/articles/` に Markdown を置きます（`example.md` 参照）。

```markdown
---
tags: [一人社長, 業務効率化]
---
# 記事のタイトル

1つ目の段落。空行で区切ると note 上で段落が分かれます。

2つ目の段落。
```

- タイトル … 先頭の `# 見出し`、または front matter の `title`
- タグ … front matter の `tags`（公開時のみ使用）

## 3. 投稿する

```bash
npm run note:post -- automation/articles/example.md            # 下書き保存
npm run note:post -- automation/articles/example.md --publish  # 公開
npm run note:post -- automation/articles/example.md --headed   # 動きを目で見る
```

> **Windows の場合**：PowerShell は初期設定でスクリプトの実行を禁止しているため、
> `npm` と打つと `npm.ps1 を読み込むことができません` というエラーになります。
> `npm.cmd` と打てばそのまま動きます。
>
> ```powershell
> npm.cmd run note:post -- automation/articles/example.md --headed
> ```
>
> 毎回 `.cmd` を付けたくない場合は、一度だけ次を実行すれば普通に `npm` と打てます
> （管理者権限は不要、自分のユーザーのみが対象）。
>
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

スクリーンショットが `automation/out/` に保存されるので、うまくいかないときは
まず `--headed` で実行し、`out/` の画像で止まった画面を確認してください。

## 注意

- note の HTML 構造は予告なく変わります。要素が見つからないエラーが出たら
  `automation/note-post.js` の候補セレクタ（`NEW_POST_URLS` と `firstVisible` の配列）を
  実際の画面に合わせて追加してください。
- 自分のアカウントの記事投稿にのみ使ってください。短時間の連続投稿は避け、
  note の利用規約に従って運用してください。
- Playwright 同梱版と異なるビルドの Chromium しか無い環境では、
  `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` のように実行ファイルを指定できます。
