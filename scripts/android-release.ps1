# Careshift AI — Android release build (item 12).
#
# Prerequisites:
#   - JDK 17+, Android SDK (ANDROID_SDK_ROOT or ANDROID_HOME), Android Studio
#     or cmdline-tools with `platforms;android-35` + `build-tools`
#   - A signing keystore OUTSIDE the repo, e.g.:
#       keytool -genkey -v -keystore %USERPROFILE%\keys\careshift.jks \
#         -alias careshift -keyalg RSA -keysize 2048 -validity 10000
#
# Usage (PowerShell):
#   $env:API_ORIGIN = "https://careshift.example.com"
#   $env:CS_KEYSTORE_PATH = "$env:USERPROFILE\keys\careshift.jks"
#   $env:CS_KEYSTORE_PASSWORD = "…"     # from a secrets manager — never inline
#   $env:CS_KEY_ALIAS = "careshift"
#   $env:CS_KEY_PASSWORD = "…"
#   ./scripts/android-release.ps1 [-Bump patch] [-Aab]
#
# Produces android/app/build/outputs/bundle/release/app-release.aab
#          android/app/build/outputs/apk/release/app-release.apk
param(
  [ValidateSet("major","minor","patch")] [string]$Bump = "patch",
  [switch]$Aab  # bundle (Play Store) in addition to the APK
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not $env:API_ORIGIN) { throw "API_ORIGIN is required (deployed https origin)" }
if (-not ($env:ANDROID_SDK_ROOT -or $env:ANDROID_HOME)) {
  throw "Android SDK not found — set ANDROID_SDK_ROOT"
}
$sdk = $env:ANDROID_SDK_ROOT; if (-not $sdk) { $sdk = $env:ANDROID_HOME }
Write-Host "SDK: $sdk"

# 1) platform project
if (-not (Test-Path "android")) {
  Write-Host "==> npx cap add android"
  npx cap add android
}

# 2) sync the web shell config (capacitor.config.ts reads API_ORIGIN)
Write-Host "==> npx cap sync (API_ORIGIN=$env:API_ORIGIN)"
npx cap sync

# 3) HTTPS-only network security config
$resXml = "android/app/src/main/res/xml"
New-Item -ItemType Directory -Force $resXml | Out-Null
Copy-Item "scripts/android/network_security_config.xml" "$resXml/network_security_config.xml" -Force
$manifest = "android/app/src/main/AndroidManifest.xml"
$xml = Get-Content $manifest -Raw
if ($xml -notmatch "networkSecurityConfig") {
  $xml = $xml -replace '(<application\s)', '$1android:networkSecurityConfig="@xml/network_security_config" '
  Set-Content $manifest $xml -NoNewline
  Write-Host "==> manifest patched: networkSecurityConfig"
}

# 4) version bump (versionCode always +1; versionName by -Bump)
$gradle = "android/app/build.gradle"
$g = Get-Content $gradle -Raw
$vc = [int]([regex]::Match($g, 'versionCode\s+(\d+)').Groups[1].Value) + 1
$vn = [regex]::Match($g, 'versionName\s+"([^"]+)"').Groups[1].Value
$parts = $vn.Split('.') | ForEach-Object { [int]$_ }
switch ($Bump) { "major" { $parts[0]++ } "minor" { $parts[1]++ } default { $parts[2]++ } }
$vnNew = $parts -join "."
$g = [regex]::Replace($g, 'versionCode\s+\d+', "versionCode $vc")
$g = [regex]::Replace($g, 'versionName\s+"[^"]+"', "versionName `"$vnNew`"")
Set-Content $gradle $g -NoNewline
Write-Host "==> version $vn -> $vnNew (code $vc)"

# 5) signing via env-provided credentials — keystore stays outside the repo
$gradleProps = "android/gradle.properties"
Add-Content $gradleProps @"
CARESHIFT_UPLOAD_STORE_FILE=$($env:CS_KEYSTORE_PATH -replace '\\','/')
CARESHIFT_UPLOAD_KEY_ALIAS=$env:CS_KEY_ALIAS
CARESHIFT_UPLOAD_STORE_PASSWORD=$env:CS_KEYSTORE_PASSWORD
CARESHIFT_UPLOAD_KEY_PASSWORD=$env:CS_KEY_PASSWORD
"@
Write-Host "==> signing config injected into gradle.properties (env-only secrets)"

# NOTE: build.gradle must declare a release signingConfig reading these
# CARESHIFT_UPLOAD_* properties (see docs/android.md — step is manual once).

Push-Location android
try {
  & ./gradlew.bat assembleRelease
  if ($Aab) { & ./gradlew.bat bundleRelease }
} finally { Pop-Location }

Write-Host "==> done. Outputs under android/app/build/outputs/"
Write-Host "==> R8/ProGuard: release builds already run R8; keep rules minimal —"
Write-Host "    Capacitor core needs -keep class com.getcapacitor.** { *; }"
