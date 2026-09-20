# LifeLine Demo - startup script
# Called by Windows Scheduled Task (runs as SYSTEM at startup)
# ASCII only on purpose: PowerShell 5.1 mis-reads UTF-8 without BOM,
# so non-ASCII text in this file would cause a parse error.

$Port = 18080
$AppDir = 'C:\LifeLine\LifeLine-Demo'

# Locate node.exe
$Node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $Node) { $Node = 'C:\Program Files\nodejs\node.exe' }

if (-not (Test-Path $Node)) {
    Write-Host "[ERROR] node.exe not found"
    exit 1
}
if (-not (Test-Path (Join-Path $AppDir 'out\index.html'))) {
    Write-Host "[ERROR] web files not found in $AppDir"
    exit 1
}

$LogDir = 'C:\LifeLine\logs'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }

Set-Location $AppDir
Write-Host "[START] port=$Port dir=$AppDir"
Write-Host "[START] log=$LogDir\demo.log"

# Run in foreground; the scheduled task handles restart and boot autostart
& $Node server.js $Port 2>&1 | Out-File -FilePath (Join-Path $LogDir 'demo.log') -Append -Encoding utf8
