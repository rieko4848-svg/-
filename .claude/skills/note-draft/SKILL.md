---
name: note-draft
description: Create a draft article on note.com (title + body) using a previously saved login session (cookies). Use when the user asks to draft, write, or prepare a note.com post. Stops at draft save — never publishes.
---

# note下書き自動作成

note.com にはユーザー向けの投稿APIが無いため、実際のブラウザ(Playwright/Chromium)を操作して
新規記事の編集画面にタイトルと本文を入力し、下書き保存するところまでを自動化する。
**公開ボタンは絶対に押さない。** 下書き保存までがこのスキルの範囲。

タイトルだけがあって本文がまだ無い(対話しながら記事を書きたい)場合は、
先に `note-writer` スキルを使うこと。このスキルは「すでに確定したタイトルと本文」を
note.comに流し込む最後のステップを担当する。

## 前提: ログインセッション(Cookie)の準備

このスキルはユーザーのIDとパスワードを直接扱わない。事前に取得した note.com のログイン
セッション(Playwright の `storageState` 形式)をファイルから読み込んで使う。

保存先はデフォルトで **リポジトリの外** (`~/.claude/note-auth/state.json`)。
`NOTE_AUTH_STATE_PATH` 環境変数で上書き可能。**このファイルは絶対にコミットしない。**

セッションファイルがまだ無い場合、ユーザーに以下のどちらかを案内する:

1. **推奨**: 画面表示ができる自分のPC(ローカル)で `scripts/login_local.cjs` を実行してもらう。
   ブラウザが開くので note.com に手動でログインしてもらい、閉じると
   `~/.claude/note-auth/state.json` にセッションが保存される。
   (このリモート実行環境には画面がないため、ログイン操作自体はローカルでしか行えない)
2. 既にブラウザの拡張機能等でCookieをエクスポート済みなら、Playwright の
   `storageState` JSON形式 (`{ "cookies": [...], "origins": [...] }`) に整形して
   同じパスに置いてもらう。

## 下書きを作成する

```bash
NODE_PATH=/opt/node22/lib/node_modules node .claude/skills/note-draft/scripts/create_draft.cjs \
  --title "記事タイトル" \
  --body-file /path/to/body.txt
```

- `--title`: 必須。記事タイトル。
- `--body` または `--body-file`: 本文(どちらか一方)。長文は `--body-file` を推奨。
- 本文はプレーンテキストとして1行ずつ入力される(note.com側のリッチテキスト変換には依存しない)。
  見出しや太字などの装飾は、下書き保存後にnote.comの編集画面で人が仕上げる想定。
- 実行環境にヘッドレスブラウザ用の環境変数 (`PLAYWRIGHT_BROWSERS_PATH`) が既に設定されている
  前提。ローカル実行時に `Executable doesn't exist` エラーが出たら `npx playwright install chromium`
  を一度実行する。

成功すると下書きの編集URL(例: `https://note.com/notes/xxxxxxx/edit`)を標準出力に表示する。
ログインセッションが失効している場合は、その旨をエラーメッセージで知らせるので、
`login_local.cjs` を再実行してもらう。

## 実装時の注意(note.comのUI変更への対策)

note.com のDOM構造は非公開かつ変更され得るため、`create_draft.cjs` はタイトル欄・本文欄それぞれ
複数の候補セレクタを順に試す作りになっている。もしどの候補でも要素が見つからずエラーになった
場合は、`--debug` オプションを付けて再実行するとスクリーンショットとページ抜粋が
`./note-draft-debug/` に保存されるので、それを見ながら `create_draft.cjs` 冒頭の
`TITLE_SELECTORS` / `BODY_SELECTORS` を実際のDOMに合わせて更新する。
