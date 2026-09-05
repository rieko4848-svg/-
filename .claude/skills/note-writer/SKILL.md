---
name: note-writer
description: Starting from just an article title/topic, interview the user with a few questions (their experience, personal episodes, unique angle, audience), draft the note.com article body with them, get their OK, then hand off to the note-draft skill to save it as a note.com draft. Use when the user wants to write a note.com post starting from an idea rather than finished text.
---

# note記事の対話作成 → 下書き保存

タイトル(お題)だけを受け取り、対話で内容を引き出しながら本文を書き上げ、
本人のOKが出たら `note-draft` スキルに渡して note.com の下書きとして保存する。
このスキル自身は note.com を直接操作しない(それは note-draft の役目)。

## 手順

### 1. タイトル/お題を確認する
すでに与えられていればそれを使う。無ければ「どんな記事を書きたいですか?」と聞く。

### 2. 数問インタビューする
一度に全部聞かず、会話の流れで3〜5問程度に絞る。すでに文脈で分かっている
ことは聞き直さない。目安の質問:

- この記事で一番伝えたいことは何ですか?
- ご自身の体験談やエピソードはありますか?(具体的な出来事があるほど良い記事になる)
- 他の同じテーマの記事と違う、あなたならではの視点は?
- 想定読者は誰ですか?(初心者/同業者/顧客 など)
- 文体の希望は?(です・ます調 / だ・である調、長さの目安など)

質問は必要な分だけでよい。ユーザーが手短に済ませたそうなら深追いしない。

### 3. 本文を執筆する
集めた回答をもとに、日本語でnote記事の本文を書く。体験談やその人独自の視点を
中心に据え、タイトルと一貫性のある内容にする。書いた本文はいったん全文を
ユーザーに提示する。

### 4. 確認・修正
「この内容で下書き保存してよいか、直したい箇所はないか」を確認する。
修正依頼があれば反映し、OKが出るまで繰り返す。

### 5. note-draft スキルに引き継ぐ
OKが出たら、確定したタイトルと本文をそのまま `note-draft` スキルの
`scripts/create_draft.cjs` に渡して note.com の下書きとして保存する
(実行方法は `.claude/skills/note-draft/SKILL.md` を参照)。**公開はしない。**
保存が終わったら下書きのURLをユーザーに伝える。

事前準備(note.comのログインセッション保存)がまだの場合は、その旨と
`note-draft` スキル側の準備手順をユーザーに案内してから進める。
