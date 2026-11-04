param([string]$ToolchainRoot = 'D:\CodexToolchains\daily-lexicon')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pathsFile = Join-Path $ToolchainRoot 'paths.json'
if (-not (Test-Path -LiteralPath $pathsFile)) { throw 'Prepare JDK 21 and Android SDK first; see README.' }
$toolPaths = Get-Content -LiteralPath $pathsFile -Raw | ConvertFrom-Json
$env:JAVA_HOME = $toolPaths.java
$env:ANDROID_HOME = $toolPaths.android
$env:GRADLE_USER_HOME = Join-Path $ToolchainRoot 'gradle-cache'
$env:Path = "$($toolPaths.java)\bin;$env:Path"
$sdkPath = $toolPaths.android.Replace('\','/')
"sdk.dir=$sdkPath" | Set-Content -LiteralPath (Join-Path $projectRoot 'android/local.properties') -Encoding ascii
Push-Location (Join-Path $projectRoot 'android')
try {
  & .\gradlew.bat assembleDebug --console=plain --no-daemon
  if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
} finally { Pop-Location }
