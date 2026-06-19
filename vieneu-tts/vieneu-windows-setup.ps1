# #Note: WEB2.0 — cài + chạy nền + AUTO-START Giọng VieNeu trên máy POS (Windows). Gọi từ bat printer-settings.
# Tải app.py/serve.py/requirements.txt từ $VBase, dựng venv, cài deps, tải cloudflared, warm-up model,
# tạo launcher chạy ẩn (pythonw serve.py) + bỏ vào Startup folder (tự bật mỗi khi mở máy). Idempotent.
param([string]$VBase = "")

$ErrorActionPreference = "Continue"
$DIR = Join-Path $env:LOCALAPPDATA "N2StoreVieNeu"
$STARTUP = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
New-Item -ItemType Directory -Force -Path $DIR | Out-Null

if (-not $VBase) { Write-Host "[VieNeu] Thieu VBase URL"; return }

Write-Host "[VieNeu] Tai file cai dat..."
foreach ($f in @("app.py", "serve.py", "requirements.txt")) {
    try { Invoke-WebRequest -Uri "$VBase/$f" -OutFile (Join-Path $DIR $f) -UseBasicParsing }
    catch { Write-Host "  [loi] tai $f : $($_.Exception.Message)" }
}
if (-not (Test-Path (Join-Path $DIR "serve.py"))) { Write-Host "[VieNeu] Khong tai duoc file — bo qua."; return }

# --- Python (winget cai neu thieu) ---
$py = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = (Get-Command py -ErrorAction SilentlyContinue).Source }
if (-not $py) {
    Write-Host "[VieNeu] Cai Python 3.11 (winget)..."
    try {
        Start-Process -Wait -FilePath winget -ArgumentList @(
            "install", "-e", "--id", "Python.Python.3.11", "--silent",
            "--accept-package-agreements", "--accept-source-agreements"
        )
    } catch {}
    $py = (Get-Command python -ErrorAction SilentlyContinue).Source
    if (-not $py) {
        Write-Host "[VieNeu] Da cai Python — CHAY LAI file cai dat de tiep tuc (PATH can refresh)."
        return
    }
}

# --- venv + thu vien ---
$venvPy = Join-Path $DIR ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) { & $py -m venv (Join-Path $DIR ".venv") }
& $venvPy -m pip install -q --upgrade pip
& $venvPy -c "import vieneu,fastapi,uvicorn" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[VieNeu] Cai thu vien (lan dau ~vai phut)..."
    & $venvPy -m pip install -q -r (Join-Path $DIR "requirements.txt")
}

# --- cloudflared (cho dien thoai) ---
$cf = Join-Path $DIR "cloudflared.exe"
if (-not (Test-Path $cf)) {
    try {
        Invoke-WebRequest -UseBasicParsing -OutFile $cf `
            -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    } catch { Write-Host "  [loi] tai cloudflared: $($_.Exception.Message)" }
}

# --- warm-up model (hien tien do lan dau ~595MB) ---
Write-Host "[VieNeu] Tai model giong (lan dau ~595MB, vui long cho)..."
& $venvPy -c "from vieneu import Vieneu; Vieneu(); print('model ready')"

# --- tat instance cu (truoc khi chay lai) ---
Get-CimInstance Win32_Process -Filter "Name='wscript.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*N2StoreVieNeu*' } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch {} }

# --- launcher chay an (pythonw serve.py) + auto-start ---
$pyw = Join-Path $DIR ".venv\Scripts\pythonw.exe"
$serve = Join-Path $DIR "serve.py"
$cmd = ('"{0}" "{1}"' -f $pyw, $serve) -replace '"', '""'
$vbsLine = 'CreateObject("WScript.Shell").Run "' + $cmd + '", 0, False'
$vbs = Join-Path $DIR "run-hidden.vbs"
$vbsLine | Out-File -Encoding ASCII -Force $vbs
Copy-Item -Force $vbs (Join-Path $STARTUP "N2StoreVieNeu.vbs")
Start-Process -FilePath wscript -ArgumentList ('"{0}"' -f $vbs)
Write-Host "[VieNeu] [OK] Giong VieNeu chay nen + TU BAT moi khi mo may. May tu hien tren trang Tao video."
