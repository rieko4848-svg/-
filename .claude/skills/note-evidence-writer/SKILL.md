---
name: note-evidence-writer
description: Use this skill when the user wants to write a note.com article, blog post, or ongoing content series on a topic they have little or no personal expertise in, and wants the writing to be credible because it is grounded in real academic papers rather than personal opinion, hearsay, or AI-hallucinated claims. Trigger this whenever the user mentions writing a "note" (note.com) article backed by research, wants to pick a content genre based on how deep readers' problems/anxiety are rather than the author's own knowledge, wants to build a DOI-verified "evidence database" of papers, wants a CLAUDE.md-style persona file so future articles need only a one-line prompt, wants to plan a chapter outline before drafting, or wants a second AI to peer-review a draft for hallucinated citations, wrong numbers, or overclaiming versus the source papers. Also trigger for Japanese requests like "論文をもとにnote記事を書きたい", "知識ゼロの分野で権威性のある記事を書きたい", "AIが書いた文章に嘘の論文(ハルシネーション)が混じっていないか確認したい", "夜泣きについての記事のエビデンスを集めて". This skill runs a 5-step pipeline: (1) genre validation by reader-pain-depth + paper availability, (2) DOI-verified evidence database construction, (3) CLAUDE.md persona file authoring, (4) outline-first chapter-by-chapter drafting, (5) independent-AI peer review against 3 fixed checks (DOI existence, numeric/proper-noun accuracy, overclaiming). The user may ask for the full pipeline or just one step (e.g. "just build the evidence database") — support both.
---

# Note Evidence Writer

## The core idea

You don't need to already know a subject to write a trustworthy, authoritative article about it. The knowledge lives inside published academic papers — your job is to collect it, verify it, put it in a file, and write from that file. Zero domain expertise is not a blocker; it's actually fine, *if* the genre is one where solid papers exist and you rigorously verify everything before it touches the draft.

The single biggest risk in this whole workflow is hallucination: an LLM inventing a study, a statistic, or a conclusion that sounds plausible but isn't real. Every step below exists either to gather real evidence or to catch fabrications before they reach the reader. Do not skip the verification steps to save time — a single invented citation destroys the credibility this whole method is built on.

This is a 5-step pipeline. A user may ask for the whole thing end-to-end for a new topic, or drop into just one step (e.g. "build me an evidence database on 夜泣き" or "peer-review this draft"). Figure out from their request which step(s) they want and jump in — you don't have to run all 5 every time.

Work in a project directory for the topic, e.g. `note-projects/<topic-slug>/`, containing:
- `evidence-db.md` — the verified paper database (Step 2)
- `CLAUDE.md` — the persona/voice file (Step 3), placed at the project root so it auto-loads
- `outline.md` — the locked chapter outline (Step 4)
- `chapters/` — one file per chapter draft (Step 4)
- `review-notes.md` — the peer-review findings (Step 5)

Ask the user for the topic and where they want this project directory before starting, if it isn't already clear.

---

## Step 1 — Validate the genre (pain depth, not author expertise)

Do NOT pick a topic because the user (or you) already knows it well. Pick it because readers in that space have a deep, urgent problem — the kind of anxiety that makes people desperate for a reliable answer (first-time parenting, sleep problems, chronic health worries, etc.). Deep reader pain is what drives engagement and willingness to pay; author expertise is not required if the evidence is sound.

Before committing to a topic, check two things and report both to the user:

1. **Is this a "paper-rich" genre?** Search for whether a meaningful body of peer-reviewed research exists on the topic (Step 2's tools are how you check this — do a quick trial search first). Genres like child-rearing, sleep, nutrition, exercise, and general health tend to be paper-rich. A genre with little to no research literature can't be evidenced credibly — flag this to the user and suggest narrowing or picking a different angle rather than proceeding.
2. **Is there a differentiation gap?** Look at what's already being published in this niche (search the web for existing note.com articles, blogs, or social posts on the topic). If most existing content is personal anecdote or repackaged book summaries with no citations, citing real papers is a strong differentiator — say so. If competitors are already doing rigorous, cited writing, tell the user this niche is more contested.

Summarize both findings before moving to Step 2. If the genre fails check 1, stop and discuss alternatives with the user rather than continuing.

---

## Step 2 — Build a DOI-verified evidence database

This is the step that makes zero-knowledge writing possible, and the step where hallucination risk is highest. Read `references/evidence-database.md` for the full method (search strategy, DOI verification procedure, and the exact 3-field entry format) before starting, and use `assets/evidence-database-template.md` as the file you copy into the project as `evidence-db.md`.

The short version: search in Japanese, translate to find English literature, fetch real papers, and — critically — **verify every single paper has a resolvable DOI before it goes in the database.** No DOI, no entry. A plausible-sounding title and authors is not enough; LLMs (including you) fabricate exactly this kind of detail. Never write a database entry from memory — only from a source you actually fetched and can point to.

Each entry records exactly three things: bibliographic info + DOI, what was found (1-3 lines), and the study's limitations (sample/population size, whether it's been replicated). The limitations field is not optional — it's what lets the eventual article correctly say "ある研究では〜と報告されています" (one study found X) instead of overclaiming "〜が分かっています" (X is established) when it isn't. Getting this distinction right in the prose is the difference between trustworthy writing and misleading writing.

---

## Step 3 — Write the CLAUDE.md persona file

Once the evidence database exists, encode how articles from this project should be written so that future requests can be as short as "夜泣きをテーマに投稿作って" (write a post about night-crying) and still come out consistent and on-brand.

Read `references/persona-file.md` for the full guide and use `assets/persona-template.md` as the starting file, saved as `CLAUDE.md` at the project root (so it's automatically loaded in future sessions in that directory).

The file must answer three questions — ask the user for their answers where you can't infer them from context:
1. **WHO writes** — first-person voice/tone, who the reader is, words or phrases to avoid.
2. **WHAT to write about** — point explicitly at `evidence-db.md` as the source of claims; never write a claim that isn't backed by an entry there.
3. **HOW to write** — structural patterns pulled from note.com articles or posts in this niche that are actually performing well (ask the user for examples, or find some via web search, and note what makes them work — hook, pacing, formatting).

Also bake in content-safety rules appropriate to the niche. For advice/health-adjacent content specifically, default to including rules like: never blame the reader (or, for parenting content, never blame the parent) for their situation; never raise a fear or risk without also giving a concrete, actionable next step; always translate technical/academic language into plain words. Adjust these to the actual niche rather than applying them blindly.

---

## Step 4 — Lock the outline, then write chapter by chapter

An article's success is decided by its structure before a single sentence of body text is written. Read `references/outline-workflow.md` for the full method and use `assets/outline-worksheet-template.md` to build `outline.md`. In short:

1. Brainstorm everything worth telling the reader as a flat, numbered list of one-idea-per-bullet points, drawing on `evidence-db.md`.
2. Write one line for where the reader starts (their current state/problem) and one line for where they end up (the goal state) after reading.
3. Design chapter headings that form a straight readable path from start to goal — 4 to 8 chapters, one theme per chapter, headings phrased as confident noun/verb statements rather than questions.
4. Assign every bullet from step 1 into whichever chapter it belongs in. Anything that doesn't fit any chapter gets cut — don't force it in.

Get the user's sign-off on the outline before drafting — it's much cheaper to fix structure now than after 4-8 chapters are written.

Once locked, **write one chapter at a time**, on request (e.g. "第1章書いて" / "write chapter 1"), each backed only by claims traceable to `evidence-db.md`. Do not generate the entire article in one pass — quality degrades badly over very long single-shot generations, especially in later sections. Save each chapter as its own file under `chapters/`.

`evidence-db.md` is a backstage file the reader never sees. If a chapter cites a study, put that study's title, journal, year, and DOI in the chapter's own text (e.g. a short "参考文献" line at the end) — not just in the database. The entire credibility pitch of this method is that claims are independently checkable; that only holds if the citation actually reaches the reader.

---

## Step 5 — Independent peer review (don't let the writer grade its own exam)

Read `references/review-checklist.md` for the full procedure before starting this step.

The core principle: whichever model wrote the draft cannot be trusted to validate it. Asking "are you sure this is correct?" to the same context that just wrote the claim is close to useless — it will generally just re-affirm itself. The review must come from an independent pass, ideally a different model/session with fresh eyes and, where possible, real search access.

The review checks exactly three things per claim, no more:
1. **Does the cited study actually exist?** (Resolve the DOI again — mid-project databases can drift or get hand-edited; re-verify at review time.)
2. **Do the numbers and proper nouns in the draft match the source paper exactly?** (Sample sizes, percentages, ages, drug/method names, author names — anything specific enough to be wrong.)
3. **Does the draft state a conclusion more strongly than the paper itself does?** (Compare the draft's phrasing against the paper's actual conclusion and the limitations note recorded in Step 2 — a single small study should never be presented as settled fact.)

What you can do directly in this session: re-verify every DOI cited in the draft, and re-check every number/proper noun against the `evidence-db.md` entry it came from. Do this yourself rather than skipping it just because a second AI review is also planned — it's cheap and catches most problems.

What needs a second, independent AI or a human: hand the draft to a different model/session (the author of this method used Gemini, for its Google Scholar access, and optionally a third model like Codex for extra confidence) and ask it to run the same 3 checks fresh, without seeing your reasoning. If the user doesn't have a second AI session handy, tell them clearly that this step is a real gap in the safety net and offer to at least do a second independent pass yourself (a fresh read with no memory of having written it) as a partial substitute — but flag it as weaker than a truly independent reviewer.

Log every finding — pass or fail — in `review-notes.md` using the format in `references/review-checklist.md`. Anything that fails any of the 3 checks gets fixed or cut from the draft before it's considered done; don't publish with known unresolved flags.
