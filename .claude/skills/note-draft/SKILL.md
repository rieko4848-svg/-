---
name: note-draft
description: Create a draft article on note.com (title + body) using a previously saved login session (cookies). Use when the user asks to draft, write, or prepare a note.com post. Stops at draft save — never publishes.
---

# note下書き自動作成

note.com にはユーザー向けの投稿APIが無いため、実際のブラウザ(Playwright/Chromium)を操作して
新規記事の編集画面にタイトルと本文を入力し、下書き保存するところまでを自動化する。
**公開ボタンは絶対に押さない。** 下書き保存までがこのスキルの範囲。

このスキルは**自分のパソコン上のClaude Code**で使うことを前提にしている
(ログイン操作に画面が必要なため。クラウド上のセッションでは動かせない)。

タイトルだけがあって本文がまだ無い(対話しながら記事を書きたい)場合は、
先に `note-writer` スキルを使うこと。このスキルは「すでに確定したタイトルと本文」を
note.comに流し込む最後のステップを担当する。

## 初回だけの準備

### 1. 必要なものをインストール(1回だけ)

リポジトリのルートで:

```bash
npm install
npx playwright install chromium
```

### 2. note.comにログインした記録を保存する(1回だけ)

```bash
node .claude/skills/note-draft/scripts/login_local.cjs
```

ブラウザが自動で開くので、note.comにいつも通りログインする。ログインできたら
ターミナルに戻ってEnterキーを押す。これで `~/.claude/note-auth/state.json` に
ログイン記録(Cookie)が保存される。**パスワードそのものはこのプログラムに渡さない。**

このファイルはパスワード同然に扱われるべき情報なので、Gitには絶対にコミットされない
設定(`.gitignore`)になっている。ログインが失効したら、この手順をもう一度行えばよい。

## 下書きを作成する

```bash
node .claude/skills/note-draft/scripts/create_draft.cjs \
  --title "記事タイトル" \
  --body-file /path/to/body.txt
```

- `--title`: 必須。記事タイトル。
- `--body` または `--body-file`: 本文(どちらか一方)。長文は `--body-file` を推奨。
- 本文はプレーンテキストとして1行ずつ入力される(note.com側のリッチテキスト変換には依存しない)。
  見出しや太字などの装飾は、下書き保存後にnote.comの編集画面で人が仕上げる想定。

成功すると下書きの編集URL(例: `https://note.com/notes/xxxxxxx/edit`)を標準出力に表示する。
ログインセッションが失効している場合は、その旨をエラーメッセージで知らせるので、
`login_local.cjs` を再実行してもらう。

### 有料note(無料部分+有料部分)にしたい場合

本文の中に、単独行で `<<<有料エリアここから>>>` という目印を入れておくと、そこを境目として
無料部分/有料部分に分けて入力する。可能であればnote.comの「有料エリア」機能を自動で挿入し、
挿入できなかった場合は目印をプレーンテキストのまま残して手動設定を促す(どちらの結果になったかは
実行後のメッセージで分かる)。目印の文字列は `--paid-marker` で変更できる。

**価格設定や実際の公開は行わない。** 有料/無料の値段はnote.com側の公開設定画面で人が決めること。

## ブラウザは画面ありで動かすこと

note.com のエディタは起動時に `note.com/api/v1/text_notes` を呼ぶが、ヘッドレスの
Chromium は User-Agent に `HeadlessChrome` を含むため、この API 呼び出しが拒否される。
結果として編集画面が組み上がらず、タイトル欄が見つからないというエラーになる
(ブラウザのコンソールには `blocked by CORS policy` として現れる)。

そのため `create_draft.cjs` は**画面ありが既定**。検証目的でヘッドレスにしたい場合のみ
`HEADLESS=true` を明示する(その場合、上記の理由で失敗する可能性が高い)。

## 実装時の注意(note.comのUI変更への対策)

note.com のDOM構造は非公開かつ変更され得るため、`create_draft.cjs` はタイトル欄・本文欄それぞれ
複数の候補セレクタを順に試す作りになっている。もしどの候補でも要素が見つからずエラーになった
場合は、`--debug` オプションを付けて再実行するとスクリーンショットとページ抜粋が
`./note-draft-debug/` に保存されるので、それを見ながら `create_draft.cjs` 冒頭の
`TITLE_SELECTORS` / `BODY_SELECTORS` を実際のDOMに合わせて更新する。
