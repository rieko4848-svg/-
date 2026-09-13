const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

// note-draft スキルと同じログイン記録を使う。ログインは1か所だけにする。
const DEFAULT_STATE_PATH = path.join(os.homedir(), '.claude', 'note-auth', 'state.json');
const STATE_PATH = process.env.NOTE_AUTH_STATE_PATH || DEFAULT_STATE_PATH;

// Playwright 同梱版と別ビルドの Chromium しか無い環境向け。
function executablePath() {
  const p = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  return p && fs.existsSync(p) ? p : undefined;
}

function hasState() {
  return fs.existsSync(STATE_PATH);
}

// note.com のエディタは起動時に note.com の API を呼ぶが、ヘッドレスの Chromium は
// User-Agent に HeadlessChrome を含むため拒否され、画面が組み上がらない。既定は画面あり。
async function openBrowser({ headless = false } = {}) {
  const browser = await chromium.launch({
    headless,
    executablePath: executablePath(),
    args: headless ? [] : ['--start-maximized'],
  });
  const context = await browser.newContext({
    storageState: hasState() ? STATE_PATH : undefined,
    viewport: headless ? { width: 1280, height: 900 } : null,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  });
  context.on('close', () => browser.close().catch(() => {}));
  return context;
}

async function firstPage(context) {
  return context.pages()[0] || context.newPage();
}

module.exports = { openBrowser, firstPage, hasState, STATE_PATH };
