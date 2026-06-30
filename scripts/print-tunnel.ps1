# #Note: Doc CLAUDE.md, MEMORY.md, docs/dev-log.md truoc khi code. Cap nhat dev-log sau thay doi. | WEB2.0 — tunnel cloudflared cho Print Bridge.
# N2Store Print TUNNEL (PowerShell, KHONG can Node).
# Mo cloudflared tunnel HTTPS -> print-bridge localhost:17777 roi BAO DANH (heartbeat)
# URL len registry (engine='printer'). Web 2.0 (web2-printer.js) tu do ra URL nay ->
# DT/PC khac IN duoc qua tunnel ma KHONG can chay Print Bridge tren may do.
#
# Tunnel URL ngau nhien (*.trycloudflare.com), tu doi moi lan chay lai -> heartbeat 15s,
# registry TTL 90s tu xoa URL chet. cloudflared rot -> tu khoi dong lai (URL moi).
# Chay an (khong cua so): qua run-tunnel-hidden.vbs do cai-may-pos.bat tao + auto-start.

param(
    [int]$Port = 17777,
    [string]$Registry = "https://chatomni-proxy.nhijudyshop.workers.dev/api/web2-vieneu-registry"
)
$ErrorActionPreference = 'Continue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$Name = "$env:COMPUTERNAME (May in)"

# cloudflared: ben canh script -> trong PATH.
$cf = Join-Path $PSScriptRoot 'cloudflared.exe'
if (-not (Test-Path $cf)) {
    $inPath = (Get-Command cloudflared.exe -ErrorAction SilentlyContinue).Source
    if ($inPath) { $cf = $inPath }
}
if (-not (Test-Path $cf)) {
    Write-Host "[print-tunnel] Chua co cloudflared.exe -> bo qua tunnel (chi in tren chinh may nay)."
    return
}

function Send-Beat($url) {
    try {
        $body = @{ name = $Name; url = $url; engine = 'printer'; note = 'printer' } | ConvertTo-Json -Compress
        Invoke-RestMethod -Uri "$Registry/register" -Method Post -Body $body `
            -ContentType 'application/json' -TimeoutSec 8 -UserAgent 'print-tunnel/1.0' | Out-Null
    } catch {}
}

while ($true) {
    $logOut = Join-Path $env:TEMP 'n2s-print-tunnel.out.log'
    $logErr = Join-Path $env:TEMP 'n2s-print-tunnel.err.log'
    Remove-Item $logOut, $logErr -ErrorAction SilentlyContinue
    $p = $null
    try {
        $p = Start-Process -FilePath $cf -PassThru -WindowStyle Hidden `
            -ArgumentList @('tunnel', '--url', "http://localhost:$Port") `
            -RedirectStandardOutput $logOut -RedirectStandardError $logErr
    } catch {
        Write-Host "[print-tunnel] Khong chay duoc cloudflared: $($_.Exception.Message) -> thu lai 5s"
        Start-Sleep -Seconds 5
        continue
    }

    $url = $null
    $sinceBeat = 999
    for ($i = 0; $i -lt 100000; $i++) {
        Start-Sleep -Seconds 1
        if ($p.HasExited) { break }
        if (-not $url) {
            # cloudflared in URL ra stderr (banner) -> quet ca 2 file.
            foreach ($lf in @($logErr, $logOut)) {
                if (Test-Path $lf) {
                    $m = Select-String -Path $lf -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
                    if ($m) { $url = $m.Matches[0].Value; break }
                }
            }
            if ($url) {
                Write-Host "[print-tunnel] Tunnel ONLINE: $url"
                Send-Beat $url; $sinceBeat = 0
            }
        }
        elseif ($sinceBeat -ge 15) { Send-Beat $url; $sinceBeat = 0 }
        $sinceBeat++
    }

    try { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force } } catch {}
    Write-Host "[print-tunnel] cloudflared RoT -> tu khoi dong lai sau 3s..."
    Start-Sleep -Seconds 3
}
