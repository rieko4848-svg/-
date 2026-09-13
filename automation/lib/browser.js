const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const AUTH_DIR = path.join(__dirname, '..', '.auth');
// 普通のブラウザと同じく、ログイン情報をこのフォルダに置いたまま使い回す。
// 「ログインできたか」を判定して保存する必要がなくなる。
const PROFILE_DIR = path.join(AUTH_DIR, 'profile');
// ブラウザを閉じると消える種類の Cookie があるため、別途控えておいて復元する。
const COOKIE_PATH = path.join(AUTH_DIR, 'note-cookies.json');

// Playwright 同梱版と別ビルドの Chromium しか無い環境向け。
function executablePath() {
  const p = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  return p && fs.existsSync(p) ? p : undefined;
}

// 一度でもログインしたことがあるか。
function hasProfile() {
  if (fs.existsSync(COOKIE_PATH)) return true;
  try {
    return fs.readdirSync(PROFILE_DIR).length > 0;
  } catch {
    return false;
  }
}

// ログイン直後に呼び、Cookie を控える。
async function saveCookies(context) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { cookies } = await context.storageState();
  fs.writeFileSync(COOKIE_PATH, JSON.stringify({ cookies }, null, 2));
  return { path: COOKIE_PATH, count: cookies.length };
}

// maximized: 画面いっぱいに開く。画像認証など、下まで見えないと操作できないものがあるため。
async function openBrowser({ headless = true, maximized = false, slowMo = 0 } = {}) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const big = maximized && !headless;
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    slowMo,
    executablePath: executablePath(),
    args: big ? ['--start-maximized'] : [],
    viewport: big ? null : { width: 1280, height: 900 },
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  });

  // 控えておいた Cookie を戻す。プロファイルに残っていれば上書きされるだけで害はない。
  try {
    if (fs.existsSync(COOKIE_PATH)) {
      const { cookies } = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf8'));
      if (cookies && cookies.length) await context.addCookies(cookies);
    }
  } catch { /* 壊れていても続行する */ }

  return context;
}

// 開いているタブがあれば使い、無ければ新しく開く。
async function firstPage(context) {
  return context.pages()[0] || context.newPage();
}

module.exports = { openBrowser, firstPage, hasProfile, saveCookies, PROFILE_DIR, COOKIE_PATH };
