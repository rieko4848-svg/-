const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const AUTH_DIR = path.join(__dirname, '..', '.auth');
const STATE_PATH = path.join(AUTH_DIR, 'note-state.json');

// このサンドボックス等、Playwright 同梱版と別ビルドの Chromium しか無い環境向け。
// PLAYWRIGHT_CHROMIUM_PATH が指すファイルが存在すればそれを使い、無ければ既定の同梱版。
function executablePath() {
  const p = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  return p && fs.existsSync(p) ? p : undefined;
}

async function launch({ headless = true, slowMo = 0 } = {}) {
  return chromium.launch({ headless, slowMo, executablePath: executablePath() });
}

function hasState() {
  return fs.existsSync(STATE_PATH);
}

async function newContext(browser, { useState = true } = {}) {
  return browser.newContext({
    storageState: useState && hasState() ? STATE_PATH : undefined,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1280, height: 900 },
  });
}

async function saveState(context) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await context.storageState({ path: STATE_PATH });
  return STATE_PATH;
}

module.exports = { launch, newContext, saveState, hasState, STATE_PATH };
