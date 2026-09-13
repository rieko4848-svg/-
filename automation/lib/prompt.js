const readline = require('readline');

// 読み取り口は1つだけ作って使い回す。
// さらに、届いた行を貯めておく。await の合間に届いた入力を取りこぼさないため。
let rl = null;
const waiting = [];    // 入力を待っている ask の resolve
const buffered = [];   // 先に届いてしまった行

function reader() {
  if (rl) return rl;
  rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.muted = false;
  rl._writeToOutput = function (str) { if (!rl.muted) rl.output.write(str); };
  rl.on('line', (line) => {
    const next = waiting.shift();
    if (next) next(line);
    else buffered.push(line);
  });
  return rl;
}

// ターミナルで入力を受け取る。hidden の場合は画面に表示しない（パスワード用）。
async function ask(question, { hidden = false } = {}) {
  const r = reader();
  process.stdout.write(question);
  r.muted = hidden;
  const line = await new Promise((resolve) => {
    if (buffered.length) resolve(buffered.shift());
    else waiting.push(resolve);
  });
  r.muted = false;
  if (hidden) process.stdout.write('\n');
  return String(line).trim();
}

function closePrompt() {
  if (rl) { rl.close(); rl = null; }
  waiting.length = 0;
  buffered.length = 0;
}

module.exports = { ask, closePrompt };
