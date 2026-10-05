# Starts Quantum Sculpting. Keep this file ASCII-only (Windows PowerShell 5.1).
#
# The Python environment lives in %USERPROFILE%\.quantum-sculpting\venv, outside
# OneDrive, so thousands of package files are not synced between machines.
# On a new machine the first run recreates it from requirements.txt.
param(
    [switch]$NoBrowser,
    [int]$Port = 8765
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$homeDir = Join-Path $env:USERPROFILE ".quantum-sculpting"
$oldHome = Join-Path $env:USERPROFILE ".quantum-cup"
if ((Test-Path $oldHome) -and -not (Test-Path $homeDir)) {
    # The project used to be called Quantum cup: carry the environment and the saved key over.
    Rename-Item $oldHome $homeDir
}
$venv = Join-Path $homeDir "venv"
$py = Join-Path $venv "Scripts\python.exe"
$req = Join-Path $root "requirements.txt"
$stamp = Join-Path $homeDir "requirements.sha256"

if (-not (Test-Path $py)) {
    Write-Host "First run: creating the Python environment in $venv"
    New-Item -ItemType Directory -Force $homeDir | Out-Null
    python -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw "Could not create the Python environment. Is Python 3.10+ installed?" }
}

$hash = (Get-FileHash $req -Algorithm SHA256).Hash
$installed = ""
if (Test-Path $stamp) { $installed = (Get-Content $stamp -Raw).Trim() }
if ($hash -ne $installed) {
    Write-Host "Installing packages (a few minutes the first time)..."
    & $py -m pip install --disable-pip-version-check -r $req
    if ($LASTEXITCODE -ne 0) { throw "Package installation failed. Check your connection and run this again." }
    Set-Content -Path $stamp -Value $hash -Encoding ascii
}

# The redesigned interface (web\) is served from app\static\studio once it is built. Rebuild it
# when its sources changed and the tools are already set up; build-web.bat sets them up once.
$buildWeb = Join-Path $root "build-web.ps1"
if ((Test-Path $buildWeb) -and (Test-Path (Join-Path $root "web\package.json"))) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $buildWeb -IfChanged -NoDownload
    if ($LASTEXITCODE -ne 0) { Write-Host "The interface could not be rebuilt; serving what was built before." }
}

$serverArgs = @((Join-Path $root "app\server.py"), "--port", $Port)
if (-not $NoBrowser) { $serverArgs += "--open" }
& $py @serverArgs
exit $LASTEXITCODE
