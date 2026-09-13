const fs = require('fs');

// Markdown 1ファイル = 記事1本。
//   1行目の "# タイトル" をタイトル、それ以降を本文として扱う。
//   先頭に --- で囲んだ YAML 風ブロックがあれば title / tags を読む。
function parse(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  let body = raw;
  const meta = {};

  const fm = body.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const m = line.match(/^\s*([A-Za-z_]+)\s*:\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      const value = m[2].trim().replace(/^["']|["']$/g, '');
      meta[key] = key === 'tags'
        ? value.replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean)
        : value;
    }
    body = body.slice(fm[0].length);
  }

  let title = meta.title;
  if (!title) {
    const h1 = body.match(/^\s*#\s+(.+?)\s*$/m);
    if (h1) {
      title = h1[1];
      body = body.replace(h1[0], '');
    }
  }
  if (!title) throw new Error(`タイトルが見つかりません: ${filePath} (先頭に "# タイトル" を置くか front matter に title を書いてください)`);

  // 本文は段落単位に分割する（note のエディタへ1段落ずつ入力するため）。
  const paragraphs = body.trim().split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
  if (!paragraphs.length) throw new Error(`本文が空です: ${filePath}`);

  return { title: title.trim(), paragraphs, tags: meta.tags || [] };
}

module.exports = { parse };
