# N2Store Print Bridge (PowerShell — KHONG can cai Node, dung san tren Windows).
# Nghe HTTP localhost:17777, nhan lenh ESC/POS tu trinh duyet roi mo TCP toi
# may in mang IP:9100. Tuong duong scripts/print-bridge.js nhung khong can Node.
# Chay an (khong cua so): qua run-hidden.vbs do file .bat cai dat tao ra.

$ErrorActionPreference = 'Stop'
$port = 17777
$VERSION = 'ps-1.1.0'

# ponytail: bridge co the lo ra Internet qua cloudflared tunnel (in tu DT/PC khac) ->
# chan SSRF: chi cho relay toi may in mang NOI BO (IP private) + CONG may in. Hostname
# (khong phai IP literal) = admin tu cau hinh -> cho qua. Upgrade: them x-print-token.
$PRINTER_PORTS = @(9100, 9101, 9102, 9103, 9104, 9105, 9106, 9107, 9108, 9109, 515, 631, 6101, 9200)
function Test-Target($ip, $prt) {
    if ($PRINTER_PORTS -notcontains [int]$prt) { throw "Cong $prt khong phai cong may in (chi 9100...)" }
    if ($ip -match '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$') {
        $o = $ip.Split('.') | ForEach-Object { [int]$_ }
        $priv = ($o[0] -eq 10) -or ($o[0] -eq 127) -or `
            ($o[0] -eq 192 -and $o[1] -eq 168) -or `
            ($o[0] -eq 169 -and $o[1] -eq 254) -or `
            ($o[0] -eq 172 -and $o[1] -ge 16 -and $o[1] -le 31)
        if (-not $priv) { throw "IP cong khai $ip bi chan (chi in may in noi bo)" }
    }
}

function Send-Http($stream, $status, $bodyStr) {
    $body = [System.Text.Encoding]::UTF8.GetBytes($bodyStr)
    $h = "HTTP/1.1 $status`r`n"
    $h += "Content-Type: application/json`r`n"
    $h += "Access-Control-Allow-Origin: *`r`n"
    $h += "Access-Control-Allow-Methods: GET,POST,OPTIONS`r`n"
    $h += "Access-Control-Allow-Headers: Content-Type`r`n"
    $h += "Access-Control-Allow-Private-Network: true`r`n"
    $h += "Content-Length: $($body.Length)`r`n"
    $h += "Connection: close`r`n`r`n"
    $hb = [System.Text.Encoding]::ASCII.GetBytes($h)
    $stream.Write($hb, 0, $hb.Length)
    if ($body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
    $stream.Flush()
}

# Mo TCP toi may in, ghi bytes (timeout 6s). $bytes = $null -> chi test ket noi.
function Send-Printer($ip, $prt, $bytes) {
    Test-Target $ip $prt
    $tcp = New-Object System.Net.Sockets.TcpClient
    $iar = $tcp.BeginConnect($ip, [int]$prt, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne(6000, $false)) {
        $tcp.Close()
        throw "Timeout ket noi may in $($ip):$($prt)"
    }
    $tcp.EndConnect($iar)
    if ($bytes -and $bytes.Length -gt 0) {
        $ns = $tcp.GetStream()
        $ns.Write($bytes, 0, $bytes.Length)
        $ns.Flush()
        Start-Sleep -Milliseconds 200
    }
    $tcp.Close()
}

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
$listener.Start()
Write-Host "N2Store Print Bridge ($VERSION) dang chay: http://127.0.0.1:$port"

while ($true) {
    $client = $null
    try {
        $client = $listener.AcceptTcpClient()
        $client.ReceiveTimeout = 8000
        $ns = $client.GetStream()
        # --- doc HTTP request (header + body) ---
        $ms = New-Object System.IO.MemoryStream
        $tmp = New-Object byte[] 16384
        $headerEnd = -1
        while ($headerEnd -lt 0) {
            $n = $ns.Read($tmp, 0, $tmp.Length)
            if ($n -le 0) { break }
            $ms.Write($tmp, 0, $n)
            $arr = $ms.ToArray()
            for ($i = 0; $i -le $arr.Length - 4; $i++) {
                if ($arr[$i] -eq 13 -and $arr[$i + 1] -eq 10 -and $arr[$i + 2] -eq 13 -and $arr[$i + 3] -eq 10) {
                    $headerEnd = $i + 4; break
                }
            }
            if ($ms.Length -gt 5MB) { break }
        }
        $all = $ms.ToArray()
        if ($headerEnd -lt 0) { $client.Close(); continue }
        $headerStr = [System.Text.Encoding]::ASCII.GetString($all, 0, $headerEnd)
        $lines = $headerStr -split "`r`n"
        $parts = $lines[0] -split ' '
        $method = $parts[0]
        $path = $parts[1]
        $clen = 0
        foreach ($l in $lines) { if ($l -match '^(?i)content-length:\s*(\d+)') { $clen = [int]$Matches[1] } }
        # body
        $bodyStr = ''
        if ($clen -gt 0) {
            $bodyBytes = New-Object byte[] $clen
            $have = $all.Length - $headerEnd
            if ($have -gt 0) { [Array]::Copy($all, $headerEnd, $bodyBytes, 0, [Math]::Min($have, $clen)) }
            $got = [Math]::Min($have, $clen)
            while ($got -lt $clen) {
                $n = $ns.Read($bodyBytes, $got, $clen - $got)
                if ($n -le 0) { break }
                $got += $n
            }
            $bodyStr = [System.Text.Encoding]::UTF8.GetString($bodyBytes, 0, $got)
        }

        # --- dinh tuyen ---
        if ($method -eq 'OPTIONS') {
            Send-Http $ns '204 No Content' ''
        }
        elseif ($path -eq '/health') {
            Send-Http $ns '200 OK' ('{"ok":true,"version":"' + $VERSION + '","engine":"printer"}')
        }
        elseif ($path -eq '/print' -and $method -eq 'POST') {
            try {
                $o = $bodyStr | ConvertFrom-Json
                $bytes = [System.Convert]::FromBase64String($o.b64)
                $prt = if ($o.port) { [int]$o.port } else { 9100 }
                Send-Printer $o.ip $prt $bytes
                Send-Http $ns '200 OK' '{"ok":true}'
                Write-Host "[in] da gui toi $($o.ip):$prt"
            } catch {
                Send-Http $ns '502 Bad Gateway' ('{"ok":false,"error":' + (ConvertTo-Json "$($_.Exception.Message)") + '}')
            }
        }
        elseif ($path -eq '/tcp-test' -and $method -eq 'POST') {
            try {
                $o = $bodyStr | ConvertFrom-Json
                $prt = if ($o.port) { [int]$o.port } else { 9100 }
                Send-Printer $o.ip $prt $null
                Send-Http $ns '200 OK' '{"ok":true}'
            } catch {
                Send-Http $ns '502 Bad Gateway' ('{"ok":false,"error":' + (ConvertTo-Json "$($_.Exception.Message)") + '}')
            }
        }
        else {
            Send-Http $ns '404 Not Found' '{"ok":false,"error":"not found"}'
        }
    } catch {
        # bo qua loi 1 ket noi, tiep tuc phuc vu
    } finally {
        if ($client) { try { $client.Close() } catch {} }
    }
}
