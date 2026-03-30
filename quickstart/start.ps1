# Quick start: Scan (4000) + Backend (8000) + Frontend (production build)
# Run from project root or quickstart folder.
# Usage: .\start.ps1  or  powershell -ExecutionPolicy Bypass -File start.ps1

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
$PidFile = Join-Path $ScriptDir ".dev-pids"
$LogDir = Join-Path $ScriptDir "logs"

# Ensure log directory exists
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

# Clean up any existing PIDs from previous run
if (Test-Path $PidFile) { Remove-Item $PidFile -Force }
$pids = @()

Write-Host "Project root: $ProjectRoot"
Write-Host ""

# Default start Celery for scheduled monitor checks; set CELERY_START=0 to use in-process dispatch instead.
$celeryStart = if ($env:CELERY_START -eq "0") { "0" } else { "1" }
$monitorInlineDispatch = if ($celeryStart -eq "1") { "0" } else { "1" }

function Test-PortInUse {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return ($null -ne $conn -and $conn.Count -gt 0)
}

function Test-HttpReady {
    param([int]$Port, [int]$MaxWaitSeconds = 15)
    $uri = "http://127.0.0.1:$Port/"
    for ($i = 0; $i -lt $MaxWaitSeconds; $i++) {
        try {
            $r = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            return $true
        } catch { Start-Sleep -Seconds 1 }
    }
    return $false
}

# Check if Scan service (4000) already running
if (Test-PortInUse -Port 4000) {
    Write-Host "[SKIP] Scan service already running on port 4000"
} else {
    Write-Host "[START] Scan service (Node.js :4000)..."
    $scanLog = Join-Path $LogDir "scan.log"
    $scanDir = Join-Path $ProjectRoot "backend\scan"
    $proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "cd /d `"$scanDir`" && node server.js >> `"$scanLog`" 2>&1" -NoNewWindow -PassThru
    $pids += $proc.Id
    Start-Sleep -Seconds 4
    Write-Host "  -> Scan service started (log: $scanLog)"
}

# Check if backend (8000) already running
if (Test-PortInUse -Port 8000) {
    Write-Host "[SKIP] Backend already running on port 8000"
} else {
    Write-Host "[START] Backend (uvicorn :8000)..."
    $backendLog = Join-Path $LogDir "backend.log"
    $backendDir = Join-Path $ProjectRoot "backend"
    # Use set "VAR=value" to avoid trailing space (uv rejects "copy ")
    $proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "cd /d `"$backendDir`" && set `"UV_LINK_MODE=copy`" && set `"MONITOR_INLINE_DISPATCH=$monitorInlineDispatch`" && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 >> `"$backendLog`" 2>&1" -NoNewWindow -PassThru
    $pids += $proc.Id
    Start-Sleep -Seconds 2
    Write-Host "  -> Backend started (log: $backendLog)"
}

# Check if frontend (3000) already running and responding
$frontendLog = Join-Path $LogDir "frontend.log"
$buildCmd = if (Get-Command pnpm -ErrorAction SilentlyContinue) { "pnpm" } else { "npm" }

if (Test-PortInUse -Port 3000) {
    if (Test-HttpReady -Port 3000 -MaxWaitSeconds 3) {
        Write-Host "[SKIP] Frontend already running on port 3000"
    } else {
        Write-Host "[FIX] Port 3000 in use but not responding - restarting frontend..."
        foreach ($conn in (Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue)) {
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
    }
}

if (-not (Test-PortInUse -Port 3000)) {
    Write-Host "[CLEAN] Removing stale .next..."
    $nextDir = Join-Path $ProjectRoot ".next"
    if (Test-Path $nextDir) { Remove-Item $nextDir -Recurse -Force }
    Write-Host "[BUILD] Building frontend (avoids dev-server chunk 404 on external drives)..."
    $buildScript = "cd /d `"$ProjectRoot`" && $buildCmd run build > `"$frontendLog`" 2>&1"
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $buildScript -Wait -NoNewWindow
    Write-Host "[START] Frontend ($buildCmd start :3000)..."
    $frontendScript = "cd /d `"$ProjectRoot`" && $buildCmd start >> `"$frontendLog`" 2>&1"
    $proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $frontendScript -NoNewWindow -PassThru
    $pids += $proc.Id
    if (Test-HttpReady -Port 3000 -MaxWaitSeconds 20) {
        Write-Host "  -> Frontend ready (log: $frontendLog)"
    } else {
        Write-Host "  -> Frontend process started but may not be ready yet. Try: http://127.0.0.1:3000"
        Write-Host "     If connection refused, check: $frontendLog"
    }
}

# Celery worker + beat (monitor scheduler)
if ($celeryStart -eq "1") {
    $backendDir = Join-Path $ProjectRoot "backend"
    $celeryWorkerLog = Join-Path $LogDir "celery-worker.log"
    $celeryBeatLog = Join-Path $LogDir "celery-beat.log"
    Write-Host "[START] Celery worker (scan + monitor tasks)..."
    $procW = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "cd /d `"$backendDir`" && set `"UV_LINK_MODE=copy`" && uv run celery -A app.core.celery_app.celery_app worker --loglevel=info >> `"$celeryWorkerLog`" 2>&1" -NoNewWindow -PassThru
    $pids += $procW.Id
    Write-Host "[START] Celery beat (dispatch monitor checks every 10s)..."
    $procB = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "cd /d `"$backendDir`" && set `"UV_LINK_MODE=copy`" && uv run celery -A app.core.celery_app.celery_app beat --loglevel=info >> `"$celeryBeatLog`" 2>&1" -NoNewWindow -PassThru
    $pids += $procB.Id
    Write-Host "  -> Celery logs: $celeryWorkerLog , $celeryBeatLog"
}

# Save PIDs for stop script
if ($pids.Count -gt 0) {
    $pids | Out-File -FilePath $PidFile -Encoding utf8
}

Write-Host ""
Write-Host "Done. Scan: http://localhost:4000  |  Backend: http://localhost:8000  |  Frontend: http://localhost:3000"
if ($celeryStart -eq "1") {
    Write-Host "Celery worker+beat started (monitor intervals enforced)."
} else {
    Write-Host "Celery skipped: backend uses MONITOR_INLINE_DISPATCH=1. Set CELERY_START=1 for Celery."
}
Write-Host "To stop: .\stop.ps1 (or .\quickstart\stop.ps1 from project root)"
