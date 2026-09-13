# ============================================================
#  note 投稿自動化：Windows セットアップ
#  必要なソフトの導入 → ファイル取得 → ログインまでを自動で行う
# ============================================================
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8

$RepoUrl = 'https://github.com/rieko4848-svg/-.git'
$Branch  = 'claude/kind-babbage-r8s7p9'
$Dest    = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'note-auto'

function Say($msg)  { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "   OK: $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "   ! $msg" -ForegroundColor Yellow }

# インストール直後のコマンドを見つけられるよう PATH を読み直す
function Update-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
              [Environment]::GetEnvironmentVariable('Path','User')
}

function Has($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

# PowerShell の実行ポリシーに阻まれないよう、npm / npx は .cmd 版を使う
function Invoke-Npm {
  param([Parameter(ValueFromRemainingArguments = $true)]$Args)
  $exe = if (Has 'npm.cmd') { 'npm.cmd' } else { 'npm' }
  & $exe @Args
  if ($LASTEXITCODE -ne 0) { throw "$exe $($Args -join ' ') が失敗しました (終了コード $LASTEXITCODE)" }
}

function Invoke-Npx {
  param([Parameter(ValueFromRemainingArguments = $true)]$Args)
  $exe = if (Has 'npx.cmd') { 'npx.cmd' } else { 'npx' }
  & $exe @Args
  if ($LASTEXITCODE -ne 0) { throw "$exe $($Args -join ' ') が失敗しました (終了コード $LASTEXITCODE)" }
}

function Ensure-Tool($cmd, $wingetId, $label, $manualUrl) {
  if (Has $cmd) { Ok "$label は導入済みです"; return }

  Say "$label を導入します（数分かかります）"
  if (-not (Has 'winget')) {
    throw "winget が使えないため自動で導入できません。$manualUrl から手動で $label を入れて、PowerShell を開き直してからもう一度実行してください。"
  }
  winget install --id $wingetId -e --source winget `
    --accept-package-agreements --accept-source-agreements
  Update-Path
  if (-not (Has $cmd)) {
    throw "$label を導入しましたが、まだ認識されていません。PowerShell を閉じて開き直し、もう一度実行してください。"
  }
  Ok "$label を導入しました"
}

Write-Host "=== note 投稿自動化のセットアップを始めます ===" -ForegroundColor White

Update-Path
Ensure-Tool 'git'  'Git.Git'          'Git'     'https://git-scm.com/download/win'
Ensure-Tool 'node' 'OpenJS.NodeJS.LTS' 'Node.js' 'https://nodejs.org/ja'

# --- ファイルを取得 ---
if (Test-Path (Join-Path $Dest '.git')) {
  Say "既存のフォルダを最新にします: $Dest"
  Push-Location $Dest
  git fetch origin $Branch
  git checkout $Branch
  git pull origin $Branch
} else {
  if (Test-Path $Dest) { throw "$Dest が既にありますが Git 管理ではありません。別名にするか削除してから再実行してください。" }
  Say "ファイルを取得します: $Dest"
  git clone --branch $Branch $RepoUrl $Dest
  Push-Location $Dest
}
Ok "ファイルを用意しました"

# --- 依存パッケージとブラウザ ---
Say "必要な部品を導入します（初回は数分かかります）"
Invoke-Npm install
Ok "部品の導入が完了しました"

Say "自動操作用のブラウザを導入します"
Invoke-Npx playwright install chromium
Ok "ブラウザの導入が完了しました"

# --- ログイン ---
Say "note のログイン画面を開きます"
Write-Host "   開いたブラウザで、ご自身で note にログインしてください。" -ForegroundColor White
Write-Host "   （このスクリプトはパスワードを一切受け取りません）" -ForegroundColor White
Invoke-Npm run note:login

Pop-Location
Write-Host "`n=== セットアップ完了 ===" -ForegroundColor Green
Write-Host "作業フォルダ: $Dest"
Write-Host "`n試しに下書き投稿するには、次の2行を順に実行してください:" -ForegroundColor White
Write-Host "  cd `"$Dest`""
Write-Host "  npm.cmd run note:post -- automation/articles/example.md --headed"
