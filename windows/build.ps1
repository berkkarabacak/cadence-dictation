Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
python -m pip install -r requirements.txt
python -m PyInstaller --noconfirm --onefile --windowed --name Cadence cadence_app.py
$exe = Join-Path $PSScriptRoot "dist\Cadence.exe"
$dest = Join-Path ([Environment]::GetFolderPath("Desktop")) "Cadence.exe"
if (Test-Path $exe) {
  Copy-Item $exe $dest -Force
  Write-Host "Built $dest"
} else {
  throw "Cadence.exe was not built"
}
