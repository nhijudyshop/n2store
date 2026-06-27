# #Note: WEB2.0 — cài + chạy nền + AUTO-START sidecar gemini-tryon (Gemini ghép đồ/ghép mặt FREE) trên máy POS (Windows). Gọi từ cai-may-pos.bat.
# Tải app.py/serve.py + requirements từ $VBase, dựng venv, cài deps, tải cloudflared,
# tạo launcher chạy ẩn (pythonw serve.py qua start.cmd) + bỏ vào Startup (tự bật khi mở máy). Idempotent.
#   port 8131, thư mục N2StoreGeminiTryon
# Sau khi chạy: mở http://localhost:8131/ để dán cookie nhiều account Google (xoay tua).
param([string]$VBase = "", [int]$Port = 8131)

$ErrorActionPreference = "Continue"
# Hien thi tieng Viet + emoji dung (tranh mojibake khi Write-Host / doc log UTF-8).
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$OutputEncoding = [System.Text.Encoding]::UTF8
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

# --- tat instance CU truoc khi chay lai: wscript launcher + python/pythonw serve.py + cloudflared
#     cua DUNG thu muc nay (tranh ket cong 8131 khi cai lai do tien trinh cu con song). ---
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -and (
            $_.CommandLine -like "*$DIR*" -or
            ($_.Name -eq 'wscript.exe' -and $_.CommandLine -like "*$AppName*")
        )
    } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch {} }
Start-Sleep -Seconds 1

# --- launcher: start.cmd (set port + GHI LOG) chay an qua run-hidden.vbs + auto-start ---
#     pythonw nuot output → redirect ra gemini-tryon.log de DEBUG khi server khong len.
$logFile = Join-Path $DIR "gemini-tryon.log"
$startCmd = Join-Path $DIR "start.cmd"
@(
    '@echo off',
    'cd /d "%~dp0"',
    'set "PATH=%~dp0;%PATH%"',
    "set `"PORT=$Port`"",
    'set "PYTHONUNBUFFERED=1"',
    'set "PYTHONIOENCODING=utf-8"',
    '".venv\Scripts\pythonw.exe" serve.py > "gemini-tryon.log" 2>&1'
) | Out-File -Encoding ASCII -Force $startCmd

$vbs = Join-Path $DIR "run-hidden.vbs"
('CreateObject("WScript.Shell").Run "cmd /c ""' + $startCmd + '""", 0, False') |
    Out-File -Encoding ASCII -Force $vbs
Copy-Item -Force $vbs (Join-Path $STARTUP "$AppName.vbs")
Start-Process -FilePath wscript -ArgumentList ('"{0}"' -f $vbs)

# --- DEBUG: kiem tra server co thuc su LEN khong (toi da 30s) + in log loi neu khong ---
Write-Host "[$Label] Dang kiem tra server len (toi da 30s)..."
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$Port/health" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch {}
}
if ($ok) {
    Write-Host "[$Label] [OK] Server LEN tai http://localhost:$Port/ + TU BAT moi khi mo may."
    Write-Host "[$Label] >>> MO http://localhost:$Port/ de DAN COOKIE nhieu account Google (xoay tua) <<<"
    Start-Process "http://localhost:$Port/"
} else {
    Write-Host ""
    Write-Host "[$Label] [LOI] Server KHONG LEN sau 30s. ==== LOG LOI (gui anh nay de sua) ===="
    Write-Host "------------------------------------------------------------"
    if (Test-Path $logFile) { Get-Content $logFile -Tail 30 -Encoding UTF8 | ForEach-Object { Write-Host "  $_" } }
    else { Write-Host "  (chua co gemini-tryon.log - launcher chua chay duoc)" }
    Write-Host "------------------------------------------------------------"
    Write-Host "[$Label] Log day du o: $logFile"
    Write-Host "[$Label] Python: $venvPy"
}
