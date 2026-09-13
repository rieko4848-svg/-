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

ブラウザが開くので、**メールアドレスとパスワードで** note にログインしてください。
画像認証が出たら、そのまま画面で通してください。**時間制限はありません。**

ログインできたらターミナルに戻って Enter を押すと、ログイン情報が
`automation/.auth/` に保存されます。普通のブラウザと同じで、一度ログインすれば
以降は不要です。

> `automation/.auth/` は `.gitignore` 済みです。認証情報そのものなので、
> 共有したりコミットしたりしないでください。

### Google ログインは使えません

Google は自動操作されたブラウザからのログインを拒否します
（「ログインできませんでした / このブラウザまたはアプリは安全でない可能性があります」）。
これは Google 側の仕様のため、**note のメールアドレス＋パスワードでログインしてください**。

Google 連携でアカウントを作りパスワードが未設定の場合は、普段お使いのブラウザで
https://note.com/settings/account を開き、パスワードを設定してから実行してください。

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
```

ブラウザの窓が開き、入力されていく様子が見えます（画面ありが既定）。

> **Windows の場合**：PowerShell は初期設定でスクリプトの実行を禁止しているため、
> `npm` と打つと `npm.ps1 を読み込むことができません` というエラーになります。
> `npm.cmd` と打てばそのまま動きます。
>
> ```powershell
> npm.cmd run note:post -- automation/articles/example.md
> ```
>
> 毎回 `.cmd` を付けたくない場合は、一度だけ次を実行すれば普通に `npm` と打てます
> （管理者権限は不要、自分のユーザーのみが対象）。
>
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

スクリーンショットが `automation/out/` に保存されるので、うまくいかないときは
`out/` の画像で止まった画面を確認してください。

## うまく動かないとき：画面構造を調べる

note の画面の作りは予告なく変わります。`要素が見つかりません` で止まったら、
次を実行すると、実際にどんな入力欄やボタンがあるかを一覧で表示します。

```bash
node automation/note-inspect.js
```

Windows の PowerShell では `node automation/note-inspect.js` のままで動きます
（`npm` を経由しないため `.cmd` は不要）。

出力された一覧をもとに、`automation/note-post.js` の `TITLE_SELECTORS` と
`firstVisible()` に渡している候補を、実際の属性に合わせて追記してください。

## ブラウザは画面ありで動きます

note のエディタは起動時に `note.com` の API を呼びますが、画面なし（ヘッドレス）の
ブラウザからの呼び出しは拒否され、エディタが描画されません
（`blocked by CORS policy` として現れます）。画面なしのブラウザは名乗りに
`HeadlessChrome` が含まれるためです。

そのため各スクリプトは**画面ありで動くのが既定**です。動作確認などで画面なしに
したい場合のみ `--headless` を付けてください。

## 注意

- note の HTML 構造は予告なく変わります。要素が見つからないエラーが出たら
  `automation/note-post.js` の候補セレクタ（`NEW_POST_URLS` と `firstVisible` の配列）を
  実際の画面に合わせて追加してください。
- 自分のアカウントの記事投稿にのみ使ってください。短時間の連続投稿は避け、
  note の利用規約に従って運用してください。
- Playwright 同梱版と異なるビルドの Chromium しか無い環境では、
  `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` のように実行ファイルを指定できます。
