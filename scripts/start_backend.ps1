param(
    [string]$DataFolder = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

$VenvPath = Join-Path $RepoRoot ".venv"
$ActivateScript = Join-Path $VenvPath "Scripts\\Activate.ps1"

function Get-PythonCommand {
    if (Get-Command python -ErrorAction SilentlyContinue) {
        return "python"
    }
    if (Get-Command py -ErrorAction SilentlyContinue) {
        return "py"
    }
    throw "Python not found. Install Python 3.11+ and ensure it is on PATH."
}

$Python = Get-PythonCommand

if (-not (Test-Path $VenvPath)) {
    & $Python -m venv $VenvPath
}

if (-not (Test-Path $ActivateScript)) {
    throw "Virtual environment activation script not found at $ActivateScript"
}

. $ActivateScript

python -m pip install --upgrade pip
python -m pip install -r (Join-Path $RepoRoot "requirements.txt")

if ([string]::IsNullOrWhiteSpace($DataFolder)) {
    $DefaultData = Join-Path $RepoRoot "backend\\data\\runs"
    if (Test-Path $DefaultData) {
        python backend/run_server.py $DefaultData
    } else {
        python backend/run_server.py
    }
} else {
    python backend/run_server.py $DataFolder
}
