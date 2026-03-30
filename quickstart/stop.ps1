# Quick stop: Kill Scan (4000), Backend (8000), Frontend (3000/3001/3002)
# Usage: .\stop.ps1  or  powershell -ExecutionPolicy Bypass -File stop.ps1

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $ScriptDir ".dev-pids"
$killedAny = $false

# Kill by port (most reliable; handles child processes)
foreach ($port in @(4000, 8000, 3000, 3001, 3002)) {
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
        $procId = $conn.OwningProcess
        if ($procId -gt 0) {
            Write-Host "[STOP] Killing process on port $port (PID: $procId)"
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            $killedAny = $true
        }
    }
}

# Also kill any PIDs we recorded (backup)
if (Test-Path $PidFile) {
    Get-Content $PidFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -match '^\d+$') {
            $pidNum = [int]$line
            if (Get-Process -Id $pidNum -ErrorAction SilentlyContinue) {
                Write-Host "[STOP] Killing recorded PID $pidNum"
                Stop-Process -Id $pidNum -Force -ErrorAction SilentlyContinue
                $killedAny = $true
            }
        }
    }
    Remove-Item $PidFile -Force
}

if (-not $killedAny) {
    Write-Host "No Scan, backend, or frontend processes found on ports 4000, 8000, 3000-3002."
} else {
    Write-Host "Done. Scan, backend, and frontend stopped."
}
