# #Note: Doc CLAUDE.md, MEMORY.md, docs/dev-log.md truoc khi code. Cap nhat dev-log sau thay doi. | WEB2.0 — tunnel cloudflared cho Camera Bridge.
# N2Store Camera TUNNEL (PowerShell, KHONG can Node).
# Mo cloudflared tunnel HTTPS -> camera-bridge localhost:8141 roi BAO DANH (heartbeat)
# URL len registry (engine='camera'). Trang doi soat (web2-evidence-camera.js) tu do ra URL
# nay -> may khac cung chup anh qua tunnel. Cung may thi da co loopback http://127.0.0.1:8141.
#
# Tunnel URL ngau nhien (*.trycloudflare.com), tu doi moi lan chay -> heartbeat 15s,
# registry TTL 90s tu xoa URL chet. cloudflared rot -> tu khoi dong lai.
# Mirror print-tunnel.ps1.

param(
    [int]$Port = 8141,
    [string]$Registry = "https://chatomni-proxy.nhijudyshop.workers.dev/api/web2-vieneu-registry"
)
$ErrorActionPreference = 'Continue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$Name = "$env:COMPUTERNAME (Camera doi soat)"

# cloudflared: ben canh script -> trong PATH.
$cf = Join-Path $PSScriptRoot 'cloudflared.exe'
if (-not (Test-Path $cf)) {
    $inPath = (Get-Command cloudflared.exe -ErrorAction SilentlyContinue).Source
    if ($inPath) { $cf = $inPath }
}
if (-not (Test-Path $cf)) {
    Write-Host "[camera-tunnel] Chua co cloudflared.exe -> bo qua tunnel (chi chup anh tren chinh may nay qua localhost)."
    return
}

function Send-Beat($url) {
    try {
        $body = @{ name = $Name; url = $url; engine = 'camera'; note = 'camera' } | ConvertTo-Json -Compress
        Invoke-RestMethod -Uri "$Registry/register" -Method Post -Body $body `
            -ContentType 'application/json' -TimeoutSec 8 -UserAgent 'camera-tunnel/1.0' | Out-Null
    } catch {}
}

while ($true) {
    $logOut = Join-Path $env:TEMP 'n2s-camera-tunnel.out.log'
    $logErr = Join-Path $env:TEMP 'n2s-camera-tunnel.err.log'
    Remove-Item $logOut, $logErr -ErrorAction SilentlyContinue
    $p = $null
    try {
        $p = Start-Process -FilePath $cf -PassThru -WindowStyle Hidden `
            -ArgumentList @('tunnel', '--url', "http://localhost:$Port") `
            -RedirectStandardOutput $logOut -RedirectStandardError $logErr
    } catch {
        Write-Host "[camera-tunnel] Khong chay duoc cloudflared: $($_.Exception.Message) -> thu lai 5s"
        Start-Sleep -Seconds 5
        continue
    }

    $url = $null
    $sinceBeat = 999
    for ($i = 0; $i -lt 100000; $i++) {
        Start-Sleep -Seconds 1
        if ($p.HasExited) { break }
        if (-not $url) {
            foreach ($lf in @($logErr, $logOut)) {
                if (Test-Path $lf) {
                    $m = Select-String -Path $lf -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
                    if ($m) { $url = $m.Matches[0].Value; break }
                }
            }
            if ($url) {
                Write-Host "[camera-tunnel] Tunnel ONLINE: $url"
                Send-Beat $url; $sinceBeat = 0
            }
        }
        elseif ($sinceBeat -ge 15) { Send-Beat $url; $sinceBeat = 0 }
        $sinceBeat++
    }

    try { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force } } catch {}
    Write-Host "[camera-tunnel] cloudflared RoT -> tu khoi dong lai sau 3s..."
    Start-Sleep -Seconds 3
}
