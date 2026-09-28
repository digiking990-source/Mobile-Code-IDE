param(
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory,
  [Parameter(Mandatory = $true)]
  [string]$ZipPath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $OutputDirectory -PathType Container)) {
  throw "Phone install folder was not created: $OutputDirectory"
}

$packageFiles = Get-ChildItem -LiteralPath $OutputDirectory -File
if (-not ($packageFiles | Where-Object { $_.Name -eq "CodeStudio.apk" })) {
  throw "The fresh APK is missing from the phone install folder."
}

Compress-Archive -Path (Join-Path $OutputDirectory "*") -DestinationPath $ZipPath -Force
Write-Output "Created phone install package: $ZipPath"
