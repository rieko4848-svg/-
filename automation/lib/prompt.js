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
  // 伏せ字のときは何も出さないと「打てているか分からない」ので、* を出す。
  rl._writeToOutput = function (str) {
    if (!rl.muted) { rl.output.write(str); return; }
    if (str.includes('\n') || str.includes('\r')) rl.output.write('\n');
    else rl.output.write('*');
  };
  rl.on('line', (line) => {
    const next = waiting.shift();
    if (next) next(line);
    else buffered.push(line);
  });
  return rl;
}

function readLine() {
  return new Promise((resolve) => {
    if (buffered.length) resolve(buffered.shift());
    else waiting.push(resolve);
  });
}

// ターミナルで入力を受け取る。
//   hidden   … 画面には * だけを出す（パスワード用）
//   required … 空のまま Enter を押されたら、理由を伝えて聞き直す
async function ask(question, { hidden = false, required = true, attempts = 3 } = {}) {
  const r = reader();
  for (let i = 0; i < attempts; i++) {
    process.stdout.write(question);
    r.muted = hidden;
    const value = String(await readLine()).trim();
    r.muted = false;

    if (value) {
      if (hidden) console.log(`  （${value.length}文字を受け取りました）`);
      return value;
    }
    if (!required) return value;
    console.log('  何も入力されていません。もう一度お願いします。');
    if (hidden) console.log('  ※ 入力すると * が表示されます。表示されない場合は、この画面をクリックしてから打ってください。');
  }
  throw new Error('入力が確認できませんでした。もう一度コマンドを実行してください。');
}

function closePrompt() {
  if (rl) { rl.close(); rl = null; }
  waiting.length = 0;
  buffered.length = 0;
}

module.exports = { ask, closePrompt };
