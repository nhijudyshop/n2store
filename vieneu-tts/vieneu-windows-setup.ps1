# #Note: WEB2.0 — cài + chạy nền + AUTO-START engine giọng (VieNeu HOẶC OmniVoice) trên máy POS (Windows). Gọi từ cai-may-pos.bat.
# Tải app.py/serve.py + engine_*.py + requirements từ $VBase, dựng venv, cài deps, tải cloudflared, warm-up model,
# tạo launcher chạy ẩn (pythonw serve.py qua start.cmd có env) + bỏ vào Startup (tự bật mỗi khi mở máy). Idempotent.
#   -Engine vieneu   (mặc định) — package vieneu, port 8123, thư mục N2StoreVieNeu
#   -Engine omnivoice            — package omnivoice (k2-fsa, PyTorch), port 8124, thư mục N2StoreOmniVoice
param([string]$VBase = "", [string]$Engine = "vieneu", [int]$Port = 0)

$ErrorActionPreference = "Continue"
$Engine = $Engine.ToLower()
if ($Engine -eq "omnivoice") {
    $AppName = "N2StoreOmniVoice"; $Label = "OmniVoice"; if ($Port -le 0) { $Port = 8124 }
} else {
    $Engine = "vieneu"; $AppName = "N2StoreVieNeu"; $Label = "VieNeu"; if ($Port -le 0) { $Port = 8123 }
}
$DIR = Join-Path $env:LOCALAPPDATA $AppName
$STARTUP = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
New-Item -ItemType Directory -Force -Path $DIR | Out-Null

if (-not $VBase) { Write-Host "[$Label] Thieu VBase URL"; return }

# --- Tai file: app.py + serve.py + engine_base + engine_vieneu LUON CAN (app.py import) ---
$files = @("app.py", "serve.py", "engine_base.py", "engine_vieneu.py")
if ($Engine -eq "omnivoice") { $files += @("engine_omnivoice.py", "requirements-omnivoice.txt") }
else { $files += @("requirements.txt") }
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

# --- venv + thu vien (rieng tung engine vi $DIR khac nhau) ---
$venvPy = Join-Path $DIR ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) { & $py -m venv (Join-Path $DIR ".venv") }
& $venvPy -m pip install -q --upgrade pip
if ($Engine -eq "omnivoice") {
    & $venvPy -c "import omnivoice,torch,fastapi,uvicorn" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[OmniVoice] Cai PyTorch + OmniVoice (lan dau ~vai GB, cho lau)..."
        & $venvPy -m pip install -q torch torchaudio
        & $venvPy -m pip install -q -r (Join-Path $DIR "requirements-omnivoice.txt")
    }
} else {
    & $venvPy -c "import vieneu,fastapi,uvicorn" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[VieNeu] Cai thu vien (lan dau ~vai phut)..."
        & $venvPy -m pip install -q -r (Join-Path $DIR "requirements.txt")
    }
}

# --- ffmpeg cho pydub (omnivoice phu thuoc) — bundle qua imageio-ffmpeg, copy thanh
#     ffmpeg.exe trong $DIR (start.cmd them vao PATH) → het canh bao "Couldn't find ffmpeg". ---
if ($Engine -eq "omnivoice") {
    & $venvPy -m pip install -q imageio-ffmpeg 2>$null
    try {
        $ff = & $venvPy -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())" 2>$null
        if ($ff -and (Test-Path $ff)) {
            Copy-Item -Force $ff (Join-Path $DIR "ffmpeg.exe")
            Write-Host "[OmniVoice] ffmpeg san sang (pydub se khong con bao thieu)."
        }
    } catch { Write-Host "  [canh bao] khong chuan bi duoc ffmpeg: $($_.Exception.Message)" }
}

# --- cloudflared (cho dien thoai) ---
$cf = Join-Path $DIR "cloudflared.exe"
if (-not (Test-Path $cf)) {
    try {
        Invoke-WebRequest -UseBasicParsing -OutFile $cf `
            -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    } catch { Write-Host "  [loi] tai cloudflared: $($_.Exception.Message)" }
}

# --- warm-up model (chay trong $DIR de import engine_* duoc) ---
Push-Location $DIR
if ($Engine -eq "omnivoice") {
    Write-Host "[OmniVoice] Tai model giong (lan dau ~vai GB, vui long cho)..."
    & $venvPy -c "from engine_omnivoice import OmniVoiceEngine; OmniVoiceEngine().load(); print('model ready')"
} else {
    Write-Host "[VieNeu] Tai model giong (lan dau ~595MB, vui long cho)..."
    & $venvPy -c "from vieneu import Vieneu; Vieneu(); print('model ready')"
}
Pop-Location

# --- tat instance CU cua DUNG engine nay (truoc khi chay lai) ---
Get-CimInstance Win32_Process -Filter "Name='wscript.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$AppName*" } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch {} }

# --- launcher: start.cmd (set env engine+port) chay an qua run-hidden.vbs + auto-start ---
$startCmd = Join-Path $DIR "start.cmd"
@(
    '@echo off',
    'cd /d "%~dp0"',
    'set "PATH=%~dp0;%PATH%"',
    "set `"TTS_ENGINE=$Engine`"",
    "set `"PORT=$Port`"",
    '".venv\Scripts\pythonw.exe" serve.py'
) | Out-File -Encoding ASCII -Force $startCmd

$vbs = Join-Path $DIR "run-hidden.vbs"
('CreateObject("WScript.Shell").Run "cmd /c ""' + $startCmd + '""", 0, False') |
    Out-File -Encoding ASCII -Force $vbs
Copy-Item -Force $vbs (Join-Path $STARTUP "$AppName.vbs")
Start-Process -FilePath wscript -ArgumentList ('"{0}"' -f $vbs)
Write-Host "[$Label] [OK] Giong $Label chay nen (port $Port) + TU BAT moi khi mo may. May tu hien tren trang Tao video."
