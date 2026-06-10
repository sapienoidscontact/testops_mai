$ErrorActionPreference = "SilentlyContinue"

$root   = Split-Path $PSScriptRoot -Parent
$logDir = "$env:TEMP\MAI01"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

# ── Kill stale processes on MAI ports ────────────────────────────────────────
foreach ($port in @(3001, 3000)) {
    Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
        ForEach-Object {
            $p = $_.OwningProcess
            if ($p -gt 4) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
        }
}
Start-Sleep -Milliseconds 500

# ── Start API / orchestrator (port 3001, nodemon hot-reload) ─────────────────
# nodemon.CMD is the hoisted bin — works from cmd.exe without needing pnpm
Start-Process -FilePath "cmd" `
    -ArgumentList "/c node_modules\.bin\nodemon.CMD --experimental-vm-modules core\orchestrator\index.js" `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput "$logDir\api.log" `
    -RedirectStandardError  "$logDir\api-err.log"

# ── Start Next.js web (port 3000, hot-reload on every .jsx/.tsx save) ────────
Start-Process -FilePath "cmd" `
    -ArgumentList "/c node_modules\.bin\next.CMD dev -p 3000" `
    -WorkingDirectory "$root\apps\web" `
    -WindowStyle Hidden `
    -RedirectStandardOutput "$logDir\web.log" `
    -RedirectStandardError  "$logDir\web-err.log"

# ── Wait for orchestrator /health (up to 60 s) ───────────────────────────────
$deadline = (Get-Date).AddSeconds(60)
do {
    Start-Sleep -Milliseconds 800
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:3001/health" `
            -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
        if ($r.StatusCode -eq 200) { break }
    } catch {}
} while ((Get-Date) -lt $deadline)

# ── Wait for Next.js (port 3000 listening, up to 60 s) ───────────────────────
$deadline = (Get-Date).AddSeconds(60)
do {
    Start-Sleep -Milliseconds 800
    $conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
} while (-not $conn -and (Get-Date) -lt $deadline)

Start-Sleep -Milliseconds 1000

# ── Open browser ──────────────────────────────────────────────────────────────
Start-Process "http://localhost:3000/mai0.1"
