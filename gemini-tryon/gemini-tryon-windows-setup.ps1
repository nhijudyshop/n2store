# #Note: WEB2.0 — cài + chạy nền + AUTO-START sidecar gemini-tryon (Gemini ghép đồ/ghép mặt FREE) trên máy POS (Windows). Gọi từ cai-may-pos.bat.
# Tải app.py/serve.py + requirements từ $VBase, dựng venv, cài deps, tải cloudflared,
# tạo launcher chạy ẩn (pythonw serve.py qua start.cmd) + bỏ vào Startup (tự bật khi mở máy). Idempotent.
#   port 8131, thư mục N2StoreGeminiTryon
# Sau khi chạy: mở http://localhost:8131/ để dán cookie nhiều account Google (xoay tua).
param([string]$VBase = "", [int]$Port = 8131)

$ErrorActionPreference = "Continue"
$AppName = "N2StoreGeminiTryon"; $Label = "GeminiTryon"
$DIR = Join-Path $env:LOCALAPPDATA $AppName
$STARTUP = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
New-Item -ItemType Directory -Force -Path $DIR | Out-Null

if (-not $VBase) { Write-Host "[$Label] Thieu VBase URL"; return }

# --- Tai file: app.py + serve.py + requirements.txt ---
$files = @("app.py", "serve.py", "requirements.txt")
Write-Host "[$Label] Tai file cai dat..."
foreach ($f in $files) {
    try { Invoke-WebRequest -Uri "$VBase/$f" -OutFile (Join-Path $DIR $f) -UseBasicParsing }
    catch { Write-Host "  [loi] tai $f : $($_.Exception.Message)" }
}
if (-not (Test-Path (Join-Path $DIR "serve.py"))) { Write-Host "[$Label] Khong tai duoc file - bo qua."; return }

# --- Python (winget cai neu thieu) ---
$py = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = (Get-Command py -ErrorAction SilentlyContinue).Source }
if (-not $py) {
    Write-Host "[$Label] Cai Python 3.11 (winget)..."
    try {
        Start-Process -Wait -FilePath winget -ArgumentList @(
            "install", "-e", "--id", "Python.Python.3.11", "--silent",
            "--accept-package-agreements", "--accept-source-agreements"
        )
    } catch {}
    $py = (Get-Command python -ErrorAction SilentlyContinue).Source
    if (-not $py) {
        Write-Host "[$Label] Da cai Python - CHAY LAI file cai dat de tiep tuc (PATH can refresh)."
        return
    }
}

# --- venv + thu vien ---
$venvPy = Join-Path $DIR ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) { & $py -m venv (Join-Path $DIR ".venv") }
& $venvPy -m pip install -q --upgrade pip
& $venvPy -c "import gemini_webapi,fastapi,uvicorn" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[$Label] Cai thu vien (lan dau ~1-2 phut)..."
    & $venvPy -m pip install -q -r (Join-Path $DIR "requirements.txt")
}

# --- cloudflared (cho tunnel) ---
$cf = Join-Path $DIR "cloudflared.exe"
if (-not (Test-Path $cf)) {
    try {
        Invoke-WebRequest -UseBasicParsing -OutFile $cf `
            -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    } catch { Write-Host "  [loi] tai cloudflared: $($_.Exception.Message)" }
}

# --- tat instance CU truoc khi chay lai ---
Get-CimInstance Win32_Process -Filter "Name='wscript.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$AppName*" } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch {} }

# --- launcher: start.cmd (set port) chay an qua run-hidden.vbs + auto-start ---
$startCmd = Join-Path $DIR "start.cmd"
@(
    '@echo off',
    'cd /d "%~dp0"',
    'set "PATH=%~dp0;%PATH%"',
    "set `"PORT=$Port`"",
    '".venv\Scripts\pythonw.exe" serve.py'
) | Out-File -Encoding ASCII -Force $startCmd

$vbs = Join-Path $DIR "run-hidden.vbs"
('CreateObject("WScript.Shell").Run "cmd /c ""' + $startCmd + '""", 0, False') |
    Out-File -Encoding ASCII -Force $vbs
Copy-Item -Force $vbs (Join-Path $STARTUP "$AppName.vbs")
Start-Process -FilePath wscript -ArgumentList ('"{0}"' -f $vbs)

Write-Host "[$Label] [OK] Sidecar Gemini chay nen (port $Port) + TU BAT moi khi mo may."
Write-Host "[$Label] >>> MO http://localhost:$Port/ de DAN COOKIE nhieu account Google (xoay tua) <<<"
Start-Process "http://localhost:$Port/"
