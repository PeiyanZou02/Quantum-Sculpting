# Builds the Quantum Sculptor interface (web\) into app\static\studio.
# Keep this file ASCII-only (Windows PowerShell 5.1).
#
# Node, pnpm and node_modules live in %USERPROFILE%\.quantum-sculpting, outside OneDrive, for
# the same reason as the Python environment: tens of thousands of small files must not be
# synced. The sources are mirrored there and built; only the finished build (a handful of
# files) is copied back into the project.
#
# If neither a private Node nor node + pnpm on PATH is found, the current Node LTS is
# downloaded from nodejs.org (checksum verified) into %USERPROFILE%\.quantum-sculpting\node.
# Nothing is installed system-wide and PATH is not changed.
param(
    [switch]$IfChanged,     # do nothing when web\ has not changed since the last build
    [switch]$NoDownload     # never download Node: skip the build when no toolchain is found
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$NodeVersion = "v24.21.0"
$PnpmVersion = "10"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$web = Join-Path $root "web"
$out = Join-Path $root "app\static\studio"
$homeDir = Join-Path $env:USERPROFILE ".quantum-sculpting"
$nodeDir = Join-Path $homeDir "node"
$work = Join-Path $homeDir "web-build"
$stamp = Join-Path $homeDir "web.sha256"

function Get-WebHash {
    # every source file's path and content; node_modules never counts
    $lines = Get-ChildItem $web -Recurse -File |
        Where-Object { $_.FullName -notmatch '\\node_modules\\' } |
        Sort-Object FullName |
        ForEach-Object { $_.FullName.Substring($web.Length) + "|" + (Get-FileHash $_.FullName -Algorithm SHA256).Hash }
    $bytes = [Text.Encoding]::UTF8.GetBytes(($lines -join "`n"))
    $sha = [Security.Cryptography.SHA256]::Create()
    return ([BitConverter]::ToString($sha.ComputeHash($bytes)) -replace "-", "")
}

function Find-Toolchain {
    # the folder to put first on PATH, "" when PATH already has node and pnpm, $null when there is none
    if ((Test-Path (Join-Path $nodeDir "node.exe")) -and (Test-Path (Join-Path $nodeDir "pnpm.cmd"))) { return $nodeDir }
    if ((Get-Command node -ErrorAction SilentlyContinue) -and (Get-Command pnpm -ErrorAction SilentlyContinue)) { return "" }
    return $null
}

function Install-Toolchain {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    New-Item -ItemType Directory -Force $homeDir | Out-Null
    if (-not (Test-Path (Join-Path $nodeDir "node.exe"))) {
        $name = "node-$NodeVersion-win-x64"
        $zip = Join-Path $env:TEMP "$name.zip"
        $base = "https://nodejs.org/dist/$NodeVersion"
        Write-Host "Downloading $name.zip from nodejs.org (about 35 MB)..."
        Invoke-WebRequest "$base/$name.zip" -OutFile $zip -UseBasicParsing
        $sums = (Invoke-WebRequest "$base/SHASUMS256.txt" -UseBasicParsing).Content
        if ($sums -is [byte[]]) { $sums = [Text.Encoding]::ASCII.GetString($sums) }
        $line = ($sums -split "`n") | Where-Object { $_ -like "*  $name.zip*" } | Select-Object -First 1
        $want = ""
        if ($line) { $want = ($line.Trim() -split "\s+")[0] }
        $have = (Get-FileHash $zip -Algorithm SHA256).Hash
        if (-not $want -or ($want.ToUpper() -ne $have)) {
            Remove-Item $zip -Force
            throw "The Node download does not match the checksum nodejs.org publishes for it."
        }
        $unpack = Join-Path $homeDir "node-unpack"
        if (Test-Path $unpack) { Remove-Item $unpack -Recurse -Force }
        New-Item -ItemType Directory -Force $unpack | Out-Null
        Write-Host "Unpacking Node $NodeVersion into $nodeDir"
        & tar.exe -xf $zip -C $unpack
        if ($LASTEXITCODE -ne 0) { Expand-Archive -Path $zip -DestinationPath $unpack -Force }
        if (Test-Path $nodeDir) { Remove-Item $nodeDir -Recurse -Force }
        Move-Item (Join-Path $unpack $name) $nodeDir
        Remove-Item $unpack -Recurse -Force
        Remove-Item $zip -Force
    }
    if (-not (Test-Path (Join-Path $nodeDir "pnpm.cmd"))) {
        Write-Host "Installing pnpm $PnpmVersion next to it"
        $env:Path = "$nodeDir;$env:Path"
        & (Join-Path $nodeDir "npm.cmd") install --global --no-fund --no-audit "pnpm@$PnpmVersion"
        if ($LASTEXITCODE -ne 0) { throw "Could not install pnpm." }
    }
}

if (-not (Test-Path (Join-Path $web "package.json"))) { throw "There is no web\ folder to build." }

$hash = Get-WebHash
if ($IfChanged -and (Test-Path (Join-Path $out "index.html")) -and (Test-Path $stamp)) {
    if ((Get-Content $stamp -Raw).Trim() -eq $hash) { exit 0 }
}

$bin = Find-Toolchain
if ($null -eq $bin) {
    if ($NoDownload) {
        Write-Host "The new interface is not built (or out of date) and Node is not set up. Run build-web.bat once."
        exit 0
    }
    Install-Toolchain
    $bin = $nodeDir
}
if ($bin) { $env:Path = "$bin;$env:Path" }

Write-Host "Building the interface (node $(& node --version), pnpm $(& pnpm --version))..."
New-Item -ItemType Directory -Force $work | Out-Null
$copy = Join-Path $work "web"
& robocopy $web $copy /MIR /XD node_modules /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Could not copy web\ to $copy." }

Push-Location $copy
try {
    & pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw "pnpm install failed. Check your connection and run this again." }
    & pnpm build
    if ($LASTEXITCODE -ne 0) { throw "The interface did not build. The messages above say where." }
} finally {
    Pop-Location
}

$built = Join-Path $work "app\static\studio"
if (-not (Test-Path (Join-Path $built "index.html"))) { throw "The build produced no index.html." }
& robocopy $built $out /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Could not copy the build into $out." }
Set-Content -Path $stamp -Value $hash -Encoding ascii
Write-Host "Built into app\static\studio. The service serves it at / and the original interface at /classic."
exit 0
