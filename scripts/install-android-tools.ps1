$ErrorActionPreference = 'Stop'
$toolPaths = Get-Content -LiteralPath 'D:\CodexToolchains\daily-lexicon\paths.json' -Raw | ConvertFrom-Json
$env:JAVA_HOME = $toolPaths.java
$env:ANDROID_HOME = $toolPaths.android
$env:GRADLE_USER_HOME = 'D:\CodexToolchains\daily-lexicon\gradle-cache'
$env:Path = "$($toolPaths.java)\bin;$env:Path"
$manager = Join-Path $toolPaths.android 'cmdline-tools\latest\bin\sdkmanager.bat'
(1..120 | ForEach-Object {'y'}) | & $manager "--sdk_root=$($toolPaths.android)" --licenses *> 'D:\CodexToolchains\daily-lexicon\sdk-licenses.log'
$packageFile = 'D:\CodexToolchains\daily-lexicon\sdk-packages.txt'
"platforms;android-36`nbuild-tools;36.0.0" | Set-Content -LiteralPath $packageFile -Encoding ascii
& $manager "--sdk_root=$($toolPaths.android)" "--package_file=$packageFile" *> 'D:\CodexToolchains\daily-lexicon\sdk-install.log'
if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath 'D:\CodexToolchains\daily-lexicon\sdk-install.log' -Tail 35; exit $LASTEXITCODE }
Get-Content -LiteralPath 'D:\CodexToolchains\daily-lexicon\sdk-install.log' -Tail 8
